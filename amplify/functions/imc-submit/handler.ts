import { createHash, randomBytes } from 'node:crypto'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactionCanceledException,
  TransactWriteItemsCommand,
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

async function getPublicTrainerById(trainerId: string) {
  const tableName = process.env.TRAINERS_TABLE
  if (!tableName) throw new Error('Trainer directory is not configured')

  const result = await dynamodb.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'TrainerById',
    KeyConditionExpression: '#trainerId = :trainerId',
    FilterExpression: '#active = :active',
    ProjectionExpression: '#name, #whatsapp, #active',
    ExpressionAttributeNames: {
      '#trainerId': 'trainerId',
      '#name': 'name',
      '#whatsapp': 'whatsapp',
      '#active': 'active',
    },
    ExpressionAttributeValues: {
      ':trainerId': { S: trainerId },
      ':active': { BOOL: true },
    },
  }))

  const item = (result.Items ?? []).find(candidate => {
    const name = candidate.name?.S?.trim() ?? ''
    return name.length >= 2 && name.length <= 80 && Boolean(normalizePhone(candidate.whatsapp?.S))
  })
  if (!item) return null
  const name = item.name?.S?.trim() ?? ''
  const whatsapp = normalizePhone(item.whatsapp?.S)
  if (!name || !whatsapp) return null

  return { name, whatsapp: whatsapp.slice(1) }
}

async function getPublicTrainerBySlug(slug: string) {
  const tableName = process.env.TRAINER_SLUGS_TABLE
  if (!tableName) throw new Error('Trainer slug directory is not configured')
  const result = await dynamodb.send(new GetItemCommand({
    TableName: tableName,
    Key: { slug: { S: slug } },
    ProjectionExpression: '#trainerId',
    ExpressionAttributeNames: { '#trainerId': 'trainerId' },
  }))
  const trainerId = result.Item?.trainerId?.S
  return trainerId ? getPublicTrainerById(trainerId) : null
}

function isValidTrainerRegistration(data: Record<string, unknown> | null) {
  if (!data) return false
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : ''
  const phone = normalizePhone(data.whatsapp)
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : ''
  const instagram = typeof data.instagram === 'string' ? data.instagram.trim() : ''
  const cref = typeof data.cref === 'string' ? data.cref.trim() : ''
  const cities = data.cities
  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) && Boolean(phone) &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) &&
    !['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda'].includes(slug) &&
    /^@[A-Za-z0-9._]{1,30}$/.test(instagram) && !instagram.includes('..') && !instagram.endsWith('.') &&
    (cref === '' || (cref.length <= 40 && /^[\p{L}\p{M}0-9 ./-]+$/u.test(cref))) &&
    Array.isArray(cities) && cities.length >= 1 && cities.length <= 2 &&
    new Set(cities).size === cities.length && cities.every(city => ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(String(city)))
}

async function registerTrainer(data: Record<string, unknown>) {
  const tableName = process.env.TRAINERS_TABLE
  if (!tableName) throw new Error('Trainer directory is not configured')
  const name = String(data.name).trim().replace(/\s+/g, ' ')
  const whatsapp = normalizePhone(data.whatsapp)
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const slug = String(data.slug).trim().toLowerCase()
  const instagram = String(data.instagram).trim()
  const cref = typeof data.cref === 'string' ? data.cref.trim() : ''
  const cities = data.cities as string[]
  const trainerId = randomBytes(16).toString('hex')
  const submittedAt = String(Math.floor(Date.now() / 1000))

  const slugTableName = process.env.TRAINER_SLUGS_TABLE
  if (!slugTableName) throw new Error('Trainer slug directory is not configured')
  await dynamodb.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: slugTableName,
          Item: { slug: { S: slug }, trainerId: { S: trainerId } },
          ConditionExpression: 'attribute_not_exists(slug)',
        },
      },
      ...cities.map(city => ({
        Put: {
          TableName: tableName,
          Item: {
            city: { S: city },
            trainerId: { S: trainerId },
            slug: { S: slug },
            name: { S: name },
            whatsapp: { S: whatsapp },
            ...(email ? { email: { S: email } } : {}),
            instagram: { S: instagram },
            ...(cref ? { cref: { S: cref } } : {}),
            active: { BOOL: false },
            status: { S: 'pending' },
            submittedAt: { N: submittedAt },
          },
          ConditionExpression: 'attribute_not_exists(city) AND attribute_not_exists(trainerId)',
        },
      })),
    ],
  }))
  return slug
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
  if (event.httpMethod === 'GET' && event.resource?.includes('/trainers/')) {
    if (event.resource.includes('/by-slug/')) {
      const slug = event.pathParameters?.slug?.trim().toLowerCase() ?? ''
      if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return response(400, { error: 'Identificador inválido.' })
      try {
        const trainer = await getPublicTrainerBySlug(slug)
        if (!trainer) return response(404, { error: 'Personal não encontrado.' })
        return response(200, { trainer })
      } catch (error) {
        console.error('[imc-submit] Public trainer slug lookup failed', {
          errorClass: error instanceof Error ? error.name : typeof error,
        })
        return response(503, { error: 'Lista de profissionais indisponível no momento.' })
      }
    }
    const trainerId = event.pathParameters?.trainerId?.trim() ?? ''
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(trainerId)) return response(400, { error: 'Identificador inválido.' })
    try {
      const trainer = await getPublicTrainerById(trainerId)
      if (!trainer) return response(404, { error: 'Personal não encontrado.' })
      return response(200, { trainer })
    } catch (error) {
      console.error('[imc-submit] Public trainer directory lookup failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
      })
      return response(503, { error: 'Lista de profissionais indisponível no momento.' })
    }
  }
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método não permitido.' })

  if (event.resource?.endsWith('/trainers/register')) {
    const registration = parseBody(event)
    if (!isValidTrainerRegistration(registration)) return response(400, { error: 'Confira nome, telefone, cidades, Instagram e os campos opcionais.' })
    try {
      const slug = await registerTrainer(registration!)
      return response(201, { registered: true, status: 'pending', slug })
    } catch (error) {
      if (error instanceof TransactionCanceledException && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) {
        return response(409, { error: 'Esse endereço já está reservado. Escolha outro subdomínio.' })
      }
      console.error('[imc-submit] Trainer registration failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
      })
      return response(503, { error: 'Não foi possível registrar o cadastro agora. Tente novamente mais tarde.' })
    }
  }

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
