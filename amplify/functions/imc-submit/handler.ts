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
import type { APIGatewayProxyHandler } from 'aws-lambda'

const dynamodb = new DynamoDBClient({})
const codeLifetimeSeconds = 15 * 60
const corsHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, X-Fitpeso-Verification-Secret',
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
  const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
  const shifts = ['Manhã', 'Tarde', 'Noite']
  const trainingDays = data.trainingDays
  const trainingShifts = data.trainingShifts

  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) &&
    Boolean(phone) &&
    (email === '' || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) &&
    typeof instagram === 'string' && (instagram === '' || (/^@[A-Za-z0-9._]{1,30}$/.test(instagram) && !instagram.includes('..') && !instagram.endsWith('.'))) &&
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
    ProjectionExpression: '#city, #trainerId, #name, #whatsapp, #active, #status, #slug',
    ExpressionAttributeNames: {
      '#city': 'city',
      '#trainerId': 'trainerId',
      '#name': 'name',
      '#whatsapp': 'whatsapp',
      '#active': 'active',
      '#status': 'status',
      '#slug': 'slug',
    },
    ConsistentRead: true,
  }))))
  const matchingSignup = records.every((record, index) => {
    const item = record.Item
    return item?.city?.S === cities[index] && item.trainerId?.S === trainerId &&
      item.name?.S === name && item.whatsapp?.S === whatsapp && item.slug?.S === slug &&
      item.active?.BOOL === false && ['pending', 'pending_verification'].includes(item.status?.S ?? '')
  })
  if (!matchingSignup) throw new TrainerSlugUnavailableError()

  const challenge = createTrainerCode(trainerId, whatsapp, cities, slug)
  await dynamodb.send(new PutItemCommand({
    TableName: requestCodesTable,
    Item: challenge.item,
    ConditionExpression: 'attribute_not_exists(codeHash)',
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
      ProjectionExpression: '#city, #trainerId, #name, #whatsapp, #active, #slug, #instagram',
      ExpressionAttributeNames: {
        '#city': 'city',
        '#trainerId': 'trainerId',
        '#name': 'name',
        '#whatsapp': 'whatsapp',
        '#active': 'active',
        '#slug': 'slug',
        '#instagram': 'instagram',
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
    return [{ trainerId, name, whatsapp, slug, ...(instagram ? { instagram } : {}) }]
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
      const validUntil = request.validUntil
      return {
        ...request,
        eligibleTrainers: trainers.map(trainer => ({
          ...trainer,
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
  if (event.httpMethod === 'GET' && event.resource?.endsWith('/requests/trainer-view')) return getTrainerRequest(event)
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
