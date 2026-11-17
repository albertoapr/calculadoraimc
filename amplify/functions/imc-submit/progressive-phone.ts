import { createHash, randomBytes } from 'node:crypto'
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

/**
 * First-stage verification for progressive signup.
 * Kept separate from legacy customer/trainer registration until the full
 * identity/role migration and finalization flow have been reviewed.
 */
const db = new DynamoDBClient({})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const reply = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Fitpeso-Verification-Secret',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
})
const validCode = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s)
const validSession = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)
function normalizeWhatsApp(value: unknown) {
  if (typeof value !== 'string') return ''
  let digits = value.replace(/\D/g, '').replace(/^0/, '')
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? '+' + digits : ''
}
function parse(event: APIGatewayProxyEvent) {
  if (!event.body || Buffer.byteLength(event.body, 'utf8') > 8192) return null
  try {
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
    return JSON.parse(body) as Record<string, unknown>
  } catch { return null }
}
async function registered(whatsapp: string) {
  const customersTable = process.env.FITPESO_CUSTOMERS_TABLE!
  const trainerTable = process.env.TRAINERS_TABLE!
  const customer = await db.send(new GetItemCommand({
    TableName: customersTable, Key: { whatsapp: { S: whatsapp } }, ConsistentRead: true,
  }))
  if (customer.Item) return true
  for (const city of ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro', 'UNASSIGNED']) {
    let cursor: Record<string, any> | undefined
    do {
      const page = await db.send(new QueryCommand({
        TableName: trainerTable, KeyConditionExpression: '#city = :city',
        ExpressionAttributeNames: { '#city': 'city' },
        ExpressionAttributeValues: { ':city': { S: city } },
        ProjectionExpression: 'whatsapp', ExclusiveStartKey: cursor,
      }))
      if (page.Items?.some(item => normalizeWhatsApp(item.whatsapp?.S) === whatsapp)) return true
      cursor = page.LastEvaluatedKey
    } while (cursor)
  }
  return false
}
export async function startPhoneSignup(event: APIGatewayProxyEvent) {
  const data = parse(event)
  const whatsapp = normalizeWhatsApp(data?.whatsapp)
  if (!whatsapp || !validSession(data?.sessionToken)) return reply(400, { error: 'Informe WhatsApp e sessão válidos.' })
  if (!process.env.FITPESO_CUSTOMERS_TABLE || !process.env.TRAINERS_TABLE || !process.env.IMC_REQUESTS_TABLE) {
    return reply(503, { error: 'Cadastro temporariamente indisponível.' })
  }
  try {
    if (await registered(whatsapp)) {
      return reply(409, { registered: true, error: 'Este WhatsApp já possui cadastro. Entre na sua conta.' })
    }
    const code = randomBytes(16).toString('base64url')
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60
    await db.send(new PutItemCommand({
      TableName: process.env.IMC_REQUESTS_TABLE,
      Item: { codeHash: { S: hash(code) }, flow: { S: 'fitpeso-progressive-phone' },
        whatsapp: { S: whatsapp }, sessionHash: { S: hash(data!.sessionToken as string) },
        expiresAt: { N: String(expiresAt) } },
      ConditionExpression: 'attribute_not_exists(codeHash)',
    }))
    // The code is for a prefilled message TO Beta; Beta never sends it to the user.
    return reply(201, { started: true, verificationCode: code, expiresAt })
  } catch (error) {
    console.error('[signup] Phone start failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível iniciar a verificação.' })
  }
}
export async function phoneSignupStatus(event: APIGatewayProxyEvent) {
  const data = parse(event)
  if (!validCode(data?.code) || !validSession(data?.sessionToken)) return reply(400, { verified: false })
  if (!process.env.IMC_REQUESTS_TABLE) return reply(503, { error: 'Verificação indisponível.' })
  try {
    const result = await db.send(new GetItemCommand({
      TableName: process.env.IMC_REQUESTS_TABLE, Key: { codeHash: { S: hash(data!.code as string) } },
      ConsistentRead: true,
    }))
    const challenge = result.Item
    if (challenge?.flow?.S !== 'fitpeso-progressive-phone' || challenge.sessionHash?.S !== hash(data!.sessionToken as string)) {
      return reply(200, { verified: false })
    }
    const expired = Number(challenge.expiresAt?.N ?? 0) <= Math.floor(Date.now() / 1000)
    return reply(200, { verified: !expired && Boolean(challenge.consumedAt?.N), expired })
  } catch (error) {
    console.error('[signup] Phone status failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível consultar a confirmação.' })
  }
}
export async function verifyPhoneSignupFromBeta(event: APIGatewayProxyEvent) {
  const expected = process.env.TRAINER_WHATSAPP_VERIFY_SECRET
  const supplied = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === 'x-fitpeso-verification-secret')?.[1]
  if (!expected || !supplied || hash(expected) !== hash(supplied)) return reply(403, { error: 'Acesso não autorizado.' })
  const data = parse(event)
  const whatsapp = normalizeWhatsApp(data?.whatsapp)
  if (!whatsapp || !validCode(data?.code)) return reply(200, { verified: false })
  if (!process.env.IMC_REQUESTS_TABLE) return reply(503, { error: 'Verificação indisponível.' })
  try {
    await db.send(new UpdateItemCommand({
      TableName: process.env.IMC_REQUESTS_TABLE, Key: { codeHash: { S: hash(data!.code as string) } },
      UpdateExpression: 'SET consumedAt = :now',
      ConditionExpression: '#flow = :flow AND whatsapp = :phone AND expiresAt > :now AND attribute_not_exists(consumedAt)',
      ExpressionAttributeNames: { '#flow': 'flow' },
      ExpressionAttributeValues: {
        ':flow': { S: 'fitpeso-progressive-phone' },
        ':phone': { S: whatsapp },
        ':now': { N: String(Math.floor(Date.now() / 1000)) },
      },
    }))
    return reply(200, { verified: true })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return reply(200, { verified: false })
    console.error('[signup] Phone verification failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível confirmar o WhatsApp.' })
  }
}
