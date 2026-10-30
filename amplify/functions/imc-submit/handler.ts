import { createHash, randomBytes } from 'node:crypto'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import nodemailer from 'nodemailer'
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

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

async function getTrainerEmailsForCity(city: string) {
  const tableName = process.env.TRAINERS_TABLE
  if (!tableName) throw new Error('Trainer directory is not configured')
  const result = await dynamodb.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: '#city = :city',
    ExpressionAttributeNames: { '#city': 'city' },
    ExpressionAttributeValues: { ':city': { S: city } },
  }))
  const matchingEmails = (result.Items ?? [])
    .filter(item => item.active?.BOOL === true)
    .map(item => typeof item.email?.S === 'string' ? item.email.S.trim().toLowerCase() : '')
    .filter(email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))

  return [...new Set(matchingEmails)]
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
  const sender = process.env.GMAIL_USER
  const password = process.env.GMAIL_PASSWORD?.replace(/\s/g, '')
  if (!recipient || !sender || !password) throw new Error('Gmail SMTP delivery is not configured')
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
  ]
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: sender, pass: password },
  })
  const message = {
    from: sender,
    subject: 'Fitpeso - solicitação de personal trainer',
  }
  await transporter.sendMail({
    ...message,
    to: recipient,
    text: [...lines, '', `Código de validação (válido por 15 minutos): ${code}`].join('\n'),
  })

  let trainerEmails: string[] = []
  let professionalLookupFailed = false
  try {
    trainerEmails = await getTrainerEmailsForCity(String(data.city))
  } catch (error) {
    professionalLookupFailed = true
    console.error('[imc-submit] Trainer directory lookup failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
      errorCode: typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : undefined,
    })
  }

  let notifiedProfessionals = 0
  for (const trainerEmail of trainerEmails) {
    try {
      await transporter.sendMail({ ...message, to: trainerEmail, text: lines.join('\n') })
      notifiedProfessionals += 1
    } catch (error) {
      console.error('[imc-submit] Trainer email delivery failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
        errorCode: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
      })
    }
  }

  return {
    eligibleProfessionals: trainerEmails.length,
    notifiedProfessionals,
    professionalLookupFailed,
  }
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

  let failureStage = 'request_code_creation'
  try {
    const issued = await createCode()
    failureStage = 'gmail_smtp_delivery'
    const delivery = await sendRequestEmail(data!, issued.code)
    return response(201, { sent: true, ...delivery })
  } catch (error) {
    console.error('[imc-submit] Request email delivery failed', {
      stage: failureStage,
      errorClass: error instanceof Error ? error.name : typeof error,
      errorCode: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
    })
    return response(503, { error: 'Não foi possível preparar a solicitação agora.' })
  }
}
