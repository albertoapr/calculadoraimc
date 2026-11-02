import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
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
import { OAuth2Client } from 'google-auth-library'
import type { APIGatewayProxyHandler } from 'aws-lambda'

const dynamodb = new DynamoDBClient({})
const codeLifetimeSeconds = 15 * 60
const corsHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Fitpeso-Verification-Secret',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
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
  const instagram = data.clientInstagram === undefined ? '' : typeof data.clientInstagram === 'string' ? data.clientInstagram.trim() : null
  const objectives = ['Emagrecimento', 'Musculação', 'Outros']
  const trainerGenderPreferences = ['indiferente', 'feminino', 'masculino']
  const desiredDurations = ['1 mês', '2 meses', '3 meses', 'Mais de 3 meses']
  const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
  const shifts = ['Manhã', 'Tarde', 'Noite']
  const trainingDays = data.trainingDays
  const trainingShifts = data.trainingShifts
  const gymName = data.gymName === undefined ? '' : typeof data.gymName === 'string' ? data.gymName.trim() : null

  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) &&
    Boolean(phone) &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    typeof instagram === 'string' && (instagram === '' || (/^@[A-Za-z0-9._]{1,30}$/.test(instagram) && !instagram.includes('..') && !instagram.endsWith('.'))) &&
    ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(String(city)) &&
    (data.age === undefined || (Number.isInteger(data.age) && Number(data.age) >= 1 && Number(data.age) <= 120)) &&
    (data.objective === '' || objectives.includes(String(data.objective))) &&
    (data.trainerGenderPreference === undefined || trainerGenderPreferences.includes(String(data.trainerGenderPreference))) &&
    (data.desiredDuration === undefined || data.desiredDuration === '' || desiredDurations.includes(String(data.desiredDuration))) &&
    (data.attendsGym === undefined || typeof data.attendsGym === 'boolean') &&
    (gymName === '' || (data.attendsGym === true && typeof gymName === 'string' && gymName.length <= 50)) &&
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
    ProjectionExpression: '#name, #active',
    ExpressionAttributeNames: {
      '#trainerId': 'trainerId',
      '#name': 'name',
      '#active': 'active',
    },
    ExpressionAttributeValues: {
      ':trainerId': { S: trainerId },
      ':active': { BOOL: true },
    },
  }))

  const item = (result.Items ?? []).find(candidate => {
    const name = candidate.name?.S?.trim() ?? ''
    return candidate.active?.BOOL === true && name.length >= 2 && name.length <= 80
  })
  if (!item) return null
  const name = item.name?.S?.trim() ?? ''
  return name ? { name } : null
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
  const sex = data.sex
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : ''
  const instagram = typeof data.instagram === 'string' ? data.instagram.trim() : ''
  const cref = typeof data.cref === 'string' ? data.cref.trim() : ''
  const cities = data.cities
  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) && Boolean(phone) &&
    (sex === 'masculino' || sex === 'feminino') &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) &&
    !['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda'].includes(slug) &&
    /^@[A-Za-z0-9._]{1,30}$/.test(instagram) && !instagram.includes('..') && !instagram.endsWith('.') &&
    (cref === '' || (cref.length <= 40 && /^[\p{L}\p{M}0-9 ./-]+$/u.test(cref))) &&
    Array.isArray(cities) && cities.length >= 1 && cities.length <= 2 &&
    new Set(cities).size === cities.length && cities.every(city => ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(String(city)))
}

function isValidCustomerRegistration(data: Record<string, unknown> | null) {
  if (!data) return false
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : ''
  const whatsapp = normalizePhone(data.whatsapp)
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const dateOfBirth = typeof data.dateOfBirth === 'string' ? data.dateOfBirth : ''
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null
  const validDate = Boolean(parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateOfBirth &&
    dateOfBirth >= '1900-01-01' && dateOfBirth <= new Date().toISOString().slice(0, 10))
  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) && Boolean(whatsapp) &&
    email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && validDate
}

async function registerCustomer(data: Record<string, unknown>) {
  const customersTable = process.env.FITPESO_CUSTOMERS_TABLE
  const codesTable = process.env.IMC_REQUESTS_TABLE
  if (!customersTable || !codesTable) throw new Error('Customer registration is not configured')
  const whatsapp = normalizePhone(data.whatsapp)
  const name = String(data.name).trim().replace(/\s+/g, ' ')
  const email = String(data.email).trim().toLowerCase()
  const dateOfBirth = String(data.dateOfBirth)
  const existing = await dynamodb.send(new GetItemCommand({
    TableName: customersTable,
    Key: { whatsapp: { S: whatsapp } },
    ProjectionExpression: '#verified',
    ExpressionAttributeNames: { '#verified': 'whatsappVerified' },
    ConsistentRead: true,
  }))
  if (existing.Item?.whatsappVerified?.BOOL === true) throw new Error('Esse WhatsApp já tem um cadastro confirmado.')

  const code = randomBytes(16).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + codeLifetimeSeconds
  await dynamodb.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: customersTable,
          Item: {
            whatsapp: { S: whatsapp },
            name: { S: name },
            email: { S: email },
            dateOfBirth: { S: dateOfBirth },
            status: { S: 'PENDING_VERIFICATION' },
            whatsappVerified: { BOOL: false },
            createdAt: { S: new Date(now * 1000).toISOString() },
          },
          ConditionExpression: 'attribute_not_exists(whatsapp) OR attribute_not_exists(#verified) OR #verified = :false',
          ExpressionAttributeNames: { '#verified': 'whatsappVerified' },
          ExpressionAttributeValues: { ':false': { BOOL: false } },
        },
      },
      {
        Put: {
          TableName: codesTable,
          Item: {
            codeHash: { S: hashCode(code) },
            flow: { S: 'fitpeso-customer-whatsapp' },
            whatsapp: { S: whatsapp },
            expiresAt: { N: String(expiresAt) },
          },
          ConditionExpression: 'attribute_not_exists(codeHash)',
        },
      },
    ],
  }))
  return { verificationCode: code, verificationExpiresAt: expiresAt }
}

