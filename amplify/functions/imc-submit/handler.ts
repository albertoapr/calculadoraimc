import { createHash, randomBytes } from 'node:crypto'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyHandler } from 'aws-lambda'

const dynamodb = new DynamoDBClient({})
const codeLifetimeSeconds = 15 * 60
const corsHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type',
  'access-control-allow-methods': 'POST,OPTIONS',
}

function response(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) }
}

function parseBody(event: Parameters<APIGatewayProxyHandler>[0]) {
  if (typeof event.body !== 'string') return null
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (Buffer.byteLength(body, 'utf8') > 8192) return null
  try { return JSON.parse(body) as Record<string, unknown> } catch { return null }
}

function isValidRequest(data: Record<string, unknown> | null) {
  if (!data || data.consent !== true) return false
  const name = typeof data.clientName === 'string' ? data.clientName.trim().replace(/\s+/g, ' ') : ''
  const city = typeof data.city === 'string' ? data.city.trim().replace(/\s+/g, ' ') : ''
  const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
  const shifts = ['Manhã', 'Tarde', 'Noite']
  const trainingDays = data.trainingDays
  const trainingShifts = data.trainingShifts

  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) &&
    ['Mesquita', 'Nilópolis', 'Nova Iguaçu'].includes(String(city)) &&
    Number.isInteger(data.age) && Number(data.age) >= 1 && Number(data.age) <= 120 &&
    ['feminino', 'masculino'].includes(String(data.sex)) &&
    typeof data.weight === 'number' && Number.isInteger(data.weight) && data.weight >= 20 && data.weight <= 200 &&
    typeof data.heightCm === 'number' && Number.isInteger(data.heightCm) && data.heightCm >= 80 && data.heightCm <= 200 &&
    typeof data.imc === 'number' && Number.isFinite(data.imc) &&
    Math.abs(data.weight / ((data.heightCm / 100) ** 2) - data.imc) <= 0.11 &&
    Array.isArray(trainingDays) && trainingDays.length > 0 && trainingDays.every(day => days.includes(String(day))) &&
    Array.isArray(trainingShifts) && trainingShifts.length > 0 && trainingShifts.every(shift => shifts.includes(String(shift)))
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

async function createCode(data: Record<string, unknown>) {
  const tableName = process.env.IMC_REQUESTS_TABLE
  if (!tableName) throw new Error('Request table is not configured')

  const code = randomBytes(16).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + codeLifetimeSeconds
  await dynamodb.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      codeHash: { S: hashCode(code) },
      expiresAt: { N: String(expiresAt) },
    },
    ConditionExpression: 'attribute_not_exists(codeHash)',
  }))
  return { code, expiresAt }
}

async function consumeCode(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code : ''
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return response(200, { valid: false })

  const tableName = process.env.IMC_REQUESTS_TABLE
  if (!tableName) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  try {
    await dynamodb.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { codeHash: { S: hashCode(code) } },
      UpdateExpression: 'SET consumedAt = :now',
      ConditionExpression: 'attribute_exists(codeHash) AND expiresAt > :now AND attribute_not_exists(consumedAt)',
      ExpressionAttributeValues: { ':now': { N: String(now) } },
    }))
    return response(200, { valid: true })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return response(200, { valid: false })
    console.error('[imc-submit] Code verification failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível validar o código agora.' })
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método não permitido.' })

  const data = parseBody(event)
  if (event.resource?.endsWith('/verify')) return consumeCode(data)
  if (!isValidRequest(data)) return response(400, { error: 'Confira os dados e o consentimento.' })

  try {
    const issued = await createCode(data!)
    return response(201, issued)
  } catch (error) {
    console.error('[imc-submit] Code creation failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível preparar a solicitação agora.' })
  }
}
