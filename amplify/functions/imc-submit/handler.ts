import { createHash, randomBytes } from 'node:crypto'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { APIGatewayProxyHandler } from 'aws-lambda'

const dynamodb = new DynamoDBClient({})
const ses = new SESv2Client({})
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
  const phone = normalizePhone(data.clientPhone)
  const email = typeof data.email === 'string' ? data.email.trim() : ''
  const objectives = ['Emagrecimento', 'Musculação', 'Outros']
  const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
  const shifts = ['Manhã', 'Tarde', 'Noite']
  const trainingDays = data.trainingDays
  const trainingShifts = data.trainingShifts

  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) &&
    Boolean(phone) &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(String(city)) &&
    (data.age === undefined || (Number.isInteger(data.age) && Number(data.age) >= 1 && Number(data.age) <= 120)) &&
    (data.objective === '' || objectives.includes(String(data.objective))) &&
    Array.isArray(trainingDays) && trainingDays.every(day => days.includes(String(day))) &&
    Array.isArray(trainingShifts) && trainingShifts.every(shift => shifts.includes(String(shift)))
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return ''
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? `+${digits}` : ''
}

function normalizeInstagram(value: unknown) {
  if (typeof value !== 'string') return ''
  let handle = value.trim()
  if (!handle) return ''
  if (/^https?:\/\//i.test(handle)) {
    try {
      const profileUrl = new URL(handle)
      if (!['instagram.com', 'www.instagram.com'].includes(profileUrl.hostname.toLowerCase())) return ''
      handle = profileUrl.pathname.replace(/^\/+|\/+$/g, '')
    } catch {
      return ''
    }
  }
  handle = handle.replace(/^@/, '')
  return /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : ''
}

function isValidTrainerSignup(data: Record<string, unknown> | null) {
  if (!data || data.type !== 'trainerSignup') return false
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : ''
  const email = typeof data.email === 'string' ? data.email.trim() : ''
  const cities = data.cities
  const cref = typeof data.cref === 'string' ? data.cref.trim() : ''
  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) &&
    Boolean(normalizePhone(data.phone)) && Boolean(normalizeInstagram(data.instagram)) &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    Array.isArray(cities) && cities.length >= 1 && cities.length <= 2 &&
    new Set(cities).size === cities.length &&
    cities.every(city => ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(String(city))) &&
    cref.length <= 40 && (cref === '' || /^[\p{L}\p{M}0-9 .\/-]+$/u.test(cref))
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

async function createCode() {
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

async function sendRequestEmail(data: Record<string, unknown>, code: string) {
  const recipient = process.env.BETA_EMAIL_ADDRESS
  const sender = process.env.SES_FROM_EMAIL
  if (!recipient || !sender) throw new Error('Email delivery is not configured')
  const age = data.age === undefined ? '' : `${data.age} anos`
  const days = Array.isArray(data.trainingDays) ? data.trainingDays.join(', ') : ''
  const shifts = Array.isArray(data.trainingShifts) ? data.trainingShifts.join(', ') : ''
  const lines = [
    'Nova solicitação de ajuda de personal trainer',
    '',
    `Nome: ${String(data.clientName).trim()}`,
    `WhatsApp: ${normalizePhone(data.clientPhone)}`,
    ...(typeof data.email === 'string' && data.email.trim() ? [`E-mail: ${data.email.trim()}`] : []),
    ...(age ? [`Idade: ${age}`] : []),
    `Cidade: ${String(data.city).trim()}`,
    ...(typeof data.objective === 'string' && data.objective ? [`Objetivo: ${data.objective}`] : []),
    ...(days ? [`Dias disponíveis: ${days}`] : []),
    ...(shifts ? [`Turnos disponíveis: ${shifts}`] : []),
    '',
    `Código de validação (válido por 15 minutos): ${code}`,
  ]
  await ses.send(new SendEmailCommand({
    FromEmailAddress: sender,
    Destination: { ToAddresses: [recipient] },
    Content: { Simple: {
      Subject: { Data: 'Nova solicitação de personal trainer', Charset: 'UTF-8' },
      Body: { Text: { Data: lines.join('\n'), Charset: 'UTF-8' } },
    } },
  }))
}

async function sendTrainerSignupEmail(data: Record<string, unknown>) {
  const recipient = process.env.BETA_EMAIL_ADDRESS
  const sender = process.env.SES_FROM_EMAIL
  if (!recipient || !sender || !Array.isArray(data.cities)) throw new Error('Email delivery is not configured')
  const lines = [
    'Novo cadastro de personal trainer para análise manual',
    '',
    `Nome completo: ${String(data.name).trim()}`,
    `Telefone/WhatsApp: ${normalizePhone(data.phone)}`,
    ...(typeof data.email === 'string' && data.email.trim() ? [`E-mail: ${data.email.trim()}`] : []),
    `Cidades de atuação: ${data.cities.join(', ')}`,
    `Instagram: ${normalizeInstagram(data.instagram)}`,
    ...(typeof data.cref === 'string' && data.cref.trim() ? [`Registro do conselho de EF: ${data.cref.trim()}`] : []),
    '',
    'Este cadastro aguarda validação manual e não ativa o profissional automaticamente.',
  ]
  await ses.send(new SendEmailCommand({
    FromEmailAddress: sender,
    Destination: { ToAddresses: [recipient] },
    Content: { Simple: {
      Subject: { Data: 'Cadastro de personal trainer para análise', Charset: 'UTF-8' },
      Body: { Text: { Data: lines.join('\n'), Charset: 'UTF-8' } },
    } },
  }))
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
  if (data?.type === 'trainerSignup') {
    if (!isValidTrainerSignup(data)) return response(400, { error: 'Confira os dados do cadastro.' })
    try {
      await sendTrainerSignupEmail(data)
      return response(201, { sent: true })
    } catch (error) {
      console.error('[imc-submit] Trainer signup email delivery failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
      })
      return response(503, { error: 'Não foi possível enviar o cadastro agora. Tente novamente.' })
    }
  }
  if (!isValidRequest(data)) return response(400, { error: 'Confira os dados e o consentimento.' })

  try {
    const issued = await createCode()
    await sendRequestEmail(data!, issued.code)
    return response(201, { sent: true })
  } catch (error) {
    console.error('[imc-submit] Request email delivery failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível preparar a solicitação agora.' })
  }
}