async function verifyCustomerWhatsApp(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp) return response(200, { verified: false })
  const codesTable = process.env.IMC_REQUESTS_TABLE
  const customersTable = process.env.FITPESO_CUSTOMERS_TABLE
  if (!codesTable || !customersTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  const codeHash = hashCode(code)
  try {
    const codeResult = await dynamodb.send(new GetItemCommand({
      TableName: codesTable,
      Key: { codeHash: { S: codeHash } },
      ConsistentRead: true,
    }))
    const challenge = codeResult.Item
    if (challenge?.flow?.S !== 'fitpeso-customer-whatsapp' || challenge.whatsapp?.S !== whatsapp) return response(200, { verified: false })

    const customerResult = await dynamodb.send(new GetItemCommand({
      TableName: customersTable,
      Key: { whatsapp: { S: whatsapp } },
      ConsistentRead: true,
    }))
    const customer = customerResult.Item
    if (customer?.whatsappVerified?.BOOL === true && challenge.consumedAt?.N) return response(200, { verified: true, alreadyVerified: true })
    if (Number(challenge.expiresAt?.N ?? 0) <= now || customer?.status?.S !== 'PENDING_VERIFICATION') return response(200, { verified: false })

    const verifiedAt = new Date(now * 1000).toISOString()
    await dynamodb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: codesTable,
            Key: { codeHash: { S: codeHash } },
            UpdateExpression: 'SET consumedAt = :now',
            ConditionExpression: '#flow = :flow AND whatsapp = :whatsapp AND expiresAt > :now AND attribute_not_exists(consumedAt)',
            ExpressionAttributeNames: { '#flow': 'flow' },
            ExpressionAttributeValues: {
              ':flow': { S: 'fitpeso-customer-whatsapp' },
              ':whatsapp': { S: whatsapp },
              ':now': { N: String(now) },
            },
          },
        },
        {
          Update: {
            TableName: customersTable,
            Key: { whatsapp: { S: whatsapp } },
            UpdateExpression: 'SET #status = :active, whatsappVerified = :true, verifiedAt = :verifiedAt',
            ConditionExpression: '#status = :pending AND whatsappVerified = :false',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':active': { S: 'ACTIVE' },
              ':pending': { S: 'PENDING_VERIFICATION' },
              ':true': { BOOL: true },
              ':false': { BOOL: false },
              ':verifiedAt': { S: verifiedAt },
            },
          },
        },
      ],
    }))
    return response(200, { verified: true })
  } catch (error) {
    if (error instanceof TransactionCanceledException && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) {
      const customerResult = await dynamodb.send(new GetItemCommand({
        TableName: customersTable,
        Key: { whatsapp: { S: whatsapp } },
        ConsistentRead: true,
      }))
      if (customerResult.Item?.whatsappVerified?.BOOL === true) return response(200, { verified: true, alreadyVerified: true })
      return response(200, { verified: false })
    }
    console.error('[imc-submit] Customer WhatsApp verification failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível confirmar o WhatsApp agora.' })
  }
}

async function getCustomerVerificationStatus(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp) return response(200, { verified: false })
  const codesTable = process.env.IMC_REQUESTS_TABLE
  if (!codesTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  try {
    const result = await dynamodb.send(new GetItemCommand({
      TableName: codesTable,
      Key: { codeHash: { S: hashCode(code) } },
      ConsistentRead: true,
    }))
    const challenge = result.Item
    if (challenge?.flow?.S !== 'fitpeso-customer-whatsapp' || challenge.whatsapp?.S !== whatsapp) {
      return response(200, { verified: false })
    }
    if (challenge.consumedAt?.N) return response(200, { verified: true })
    return response(200, { verified: false, expired: Number(challenge.expiresAt?.N ?? 0) <= Math.floor(Date.now() / 1000) })
  } catch (error) {
    console.error('[imc-submit] Customer verification status lookup failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível consultar a confirmação agora.' })
  }
}

async function getCustomerProfile(event: Parameters<APIGatewayProxyHandler>[0]) {
  const authorization = event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const tableName = process.env.FITPESO_CUSTOMERS_TABLE
  if (!match || !tableName) return response(401, { error: 'Entre para continuar.' })
  const token = match[1].trim()
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    const codesTable = process.env.IMC_REQUESTS_TABLE
    if (!codesTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
    try {
      const session = await dynamodb.send(new GetItemCommand({
        TableName: codesTable,
        Key: { codeHash: { S: hashCode(token) } },
        ConsistentRead: true,
      }))
      const whatsapp = session.Item?.flow?.S === 'fitpeso-customer-login-session' &&
        Number(session.Item.expiresAt?.N ?? 0) > Math.floor(Date.now() / 1000) ? session.Item.whatsapp?.S : ''
      if (!whatsapp) return response(401, { error: 'Sua sessão expirou. Entre novamente.' })
      const customer = await dynamodb.send(new GetItemCommand({
        TableName: tableName,
        Key: { whatsapp: { S: whatsapp } },
        ConsistentRead: true,
      }))
      if (customer.Item?.status?.S !== 'ACTIVE' || customer.Item.whatsappVerified?.BOOL !== true) {
        return response(401, { error: 'Cadastro indisponível. Entre novamente.' })
      }
      return response(200, { authenticated: true, profile: {
        name: customer.Item.name?.S ?? '',
        whatsapp,
        email: customer.Item.email?.S ?? '',
        dateOfBirth: customer.Item.dateOfBirth?.S ?? '',
      } })
    } catch (error) {
      console.error('[imc-submit] Customer WhatsApp session lookup failed', { errorClass: error instanceof Error ? error.name : typeof error })
      return response(503, { error: 'Não foi possível carregar seu cadastro agora.' })
    }
  }
  if (!clientId) return response(503, { error: 'Login Google indisponível.' })
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: token, audience: clientId })
    const payload = ticket.getPayload()
    const email = payload?.email?.trim().toLowerCase()
    if (!payload?.email_verified || !email) return response(401, { error: 'Não foi possível validar sua conta Google.' })
    const result = await dynamodb.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'CustomerByEmail',
      KeyConditionExpression: '#email = :email',
      FilterExpression: '#status = :active AND #verified = :verified',
      ExpressionAttributeNames: { '#email': 'email', '#status': 'status', '#verified': 'whatsappVerified' },
      ExpressionAttributeValues: {
        ':email': { S: email },
        ':active': { S: 'ACTIVE' },
        ':verified': { BOOL: true },
      },
    }))
    const customer = result.Items?.[0]
    if (!customer) return response(404, { error: 'Não encontrei um cadastro confirmado com este e-mail. Cadastre-se primeiro.' })
    return response(200, {
      authenticated: true,
      profile: {
        name: customer.name?.S ?? '',
        whatsapp: customer.whatsapp?.S ?? '',
        email,
        dateOfBirth: customer.dateOfBirth?.S ?? '',
      },
    })
  } catch (error) {
    console.error('[imc-submit] Google sign-in verification failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(401, { error: 'A sessão Google expirou ou não pôde ser validada. Entre novamente.' })
  }
}

function isValidBirthDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
}

