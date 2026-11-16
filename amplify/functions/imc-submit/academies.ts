import { createHash, randomUUID } from 'node:crypto'
import {
  DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand,
  TransactWriteItemsCommand, UpdateItemCommand, type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyHandler } from 'aws-lambda'

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
  if (!name || name.length < 2 || !city || !allowedCities.includes(city) ||
      !neighborhood || neighborhood.length < 2 || address === null || zipCode === null ||
      (zipCode !== '' && !/^\d{5}-?\d{3}$/.test(zipCode)) ||
      (body?.active !== undefined && typeof body.active !== 'boolean')) return null
  return { name, city, neighborhood, address, zipCode, active: body?.active !== false }
}
function keyFor(value: { name: string; city: string; neighborhood: string }) {
  return 'LOCK#' + createHash('sha256')
    .update([value.city, value.neighborhood, value.name].map(normalize).join('|'))
    .digest('hex')
}
function toItem(academyId: string, values: NonNullable<ReturnType<typeof parseAcademy>>, createdAt: string, updatedBy: string): RecordItem {
  return {
    academyId: { S: academyId },
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
export async function createAcademy(event: Event, administratorPhone: string) {
  const tableName = table()
  if (!tableName) return reply(503, { error: 'Cadastro de academias indisponível.' })
  const values = parseAcademy(event)
  if (!values) return reply(400, { error: 'Confira nome, cidade, bairro, endereço e CEP.' })
  const academyId = randomUUID()
  const now = new Date().toISOString()
  const lockId = keyFor(values)
  try {
    await client.send(new TransactWriteItemsCommand({
      TransactItems: [
        { Put: { TableName: tableName, Item: lockItem(lockId, academyId), ConditionExpression: 'attribute_not_exists(academyId)' } },
        { Put: { TableName: tableName, Item: toItem(academyId, values, now, administratorPhone), ConditionExpression: 'attribute_not_exists(academyId)' } },
      ],
    }))
    return reply(201, { created: true, academyId })
  } catch (error) {
    if (failedConditional(error)) return reply(409, { error: 'Já existe uma academia com este nome, cidade e bairro.' })
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
  if (!values) return reply(400, { error: 'Confira nome, cidade, bairro, endereço e CEP.' })
  try {
    const existing = await client.send(new GetItemCommand({
      TableName: tableName, Key: { academyId: { S: academyId } }, ConsistentRead: true,
    }))
    if (!existing.Item) return reply(404, { error: 'Academia não encontrada.' })
    const oldLock = keyFor({
      name: existing.Item.name?.S ?? '',
      city: existing.Item.city?.S ?? '',
      neighborhood: existing.Item.neighborhood?.S ?? '',
    })
    const newLock = keyFor(values)
    const item = toItem(academyId, values, existing.Item.createdAt?.S ?? new Date().toISOString(), administratorPhone)
    if (oldLock !== newLock) {
      await client.send(new TransactWriteItemsCommand({ TransactItems: [
        { Put: { TableName: tableName, Item: lockItem(newLock, academyId), ConditionExpression: 'attribute_not_exists(academyId)' } },
        { Put: { TableName: tableName, Item: item, ConditionExpression: 'attribute_exists(academyId) AND #n = :oldName AND #c = :oldCity AND #b = :oldNeighborhood',
          ExpressionAttributeNames: { '#n': 'name', '#c': 'city', '#b': 'neighborhood' },
          ExpressionAttributeValues: { ':oldName': existing.Item.name!, ':oldCity': existing.Item.city!, ':oldNeighborhood': existing.Item.neighborhood! } } },
        { Delete: { TableName: tableName, Key: { academyId: { S: oldLock } },
          ConditionExpression: 'ownerAcademyId = :owner', ExpressionAttributeValues: { ':owner': { S: academyId } } } },
      ] }))
    } else {
      await client.send(new PutItemCommand({
        TableName: tableName, Item: item, ConditionExpression: 'attribute_exists(academyId)',
      }))
    }
    return reply(200, { updated: true, academyId })
  } catch (error) {
    if (failedConditional(error)) return reply(409, { error: 'Academia duplicada ou alterada simultaneamente. Atualize e tente novamente.' })
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
      UpdateExpression: 'SET active = :inactive, updatedAt = :now',
      ConditionExpression: 'attribute_exists(academyId)',
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
