import { createHash, randomUUID } from 'node:crypto'
import {
  DynamoDBClient, GetItemCommand, QueryCommand,
  TransactWriteItemsCommand, UpdateItemCommand, type AttributeValue, type TransactWriteItem,
} from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import { isAcademySlug, suggestAcademySlug } from '../../../shared/academy-slug'

type Event = Parameters<APIGatewayProxyHandler>[0]
type RecordItem = Record<string, AttributeValue>
const allowedCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
const table = () => process.env.ACADEMIES_TABLE
const client = new DynamoDBClient({})
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
}
const reply = (statusCode: number, body: Record<string, unknown>) =>
  ({ statusCode, headers, body: JSON.stringify(body) })

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function textField(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length <= max ? clean : null
}
function readBody(event: Event) {
  if (typeof event.body !== 'string') return null
  const bodyText = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (Buffer.byteLength(bodyText, 'utf8') > 8192) return null
  try { return JSON.parse(bodyText) as Record<string, unknown> } catch { return null }
}
function parseAcademy(event: Event) {
  const body = readBody(event)
  const name = textField(body?.name, 80)
  const city = textField(body?.city, 50)
  const neighborhood = textField(body?.neighborhood, 80)
  const address = textField(body?.address ?? '', 160)
  const zipCode = textField(body?.zipCode ?? '', 9)
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
  if (!name || name.length < 2 || !city || !allowedCities.includes(city) ||
      !neighborhood || neighborhood.length < 2 || address === null || zipCode === null ||
      (zipCode !== '' && !/^\d{5}-?\d{3}$/.test(zipCode)) ||
      (body?.active !== undefined && typeof body.active !== 'boolean') ||
      (body?.slug !== undefined && (typeof body.slug !== 'string' || (slug !== '' && !isAcademySlug(slug))))) return null
  return { name, city, neighborhood, address, zipCode, slug, active: body?.active !== false }
}
function keyFor(value: { name: string; city: string; neighborhood: string }) {
  return 'LOCK#' + createHash('sha256')
    .update([value.city, value.neighborhood, value.name].map(normalize).join('|'))
    .digest('hex')
}
function toItem(academyId: string, values: NonNullable<ReturnType<typeof parseAcademy>>, createdAt: string, updatedBy: string): RecordItem {
  return {
    academyId: { S: academyId },
    ...(values.slug ? { slug: { S: values.slug } } : {}),
    name: { S: values.name },
    city: { S: values.city },
    neighborhood: { S: values.neighborhood },
    address: { S: values.address },
    zipCode: { S: values.zipCode },
    state: { S: 'RJ' },
    active: { BOOL: values.active },
    createdAt: { S: createdAt },
    updatedAt: { S: new Date().toISOString() },
    updatedBy: { S: updatedBy },
  }
}
function publicItem(item: RecordItem) {
  return {
    academyId: item.academyId?.S ?? '',
    ...(item.slug?.S ? { slug: item.slug.S } : {}),
    name: item.name?.S ?? '',
    city: item.city?.S ?? '',
    neighborhood: item.neighborhood?.S ?? '',
    state: item.state?.S ?? 'RJ',
    address: item.address?.S ?? '',
    zipCode: item.zipCode?.S ?? '',
    active: item.active?.BOOL === true,
    createdAt: item.createdAt?.S ?? '',
    updatedAt: item.updatedAt?.S ?? '',
  }
}
function lockItem(lockId: string, academyId: string): RecordItem {
  return { academyId: { S: lockId }, ownerAcademyId: { S: academyId } }
}
function reserveSlug(tableName: string, slug: string, academyId: string): TransactWriteItem {
  return { Put: {
    TableName: tableName,
    Item: lockItem('SLUG#' + slug, academyId),
    ConditionExpression: 'attribute_not_exists(academyId)',
  } }
}
function failedConditional(error: unknown) {
  return error instanceof Error &&
    ['ConditionalCheckFailedException', 'TransactionCanceledException'].includes(error.name)
}
async function queryCity(tableName: string, city: string) {
  const found: RecordItem[] = []
  let cursor: RecordItem | undefined
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'AcademiesByCity',
      KeyConditionExpression: '#c = :c',
      ExpressionAttributeNames: { '#c': 'city' },
      ExpressionAttributeValues: { ':c': { S: city } },
      ExclusiveStartKey: cursor,
    }))
    found.push(...(result.Items ?? []))
    cursor = result.LastEvaluatedKey
  } while (cursor)
  return found
}
export async function listAcademies(event: Event, administrator = false) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const city = event.queryStringParameters?.city?.trim() ?? ''
  if (city && !allowedCities.includes(city)) return reply(400, { error: 'Cidade inválida.' })
  try {
    const cities = city ? [city] : allowedCities
    const result = await Promise.all(cities.map(value => queryCity(tableName, value)))
    const academies = result.flat().map(publicItem)
      .filter(item => administrator || item.active)
      .sort((a, b) => a.city.localeCompare(b.city, 'pt-BR') ||
        a.name.localeCompare(b.name, 'pt-BR') ||
        a.neighborhood.localeCompare(b.neighborhood, 'pt-BR'))
    return reply(200, { academies })
  } catch (error) {
    console.error('[academies] List failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível consultar as academias.' })
  }
}
export async function getAcademy(event: Event, administrator = false) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const academyId = event.pathParameters?.academyId ?? ''
  if (!/^[a-f0-9-]{36}$/i.test(academyId)) return reply(404, { error: 'Academia não encontrada.' })
  try {
    const result = await client.send(new GetItemCommand({
      TableName: tableName, Key: { academyId: { S: academyId } },
      ConsistentRead: true,
    }))
    if (!result.Item || (!administrator && result.Item.active?.BOOL !== true))
      return reply(404, { error: 'Academia não encontrada.' })
    return reply(200, { academy: publicItem(result.Item) })
  } catch {
    return reply(503, { error: 'Não foi possível consultar a academia.' })
  }
}
export async function getAcademyBySlug(event: Event) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const slug = event.pathParameters?.slug ?? ''
  const notFound = () => reply(404, { error: 'Academia não encontrada.' })
  if (!isAcademySlug(slug)) return notFound()
  try {
    const { Item: reservation } = await client.send(new GetItemCommand({
      TableName: tableName, Key: { academyId: { S: 'SLUG#' + slug } }, ConsistentRead: true,
    }))
    const academyId = reservation?.ownerAcademyId?.S
    if (!academyId) return notFound()
    const { Item: academy } = await client.send(new GetItemCommand({
      TableName: tableName, Key: { academyId: { S: academyId } }, ConsistentRead: true,
    }))
    if (!academy || academy.active?.BOOL !== true || academy.slug?.S !== slug) return notFound()
    return reply(200, { academy: publicItem(academy) })
  } catch {
    return reply(503, { error: 'Não foi possível consultar a academia.' })
  }
}
export async function createAcademy(event: Event, administratorPhone: string) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const values = parseAcademy(event)
  if (!values) return reply(400, { error: 'Confira os dados e use apenas letras minúsculas, números e hífens no slug.' })
  values.slug ||= suggestAcademySlug(values.name, values.neighborhood)
  if (!isAcademySlug(values.slug)) return reply(400, { error: 'Informe um slug válido para a academia.' })
  const academyId = randomUUID()
  const now = new Date().toISOString()
  const lockId = keyFor(values)
  try {
    await client.send(new TransactWriteItemsCommand({
      TransactItems: [
        { Put: { TableName: tableName, Item: lockItem(lockId, academyId), ConditionExpression: 'attribute_not_exists(academyId)' } },
        reserveSlug(tableName, values.slug, academyId),
        { Put: { TableName: tableName, Item: toItem(academyId, values, now, administratorPhone), ConditionExpression: 'attribute_not_exists(academyId)' } },
      ],
    }))
    return reply(201, { created: true, academyId })
  } catch (error) {
    if (failedConditional(error)) return reply(409, { error: 'Já existe uma academia com este slug ou com o mesmo nome, cidade e bairro.' })
    console.error('[academies] Creation failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível cadastrar a academia.' })
  }
}
export async function updateAcademy(event: Event, administratorPhone: string) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const academyId = event.pathParameters?.academyId ?? ''
  if (!/^[a-f0-9-]{36}$/i.test(academyId)) return reply(404, { error: 'Academia não encontrada.' })
  const values = parseAcademy(event)
  if (!values) return reply(400, { error: 'Confira os dados e use apenas letras minúsculas, números e hífens no slug.' })
  try {
    const existing = await client.send(new GetItemCommand({
      TableName: tableName, Key: { academyId: { S: academyId } }, ConsistentRead: true,
    }))
    if (!existing.Item) return reply(404, { error: 'Academia não encontrada.' })
    const previousSlug = existing.Item.slug?.S ?? ''
    if (previousSlug && values.slug && previousSlug !== values.slug)
      return reply(409, { error: 'O slug publicado é fixo para preservar o link da academia.' })
    values.slug ||= previousSlug
    const oldLock = keyFor({
      name: existing.Item.name?.S ?? '',
      city: existing.Item.city?.S ?? '',
      neighborhood: existing.Item.neighborhood?.S ?? '',
    })
    const newLock = keyFor(values)
    const item = toItem(academyId, values, existing.Item.createdAt?.S ?? new Date().toISOString(), administratorPhone)
    const version = existing.Item.updatedAt?.S
    const changes: TransactWriteItem[] = [{ Put: {
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_exists(academyId) AND ' +
        (version ? 'updatedAt = :version' : 'attribute_not_exists(updatedAt)') + ' AND ' +
        (previousSlug ? 'slug = :slug' : 'attribute_not_exists(slug)'),
      ExpressionAttributeValues: version || previousSlug ? {
        ...(version ? { ':version': { S: version } } : {}),
        ...(previousSlug ? { ':slug': { S: previousSlug } } : {}),
      } : undefined,
    } }]
    if (values.slug && !previousSlug) changes.push(reserveSlug(tableName, values.slug, academyId))
    if (oldLock !== newLock) {
      changes.push(
        { Put: { TableName: tableName, Item: lockItem(newLock, academyId), ConditionExpression: 'attribute_not_exists(academyId)' } },
        { Delete: { TableName: tableName, Key: { academyId: { S: oldLock } },
          ConditionExpression: 'ownerAcademyId = :owner', ExpressionAttributeValues: { ':owner': { S: academyId } } } },
      )
    }
    await client.send(new TransactWriteItemsCommand({ TransactItems: changes }))
    return reply(200, { updated: true, academyId })
  } catch (error) {
    if (failedConditional(error)) return reply(409, { error: 'Slug ou academia duplicados, ou cadastro alterado simultaneamente. Confira os dados e tente novamente.' })
    console.error('[academies] Update failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível atualizar a academia.' })
  }
}
export async function deactivateAcademy(event: Event) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const academyId = event.pathParameters?.academyId ?? ''
  if (!/^[a-f0-9-]{36}$/i.test(academyId)) return reply(404, { error: 'Academia não encontrada.' })
  try {
    await client.send(new UpdateItemCommand({
      TableName: tableName, Key: { academyId: { S: academyId } },
      UpdateExpression: 'SET #active = :inactive, #updated = :now',
      ConditionExpression: 'attribute_exists(academyId)',
      ExpressionAttributeNames: { '#active': 'active', '#updated': 'updatedAt' },
      ExpressionAttributeValues: {
        ':inactive': { BOOL: false },
        ':now': { S: new Date().toISOString() },
      },
    }))
    return reply(200, { deactivated: true })
  } catch (error) {
    if (failedConditional(error)) return reply(404, { error: 'Academia não encontrada.' })
    return reply(503, { error: 'Não foi possível inativar a academia.' })
  }
}