async function beginCustomerLogin(data: Record<string, unknown> | null) {
  const whatsapp = normalizePhone(data?.whatsapp)
  const dateOfBirth = data?.dateOfBirth
  const sessionToken = typeof data?.sessionToken === 'string' ? data.sessionToken : ''
  if (!whatsapp || !isValidBirthDate(dateOfBirth) || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
    return response(400, { error: 'Informe um WhatsApp e uma data de nascimento válidos.' })
  }
  const customersTable = process.env.FITPESO_CUSTOMERS_TABLE
  const codesTable = process.env.IMC_REQUESTS_TABLE
  if (!customersTable || !codesTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  try {
    const customer = await dynamodb.send(new GetItemCommand({
      TableName: customersTable,
      Key: { whatsapp: { S: whatsapp } },
      ProjectionExpression: '#status, #verified, #dob',
      ExpressionAttributeNames: { '#status': 'status', '#verified': 'whatsappVerified', '#dob': 'dateOfBirth' },
      ConsistentRead: true,
    }))
    const eligible = customer.Item?.status?.S === 'ACTIVE' && customer.Item.whatsappVerified?.BOOL === true &&
      customer.Item.dateOfBirth?.S === dateOfBirth
    const code = randomBytes(16).toString('base64url')
    const expiresAt = Math.floor(Date.now() / 1000) + codeLifetimeSeconds
    await dynamodb.send(new PutItemCommand({
      TableName: codesTable,
      Item: {
        codeHash: { S: hashCode(code) },
        flow: { S: 'fitpeso-customer-login' },
        whatsapp: { S: whatsapp },
        eligible: { BOOL: eligible },
        sessionTokenHash: { S: hashCode(sessionToken) },
        expiresAt: { N: String(expiresAt) },
      },
      ConditionExpression: 'attribute_not_exists(codeHash)',
    }))
    return response(200, { started: true, verificationCode: code, expiresAt })
  } catch (error) {
    console.error('[imc-submit] Customer login initialization failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return response(503, { error: 'Não foi possível iniciar o login agora.' })
  }
}

async function verifyCustomerLogin(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp) return response(200, { verified: false })
  const codesTable = process.env.IMC_REQUESTS_TABLE
  const customersTable = process.env.FITPESO_CUSTOMERS_TABLE
  if (!codesTable || !customersTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const codeHash = hashCode(code)
  const now = Math.floor(Date.now() / 1000)
  try {
    const result = await dynamodb.send(new GetItemCommand({ TableName: codesTable, Key: { codeHash: { S: codeHash } }, ConsistentRead: true }))
    const challenge = result.Item
    if (challenge?.flow?.S !== 'fitpeso-customer-login' || challenge.whatsapp?.S !== whatsapp || Number(challenge.expiresAt?.N ?? 0) <= now) {
      return response(200, { verified: false })
    }
    if (challenge.consumedAt?.N) {
      const sessionHash = challenge.sessionTokenHash?.S ?? ''
      const existing = sessionHash ? await dynamodb.send(new GetItemCommand({ TableName: codesTable, Key: { codeHash: { S: sessionHash } }, ConsistentRead: true })) : null
      return response(200, { verified: existing?.Item?.flow?.S === 'fitpeso-customer-login-session' && Number(existing.Item.expiresAt?.N ?? 0) > now })
    }
    const customer = await dynamodb.send(new GetItemCommand({ TableName: customersTable, Key: { whatsapp: { S: whatsapp } }, ConsistentRead: true }))
    const eligible = challenge.eligible?.BOOL === true && customer.Item?.status?.S === 'ACTIVE' && customer.Item.whatsappVerified?.BOOL === true
    if (!eligible) {
      await dynamodb.send(new UpdateItemCommand({
        TableName: codesTable, Key: { codeHash: { S: codeHash } },
        UpdateExpression: 'SET consumedAt = :now',
        ConditionExpression: '#flow = :flow AND whatsapp = :whatsapp AND expiresAt > :now AND attribute_not_exists(consumedAt)',
        ExpressionAttributeNames: { '#flow': 'flow' },
        ExpressionAttributeValues: { ':flow': { S: 'fitpeso-customer-login' }, ':whatsapp': { S: whatsapp }, ':now': { N: String(now) } },
      }))
      return response(200, { verified: false })
    }
    const sessionHash = challenge.sessionTokenHash?.S ?? ''
    if (!/^[a-f0-9]{64}$/.test(sessionHash)) return response(200, { verified: false })
    const sessionExpiry = now + 12 * 60 * 60
    await dynamodb.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: {
        TableName: codesTable, Key: { codeHash: { S: codeHash } },
        UpdateExpression: 'SET consumedAt = :now',
        ConditionExpression: '#flow = :flow AND whatsapp = :whatsapp AND eligible = :yes AND expiresAt > :now AND attribute_not_exists(consumedAt)',
        ExpressionAttributeNames: { '#flow': 'flow' },
        ExpressionAttributeValues: { ':flow': { S: 'fitpeso-customer-login' }, ':whatsapp': { S: whatsapp }, ':yes': { BOOL: true }, ':now': { N: String(now) } },
      } },
      { Put: {
        TableName: codesTable,
        Item: { codeHash: { S: sessionHash }, flow: { S: 'fitpeso-customer-login-session' }, whatsapp: { S: whatsapp }, expiresAt: { N: String(sessionExpiry) } },
        ConditionExpression: 'attribute_not_exists(codeHash)',
      } },
    ] }))
    return response(200, { verified: true })
  } catch (error) {
    if (error instanceof TransactionCanceledException) {
      const result = await dynamodb.send(new GetItemCommand({ TableName: codesTable, Key: { codeHash: { S: codeHash } }, ConsistentRead: true }))
      const challenge = result.Item
      const sessionHash = challenge?.sessionTokenHash?.S ?? ''
      const session = sessionHash ? await dynamodb.send(new GetItemCommand({ TableName: codesTable, Key: { codeHash: { S: sessionHash } }, ConsistentRead: true })) : null
      return response(200, { verified: session?.Item?.flow?.S === 'fitpeso-customer-login-session' && Number(session.Item.expiresAt?.N ?? 0) > now })
    }
    console.error('[imc-submit] Customer WhatsApp login verification failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return response(503, { error: 'Não foi possível confirmar o login agora.' })
  }
}

async function getCustomerLoginStatus(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  const sessionToken = typeof data?.sessionToken === 'string' ? data.sessionToken : ''
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return response(200, { authenticated: false })
  const tableName = process.env.IMC_REQUESTS_TABLE
  if (!tableName) return response(503, { error: 'Serviço temporariamente indisponível.' })
  try {
    const result = await dynamodb.send(new GetItemCommand({ TableName: tableName, Key: { codeHash: { S: hashCode(code) } }, ConsistentRead: true }))
    const challenge = result.Item
    if (challenge?.flow?.S !== 'fitpeso-customer-login' || challenge.whatsapp?.S !== whatsapp || challenge.sessionTokenHash?.S !== hashCode(sessionToken)) {
      return response(200, { authenticated: false })
    }
    if (Number(challenge.expiresAt?.N ?? 0) <= Math.floor(Date.now() / 1000)) return response(200, { authenticated: false, expired: true })
    if (challenge.eligible?.BOOL !== true) return response(200, { authenticated: false, confirmed: Boolean(challenge.consumedAt?.N) })
    const session = await dynamodb.send(new GetItemCommand({ TableName: tableName, Key: { codeHash: { S: hashCode(sessionToken) } }, ConsistentRead: true }))
    const authenticated = session.Item?.flow?.S === 'fitpeso-customer-login-session' && session.Item.whatsapp?.S === whatsapp &&
      Number(session.Item.expiresAt?.N ?? 0) > Math.floor(Date.now() / 1000)
    return response(200, { authenticated })
  } catch (error) {
    console.error('[imc-submit] Customer login status lookup failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return response(503, { error: 'Não foi possível consultar o login agora.' })
  }
}

class TrainerSlugUnavailableError extends Error {}

function createTrainerCode(trainerId: string, whatsapp: string, cities: string[], slug: string) {
  const code = randomBytes(16).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + codeLifetimeSeconds
  return {
    code,
    item: {
      codeHash: { S: hashCode(code) },
      flow: { S: 'trainer-whatsapp' },
      trainerId: { S: trainerId },
      whatsapp: { S: whatsapp },
      cities: { SS: cities },
      slug: { S: slug },
      expiresAt: { N: String(expiresAt) },
    },
  }
}

async function issueCodeForExistingSignup(data: Record<string, unknown>, requestCodesTable: string, slugTableName: string, trainersTable: string) {
  const slug = String(data.slug).trim().toLowerCase()
  const name = String(data.name).trim().replace(/\s+/g, ' ')
  const sex = data.sex === 'masculino' || data.sex === 'feminino' ? data.sex : ''
  const whatsapp = normalizePhone(data.whatsapp)
  const cities = data.cities as string[]
  const slugResult = await dynamodb.send(new GetItemCommand({
    TableName: slugTableName,
    Key: { slug: { S: slug } },
    ProjectionExpression: '#trainerId',
    ExpressionAttributeNames: { '#trainerId': 'trainerId' },
    ConsistentRead: true,
  }))
  const trainerId = slugResult.Item?.trainerId?.S
  if (!trainerId) throw new TrainerSlugUnavailableError()

  const records = await Promise.all(cities.map(city => dynamodb.send(new GetItemCommand({
    TableName: trainersTable,
    Key: { city: { S: city }, trainerId: { S: trainerId } },
    ProjectionExpression: '#city, #trainerId, #name, #whatsapp, #active, #status, #slug, #sex',
    ExpressionAttributeNames: {
      '#city': 'city',
      '#trainerId': 'trainerId',
      '#name': 'name',
      '#whatsapp': 'whatsapp',
      '#active': 'active',
      '#status': 'status',
      '#slug': 'slug',
      '#sex': 'sex',
    },
    ConsistentRead: true,
  }))))
  const matchingSignup = records.every((record, index) => {
    const item = record.Item
    return item?.city?.S === cities[index] && item.trainerId?.S === trainerId &&
      item.name?.S === name && item.whatsapp?.S === whatsapp && item.slug?.S === slug &&
      (!item.sex?.S || item.sex.S === sex) &&
      item.active?.BOOL === false && ['pending', 'pending_verification'].includes(item.status?.S ?? '')
  })
  if (!matchingSignup) throw new TrainerSlugUnavailableError()

  const challenge = createTrainerCode(trainerId, whatsapp, cities, slug)
  await dynamodb.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: requestCodesTable,
          Item: challenge.item,
          ConditionExpression: 'attribute_not_exists(codeHash)',
        },
      },
      ...cities.map(city => ({
        Update: {
          TableName: trainersTable,
          Key: { city: { S: city }, trainerId: { S: trainerId } },
          UpdateExpression: 'SET #sex = if_not_exists(#sex, :sex)',
          ConditionExpression: 'attribute_not_exists(#sex) OR #sex = :sex',
          ExpressionAttributeNames: { '#sex': 'sex' },
          ExpressionAttributeValues: { ':sex': { S: sex } },
        },
      })),
    ],
  }))
  return { slug, verificationCode: challenge.code }
}

async function registerTrainer(data: Record<string, unknown>) {
  const tableName = process.env.TRAINERS_TABLE
  if (!tableName) throw new Error('Trainer directory is not configured')
  const requestCodesTable = process.env.IMC_REQUESTS_TABLE
  if (!requestCodesTable) throw new Error('Trainer verification store is not configured')
  const slugTableName = process.env.TRAINER_SLUGS_TABLE
  if (!slugTableName) throw new Error('Trainer slug directory is not configured')
  const name = String(data.name).trim().replace(/\s+/g, ' ')
  const sex = data.sex === 'masculino' || data.sex === 'feminino' ? data.sex : ''
  if (!sex) throw new Error('Selecione Masculino ou Feminino.')
  const whatsapp = normalizePhone(data.whatsapp)
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const slug = String(data.slug).trim().toLowerCase()
  const instagram = String(data.instagram).trim()
  const cref = typeof data.cref === 'string' ? data.cref.trim() : ''
  const cities = data.cities as string[]
  const trainerId = randomBytes(16).toString('hex')
  const submittedAt = String(Math.floor(Date.now() / 1000))
  const challenge = createTrainerCode(trainerId, whatsapp, cities, slug)

  const existingSlug = await dynamodb.send(new GetItemCommand({
    TableName: slugTableName,
    Key: { slug: { S: slug } },
    ProjectionExpression: '#trainerId',
    ExpressionAttributeNames: { '#trainerId': 'trainerId' },
    ConsistentRead: true,
  }))
  if (existingSlug.Item) return issueCodeForExistingSignup(data, requestCodesTable, slugTableName, tableName)

  await dynamodb.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: requestCodesTable,
          Item: challenge.item,
          ConditionExpression: 'attribute_not_exists(codeHash)',
        },
      },
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
            sex: { S: sex },
            whatsapp: { S: whatsapp },
            ...(email ? { email: { S: email } } : {}),
            instagram: { S: instagram },
            ...(cref ? { cref: { S: cref } } : {}),
            active: { BOOL: false },
            whatsappVerified: { BOOL: false },
            status: { S: 'pending_verification' },
            submittedAt: { N: submittedAt },
          },
          ConditionExpression: 'attribute_not_exists(city) AND attribute_not_exists(trainerId)',
        },
      })),
    ],
  }))
  return { slug, verificationCode: challenge.code }
}

function trainerVerificationSecretMatches(event: Parameters<APIGatewayProxyHandler>[0]) {
  const expected = process.env.TRAINER_WHATSAPP_VERIFY_SECRET
  const supplied = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === 'x-fitpeso-verification-secret')?.[1]
  if (!expected || !supplied) return false
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

async function verifyFitpesoRequest(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp) return response(200, { verified: false })
  const codesTable = process.env.IMC_REQUESTS_TABLE
  const requestsTable = process.env.FITPESO_USER_REQUESTS_TABLE
  const locksTable = process.env.FITPESO_REQUEST_LOCKS_TABLE
  if (!codesTable || !requestsTable || !locksTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  const codeHash = hashCode(code)
  try {
    const codeResult = await dynamodb.send(new GetItemCommand({
      TableName: codesTable,
      Key: { codeHash: { S: codeHash } },
      ConsistentRead: true,
    }))
    const codeItem = codeResult.Item
    if (codeItem?.flow?.S !== 'fitpeso-request-whatsapp' || codeItem.whatsapp?.S !== whatsapp) return response(200, { verified: false })
    const requestId = codeItem.requestId?.S
    const verificationExpiresAt = Number(codeItem.expiresAt?.N ?? 0)
    if (!requestId) return response(200, { verified: false })

    const requestResult = await dynamodb.send(new GetItemCommand({
      TableName: requestsTable,
      Key: { requestId: { S: requestId } },
      ConsistentRead: true,
    }))
    const request = requestResult.Item
    if (request?.clientPhone?.S !== whatsapp) return response(200, { verified: false })
    if (request.status?.S === 'VALIDATED' || request.status?.S === 'PROCESSED') {
      return response(200, { verified: true, requestId, validUntil: Number(request.validUntil?.N ?? 0) })
    }
    if (request.status?.S !== 'PENDING_VERIFICATION' || verificationExpiresAt <= now) return response(200, { verified: false })

    const validUntil = now + 7 * 24 * 60 * 60
    const nowIso = new Date(now * 1000).toISOString()
    await dynamodb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: codesTable,
            Key: { codeHash: { S: codeHash } },
            UpdateExpression: 'SET consumedAt = :now',
            ConditionExpression: '#flow = :flow AND whatsapp = :whatsapp AND expiresAt > :now AND attribute_not_exists(consumedAt)',
            ExpressionAttributeNames: { '#flow': 'flow' },
            ExpressionAttributeValues: {
              ':flow': { S: 'fitpeso-request-whatsapp' },
              ':whatsapp': { S: whatsapp },
              ':now': { N: String(now) },
            },
          },
        },
        {
          Update: {
            TableName: requestsTable,
            Key: { requestId: { S: requestId } },
            UpdateExpression: 'SET #status = :validated, validUntil = :validUntil, expiresAt = :validUntil, verifiedAt = :nowIso, updatedAt = :nowIso',
            ConditionExpression: '#status = :pending AND verificationExpiresAt > :now AND clientPhone = :whatsapp',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':validated': { S: 'VALIDATED' },
              ':pending': { S: 'PENDING_VERIFICATION' },
              ':validUntil': { N: String(validUntil) },
              ':now': { N: String(now) },
              ':nowIso': { S: nowIso },
              ':whatsapp': { S: whatsapp },
            },
          },
        },
        {
          Put: {
            TableName: locksTable,
            Item: {
              clientPhone: { S: whatsapp },
              requestId: { S: requestId },
              validUntil: { N: String(validUntil) },
              expiresAt: { N: String(validUntil) },
            },
            ConditionExpression: 'attribute_not_exists(clientPhone) OR validUntil <= :now',
            ExpressionAttributeValues: { ':now': { N: String(now) } },
          },
        },
      ],
    }))
    return response(200, { verified: true, requestId, validUntil })
  } catch (error) {
    if (error instanceof TransactionCanceledException && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) {
      const codeResult = await dynamodb.send(new GetItemCommand({
        TableName: codesTable,
        Key: { codeHash: { S: codeHash } },
        ConsistentRead: true,
      }))
      const requestId = codeResult.Item?.requestId?.S
      const lockResult = await dynamodb.send(new GetItemCommand({
        TableName: locksTable,
        Key: { clientPhone: { S: whatsapp } },
        ConsistentRead: true,
      }))
      if (Number(lockResult.Item?.validUntil?.N ?? 0) > now && lockResult.Item?.requestId?.S !== requestId) {
        return response(409, { verified: false, alreadyValidRequest: true })
      }
      return response(200, { verified: false })
    }
    console.error('[imc-submit] Fitpeso request verification failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível confirmar a solicitação agora.' })
  }
}

function deserializeFitpesoRequest(item: Record<string, any>) {
  return {
    requestId: item.requestId?.S ?? '',
    clientName: item.clientName?.S ?? '',
    clientPhone: item.clientPhone?.S ?? '',
    ...(item.email?.S ? { email: item.email.S } : {}),
    ...(item.age?.N ? { age: Number(item.age.N) } : {}),
    city: item.city?.S ?? '',
    ...(item.objective?.S ? { objective: item.objective.S } : {}),
    trainerGenderPreference: item.trainerGenderPreference?.S ?? 'indiferente',
    ...(item.desiredDuration?.S ? { desiredDuration: item.desiredDuration.S } : {}),
    attendsGym: item.attendsGym?.BOOL ?? false,
    ...(item.gymName?.S ? { gymName: item.gymName.S } : {}),
    trainingDays: item.trainingDays?.L?.map((entry: { S?: string }) => entry.S ?? '') ?? [],
    trainingShifts: item.trainingShifts?.L?.map((entry: { S?: string }) => entry.S ?? '') ?? [],
    createdAt: item.createdAt?.S ?? '',
    validUntil: Number(item.validUntil?.N ?? 0),
  }
}

function createTrainerRequestToken(requestId: string, trainerId: string, expiresAt: number) {
  const secret = process.env.TRAINER_WHATSAPP_VERIFY_SECRET
  if (!secret) throw new Error('Trainer request access signing is not configured')
  const payload = Buffer.from(JSON.stringify({ v: 1, rid: requestId, tid: trainerId, exp: expiresAt })).toString('base64url')
  const signature = createHmac('sha256', secret).update(`fitpeso-trainer-request.v1.${payload}`).digest('base64url')
  return `${payload}.${signature}`
}

async function getActiveTrainersForCity(city: string) {
  const tableName = process.env.TRAINERS_TABLE
  if (!tableName) throw new Error('Trainer directory is not configured')
  const items: Record<string, any>[] = []
  let exclusiveStartKey: Record<string, any> | undefined
  do {
    const result = await dynamodb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#city = :city',
      FilterExpression: '#active = :active',
      ProjectionExpression: '#city, #trainerId, #name, #whatsapp, #active, #slug, #instagram, #sex',
      ExpressionAttributeNames: {
        '#city': 'city',
        '#trainerId': 'trainerId',
        '#name': 'name',
        '#whatsapp': 'whatsapp',
        '#active': 'active',
        '#slug': 'slug',
        '#instagram': 'instagram',
        '#sex': 'sex',
      },
      ExpressionAttributeValues: { ':city': { S: city }, ':active': { BOOL: true } },
      ExclusiveStartKey: exclusiveStartKey,
    }))
    items.push(...(result.Items ?? []))
    exclusiveStartKey = result.LastEvaluatedKey
  } while (exclusiveStartKey)
  return items.flatMap(item => {
    const trainerId = item.trainerId?.S ?? ''
    const name = item.name?.S?.trim() ?? ''
    const whatsapp = normalizePhone(item.whatsapp?.S)
    const slug = item.slug?.S?.trim().toLowerCase() ?? ''
    if (!trainerId || !name || !whatsapp || !/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return []
    const instagram = typeof item.instagram?.S === 'string' ? item.instagram.S.trim() : ''
    const sex = item.sex?.S === 'masculino' || item.sex?.S === 'feminino' ? item.sex.S : ''
    return [{ trainerId, name, whatsapp, slug, sex, ...(instagram ? { instagram } : {}) }]
  })
}

async function listValidFitpesoRequests(event: Parameters<APIGatewayProxyHandler>[0]) {
  const tableName = process.env.FITPESO_USER_REQUESTS_TABLE
  if (!tableName) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  const cursor = event.queryStringParameters?.cursor
  let exclusiveStartKey: Record<string, any> | undefined
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    } catch {
      return response(400, { error: 'Cursor inválido.' })
    }
  }
  try {
    const result = await dynamodb.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'RequestsByStatus',
      KeyConditionExpression: '#status = :validated AND validUntil > :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':validated': { S: 'VALIDATED' }, ':now': { N: String(now) } },
      ExclusiveStartKey: exclusiveStartKey,
      Limit: 100,
    }))
    const nextCursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : undefined
    const trainerCache = new Map<string, ReturnType<typeof getActiveTrainersForCity>>()
    const requests = await Promise.all((result.Items ?? []).map(async item => {
      const request = deserializeFitpesoRequest(item)
      if (!trainerCache.has(request.city)) trainerCache.set(request.city, getActiveTrainersForCity(request.city))
      const trainers = await trainerCache.get(request.city)!
      const eligibleTrainers = request.trainerGenderPreference === 'indiferente'
        ? trainers
        : trainers.filter(trainer => trainer.sex === request.trainerGenderPreference)
      const validUntil = request.validUntil
      return {
        ...request,
        eligibleTrainers: eligibleTrainers.map(trainer => ({
          ...trainer,
          sex: undefined,
          requestUrl: `https://${trainer.slug}.fitpeso.com.br/?token=${encodeURIComponent(createTrainerRequestToken(request.requestId, trainer.trainerId, validUntil))}`,
        })),
      }
    }))
    return response(200, { requests, ...(nextCursor ? { nextCursor } : {}) })
  } catch (error) {
    console.error('[imc-submit] Valid Fitpeso request lookup failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível consultar as solicitações agora.' })
  }
}

async function getTrainerRequest(event: Parameters<APIGatewayProxyHandler>[0]) {
  const token = event.queryStringParameters?.token ?? ''
  const invalid = () => response(404, { error: 'Solicitação não encontrada ou acesso indisponível.' })
  if (token.length > 2048) return invalid()
  const [payloadPart, signaturePart, extra] = token.split('.')
  if (!payloadPart || !signaturePart || extra !== undefined) return invalid()
  const secret = process.env.TRAINER_WHATSAPP_VERIFY_SECRET
  if (!secret) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const expectedSignature = createHmac('sha256', secret).update(`fitpeso-trainer-request.v1.${payloadPart}`).digest()
  let suppliedSignature: Buffer
  try { suppliedSignature = Buffer.from(signaturePart, 'base64url') } catch { return invalid() }
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return invalid()

  let claims: { v?: unknown; rid?: unknown; tid?: unknown; exp?: unknown }
  try { claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) } catch { return invalid() }
  if (claims.v !== 1 || typeof claims.rid !== 'string' || !/^[0-9a-f-]{36}$/i.test(claims.rid) ||
      typeof claims.tid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(claims.tid) ||
      !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= 0) return invalid()
  const now = Math.floor(Date.now() / 1000)
  if (Number(claims.exp) <= now) return response(410, { expired: true })

  const requestsTable = process.env.FITPESO_USER_REQUESTS_TABLE
  const trainersTable = process.env.TRAINERS_TABLE
  if (!requestsTable || !trainersTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  try {
    const requestResult = await dynamodb.send(new GetItemCommand({
      TableName: requestsTable,
      Key: { requestId: { S: claims.rid } },
      ConsistentRead: true,
    }))
    const item = requestResult.Item
    const validUntil = Number(item?.validUntil?.N ?? 0)
    if (item && validUntil <= now) return response(410, { expired: true })
    if (!item || validUntil !== Number(claims.exp) || !['VALIDATED', 'PROCESSED'].includes(item.status?.S ?? '')) return invalid()

    const trainerResult = await dynamodb.send(new GetItemCommand({
      TableName: trainersTable,
      Key: { city: { S: item.city?.S ?? '' }, trainerId: { S: claims.tid } },
      ProjectionExpression: '#trainerId, #active',
      ExpressionAttributeNames: { '#trainerId': 'trainerId', '#active': 'active' },
      ConsistentRead: true,
    }))
    if (trainerResult.Item?.active?.BOOL !== true || trainerResult.Item.trainerId?.S !== claims.tid) return invalid()

    const fullName = item.clientName?.S?.trim() ?? ''
    const clientPhone = normalizePhone(item.clientPhone?.S)
    if (!fullName || !clientPhone) return invalid()
    return response(200, { request: {
      clientName: fullName.split(/\s+/)[0],
      clientPhone,
      ...(item.email?.S ? { email: item.email.S } : {}),
      ...(item.clientInstagram?.S ? { clientInstagram: item.clientInstagram.S } : {}),
      ...(item.age?.N ? { age: Number(item.age.N) } : {}),
      city: item.city?.S ?? '',
      ...(item.objective?.S ? { objective: item.objective.S } : {}),
      ...(item.desiredDuration?.S ? { desiredDuration: item.desiredDuration.S } : {}),
      attendsGym: item.attendsGym?.BOOL ?? false,
      ...(item.gymName?.S ? { gymName: item.gymName.S } : {}),
      trainingDays: item.trainingDays?.L?.map((entry: { S?: string }) => entry.S ?? '') ?? [],
      trainingShifts: item.trainingShifts?.L?.map((entry: { S?: string }) => entry.S ?? '') ?? [],
      validUntil,
    } })
  } catch (error) {
    console.error('[imc-submit] Trainer request view failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível carregar esta solicitação agora.' })
  }
}

async function markFitpesoRequestProcessed(requestId: string) {
  const tableName = process.env.FITPESO_USER_REQUESTS_TABLE
  if (!tableName || !/^[0-9a-f-]{36}$/i.test(requestId)) return response(400, { processed: false })
  const now = Math.floor(Date.now() / 1000)
  const nowIso = new Date(now * 1000).toISOString()
  try {
    await dynamodb.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { requestId: { S: requestId } },
      UpdateExpression: 'SET #status = :processed, processedAt = :nowIso, updatedAt = :nowIso',
      ConditionExpression: '#status = :validated AND validUntil > :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':processed': { S: 'PROCESSED' },
        ':validated': { S: 'VALIDATED' },
        ':now': { N: String(now) },
        ':nowIso': { S: nowIso },
      },
    }))
    return response(200, { processed: true })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      const existing = await dynamodb.send(new GetItemCommand({ TableName: tableName, Key: { requestId: { S: requestId } }, ConsistentRead: true }))
      if (existing.Item?.status?.S === 'PROCESSED') return response(200, { processed: true, alreadyProcessed: true })
      return response(409, { processed: false, error: 'A solicitação não está mais válida para processamento.' })
    }
    console.error('[imc-submit] Fitpeso request processing update failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { processed: false, error: 'Não foi possível atualizar a solicitação agora.' })
  }
}

async function verifyTrainerWhatsApp(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const whatsapp = normalizePhone(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !whatsapp) return response(200, { verified: false })

  const codesTable = process.env.IMC_REQUESTS_TABLE
  const trainersTable = process.env.TRAINERS_TABLE
  if (!codesTable || !trainersTable) return response(503, { error: 'Serviço temporariamente indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  try {
    const codeResult = await dynamodb.send(new GetItemCommand({
      TableName: codesTable,
      Key: { codeHash: { S: hashCode(code) } },
      ConsistentRead: true,
    }))
    const item = codeResult.Item
    if (item?.flow?.S !== 'trainer-whatsapp' || item.whatsapp?.S !== whatsapp) return response(200, { verified: false })
    const slug = item.slug?.S ?? ''
    if (item.consumedAt?.N) return response(200, { verified: true, slug })
    if (!item.expiresAt?.N || Number(item.expiresAt.N) <= now) return response(200, { verified: false })
    const trainerId = item.trainerId?.S
    const cities = item.cities?.SS ?? []
    if (!trainerId || cities.length < 1 || cities.length > 2) return response(200, { verified: false })

    await dynamodb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: codesTable,
            Key: { codeHash: { S: hashCode(code) } },
            UpdateExpression: 'SET consumedAt = :now',
            ConditionExpression: '#flow = :flow AND whatsapp = :whatsapp AND expiresAt > :now AND attribute_not_exists(consumedAt)',
            ExpressionAttributeNames: { '#flow': 'flow' },
            ExpressionAttributeValues: {
              ':flow': { S: 'trainer-whatsapp' },
              ':whatsapp': { S: whatsapp },
              ':now': { N: String(now) },
            },
          },
        },
        ...cities.map(city => ({
          Update: {
            TableName: trainersTable,
            Key: { city: { S: city }, trainerId: { S: trainerId } },
            UpdateExpression: 'SET active = :active, #status = :status, whatsappVerified = :verified, whatsappVerifiedAt = :now',
            ConditionExpression: 'whatsapp = :whatsapp AND active = :inactive AND #status IN (:legacyPending, :pendingVerification)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':active': { BOOL: true },
              ':inactive': { BOOL: false },
              ':status': { S: 'active' },
              ':legacyPending': { S: 'pending' },
              ':pendingVerification': { S: 'pending_verification' },
              ':verified': { BOOL: true },
              ':whatsapp': { S: whatsapp },
              ':now': { N: String(now) },
            },
          },
        })),
      ],
    }))
    return response(200, { verified: true, slug })
  } catch (error) {
    if (error instanceof TransactionCanceledException && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) {
      return response(200, { verified: false })
    }
    console.error('[imc-submit] Trainer WhatsApp verification failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return response(503, { error: 'Não foi possível confirmar o WhatsApp agora.' })
  }
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

async function createFitpesoRequest(data: Record<string, unknown>) {
  const requestsTable = process.env.FITPESO_USER_REQUESTS_TABLE
  const locksTable = process.env.FITPESO_REQUEST_LOCKS_TABLE
  const codesTable = process.env.IMC_REQUESTS_TABLE
  if (!requestsTable || !locksTable || !codesTable) throw new Error('Fitpeso request storage is not configured')

  const clientPhone = normalizePhone(data.clientPhone)
  const now = Math.floor(Date.now() / 1000)
  const existingLock = await dynamodb.send(new GetItemCommand({
    TableName: locksTable,
    Key: { clientPhone: { S: clientPhone } },
    ProjectionExpression: 'validUntil',
    ConsistentRead: true,
  }))
  if (Number(existingLock.Item?.validUntil?.N ?? 0) > now) return response(409, { error: 'Já existe uma solicitação válida para este WhatsApp. Aguarde o retorno da equipe.' })

  const code = randomBytes(16).toString('base64url')
  const requestId = randomUUID()
  const verificationExpiresAt = now + codeLifetimeSeconds
  const createdAt = new Date(now * 1000).toISOString()
  const item = {
    requestId: { S: requestId },
    clientName: { S: String(data.clientName).trim().replace(/\s+/g, ' ') },
    clientPhone: { S: clientPhone },
    city: { S: String(data.city).trim() },
    status: { S: 'PENDING_VERIFICATION' },
    createdAt: { S: createdAt },
    consentAt: { S: createdAt },
    verificationExpiresAt: { N: String(verificationExpiresAt) },
    expiresAt: { N: String(verificationExpiresAt) },
    ...(typeof data.email === 'string' && data.email.trim() ? { email: { S: data.email.trim().toLowerCase() } } : {}),
    ...(typeof data.clientInstagram === 'string' && data.clientInstagram.trim() ? { clientInstagram: { S: data.clientInstagram.trim() } } : {}),
    ...(Number.isInteger(data.age) ? { age: { N: String(data.age) } } : {}),
    ...(typeof data.objective === 'string' && data.objective ? { objective: { S: data.objective } } : {}),
    ...(typeof data.trainerGenderPreference === 'string' ? { trainerGenderPreference: { S: data.trainerGenderPreference } } : {}),
    ...(typeof data.desiredDuration === 'string' && data.desiredDuration ? { desiredDuration: { S: data.desiredDuration } } : {}),
    ...(typeof data.attendsGym === 'boolean' ? { attendsGym: { BOOL: data.attendsGym } } : {}),
    ...(data.attendsGym === true && typeof data.gymName === 'string' && data.gymName.trim() ? { gymName: { S: data.gymName.trim().slice(0, 50) } } : {}),
    ...(Array.isArray(data.trainingDays) && data.trainingDays.length ? { trainingDays: { L: data.trainingDays.map(day => ({ S: String(day) })) } } : {}),
    ...(Array.isArray(data.trainingShifts) && data.trainingShifts.length ? { trainingShifts: { L: data.trainingShifts.map(shift => ({ S: String(shift) })) } } : {}),
  }

  await dynamodb.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: requestsTable,
          Item: item,
          ConditionExpression: 'attribute_not_exists(requestId)',
        },
      },
      {
        Put: {
          TableName: codesTable,
          Item: {
            codeHash: { S: hashCode(code) },
            flow: { S: 'fitpeso-request-whatsapp' },
            requestId: { S: requestId },
            whatsapp: { S: clientPhone },
            expiresAt: { N: String(verificationExpiresAt) },
          },
          ConditionExpression: 'attribute_not_exists(codeHash)',
        },
      },
    ],
  }))
  return response(201, { created: true, requestId, verificationCode: code, verificationExpiresAt })
}

async function sendRequestEmail(data: Record<string, unknown>, code: string) {
  const recipient = process.env.BETA_EMAIL_ADDRESS
  const sender = process.env.GMAIL_USER
  const password = process.env.GMAIL_PASSWORD?.replace(/\s/g, '')
  if (!recipient || !sender || !password) throw new Error('Gmail SMTP delivery is not configured')
  const age = data.age === undefined ? '' : `${data.age} anos`
  const days = Array.isArray(data.trainingDays) ? data.trainingDays.join(', ') : ''
  const shifts = Array.isArray(data.trainingShifts) ? data.trainingShifts.join(', ') : ''
  const trainerGenderPreference = data.trainerGenderPreference === 'feminino' ? 'Mulher' : data.trainerGenderPreference === 'masculino' ? 'Homem' : 'Indiferente'
  const gymName = typeof data.gymName === 'string' ? data.gymName.trim() : ''
  const lines = [
    'Nova solicitação de ajuda de personal trainer',
    '',
    `Nome: ${String(data.clientName).trim()}`,
    `WhatsApp: ${normalizePhone(data.clientPhone)}`,
    ...(typeof data.email === 'string' && data.email.trim() ? [`E-mail: ${data.email.trim()}`] : []),
    ...(age ? [`Idade: ${age}`] : []),
    `Cidade: ${String(data.city).trim()}`,
    `Gênero do personal: ${trainerGenderPreference}`,
    ...(typeof data.desiredDuration === 'string' && data.desiredDuration ? [`Tempo de acompanhamento: ${data.desiredDuration}`] : []),
    ...(data.attendsGym === true ? [`Frequenta academia: Sim${gymName ? ` — ${gymName}` : ''}`] : []),
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
      ConditionExpression: 'attribute_exists(codeHash) AND attribute_not_exists(#flow) AND expiresAt > :now AND attribute_not_exists(consumedAt)',
      ExpressionAttributeNames: { '#flow': 'flow' },
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
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/login')) {
    return beginCustomerLogin(parseBody(event))
  }
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/login-status')) {
    return getCustomerLoginStatus(parseBody(event))
  }
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/verify-login')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return verifyCustomerLogin(parseBody(event))
  }
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/profile')) return getCustomerProfile(event)
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/verification-status')) {
    return getCustomerVerificationStatus(parseBody(event))
  }
  if (event.httpMethod === 'GET' && event.resource?.endsWith('/requests/trainer-view')) return getTrainerRequest(event)
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/verify-whatsapp')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return verifyCustomerWhatsApp(parseBody(event))
  }
  if (event.httpMethod === 'POST' && event.resource?.endsWith('/customers/register')) {
    const registration = parseBody(event)
    if (!isValidCustomerRegistration(registration)) return response(400, { error: 'Confira nome, WhatsApp, e-mail e data de nascimento.' })
    try {
      const { verificationCode, verificationExpiresAt } = await registerCustomer(registration!)
      return response(201, { registered: true, status: 'pending_verification', verificationCode, verificationExpiresAt })
    } catch (error) {
      if (error instanceof Error && error.message === 'Esse WhatsApp já tem um cadastro confirmado.') return response(409, { error: error.message })
      if (error instanceof TransactionCanceledException && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) {
        return response(409, { error: 'Não foi possível iniciar o cadastro. Verifique se este WhatsApp já está cadastrado e tente novamente.' })
      }
      console.error('[imc-submit] Customer registration failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
      })
      return response(503, { error: 'Não foi possível registrar o cadastro agora. Tente novamente mais tarde.' })
    }
  }
  if (event.httpMethod === 'GET' && event.resource?.endsWith('/requests/valid')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return listValidFitpesoRequests(event)
  }
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

  if (event.resource?.endsWith('/requests/verify-whatsapp')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return verifyFitpesoRequest(parseBody(event))
  }

  if (event.resource?.endsWith('/requests/{requestId}/processed')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return markFitpesoRequestProcessed(event.pathParameters?.requestId?.trim() ?? '')
  }

  if (event.resource === '/api/requests') {
    const request = parseBody(event)
    if (!isValidRequest(request)) return response(400, { error: 'Confira os dados e o consentimento.' })
    try {
      return await createFitpesoRequest(request!)
    } catch (error) {
      console.error('[imc-submit] Fitpeso request registration failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
      })
      return response(503, { error: 'Não foi possível registrar a solicitação agora. Tente novamente.' })
    }
  }

  if (event.resource?.endsWith('/trainers/verify-whatsapp')) {
    if (!process.env.TRAINER_WHATSAPP_VERIFY_SECRET) return response(503, { error: 'Serviço temporariamente indisponível.' })
    if (!trainerVerificationSecretMatches(event)) return response(403, { error: 'Acesso não autorizado.' })
    return verifyTrainerWhatsApp(parseBody(event))
  }

  if (event.resource?.endsWith('/trainers/register')) {
    const registration = parseBody(event)
    if (!isValidTrainerRegistration(registration)) return response(400, { error: 'Confira nome, telefone, cidades, Instagram e os campos opcionais.' })
    try {
      const { slug, verificationCode } = await registerTrainer(registration!)
      return response(201, { registered: true, status: 'pending_verification', slug, verificationCode })
    } catch (error) {
      if (error instanceof TrainerSlugUnavailableError) {
        return response(409, { error: 'Esse endereço já está cadastrado para outros dados ou já foi ativado.' })
      }
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
