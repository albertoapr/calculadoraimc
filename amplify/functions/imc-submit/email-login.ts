import { createHash, randomBytes } from 'node:crypto'
import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, TransactWriteItemsCommand, TransactionCanceledException, type AttributeValue } from '@aws-sdk/client-dynamodb'
import nodemailer from 'nodemailer'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const db = new DynamoDBClient({})
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
const reply = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers, body: JSON.stringify(body) })
const validCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)
function parse(event: APIGatewayProxyEvent): Record<string, unknown> | null {
  if (typeof event.body !== 'string' || Buffer.byteLength(event.body, 'utf8') > 8192) return null
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) } catch { return null }
}
type Identity = { whatsapp: string; trainerId?: string; city?: string }
async function lookupEmail(email: string, asTrainer: boolean): Promise<Identity | null> {
  if (!asTrainer) {
    const result = await db.send(new QueryCommand({
      TableName: process.env.FITPESO_CUSTOMERS_TABLE!,
      IndexName: 'CustomerByEmail',
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': { S: email } },
    }))
    const matching = (result.Items ?? []).filter(item =>
      item.status?.S === 'ACTIVE' && item.whatsappVerified?.BOOL === true && Boolean(item.whatsapp?.S))
    return matching.length === 1 ? { whatsapp: matching[0].whatsapp.S! } : null
  }
  const matches: Identity[] = []
  for (const city of ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']) {
    let cursor: Record<string, any> | undefined
    do {
      const result = await db.send(new QueryCommand({
        TableName: process.env.TRAINERS_TABLE!,
        KeyConditionExpression: '#city = :city',
        ExpressionAttributeNames: { '#city': 'city', '#id': 'trainerId', '#email': 'email', '#phone': 'whatsapp', '#active': 'active', '#verified': 'whatsappVerified' },
        ExpressionAttributeValues: { ':city': { S: city } },
        ProjectionExpression: '#id, #email, #phone, #active, #verified',
        ExclusiveStartKey: cursor,
      }))
      for (const item of result.Items ?? []) {
        if (item.email?.S?.toLowerCase() === email &&
            item.active?.BOOL === true && item.whatsappVerified?.BOOL === true &&
            item.trainerId?.S && item.whatsapp?.S) {
          matches.push({ trainerId: item.trainerId.S, whatsapp: item.whatsapp.S, city })
        }
      }
      cursor = result.LastEvaluatedKey
    } while (cursor)
  }
  const unique = [...new Map(matches.map(x => [x.trainerId, x])).values()]
  return unique.length === 1 ? unique[0] : null
}

export async function beginEmailLogin(event: APIGatewayProxyEvent) {
  const data = parse(event)
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : ''
  const sessionToken = data?.sessionToken
  const asTrainer = data?.asTrainer === true
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !validCode(sessionToken)) return reply(400, { error: 'Informe um e-mail válido.' })
  if (!process.env.IMC_REQUESTS_TABLE || !process.env.FITPESO_CUSTOMERS_TABLE || !process.env.TRAINERS_TABLE ||
      !process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) return reply(503, { error: 'Confirmação por e-mail indisponível.' })
  try {
    // One outstanding request per email/role per minute, atomically. Prevents accidental resend/spam.
    const cooldownKey = digest('email-login-cooldown:' + (asTrainer ? 'trainer:' : 'customer:') + email)
    const now = Math.floor(Date.now() / 1000)
    try {
      await db.send(new PutItemCommand({
        TableName: process.env.IMC_REQUESTS_TABLE,
        Item: { codeHash: { S: cooldownKey }, flow: { S: 'email-login-cooldown' }, expiresAt: { N: String(now + 60) } },
        ConditionExpression: 'attribute_not_exists(codeHash) OR expiresAt < :now',
        ExpressionAttributeValues: { ':now': { N: String(now) } },
      }))
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return reply(429, { error: 'Aguarde um minuto antes de solicitar outro link.' })
      throw error
    }
    const identity = await lookupEmail(email, asTrainer)
    if (!identity) return reply(400, { error: 'Não foi possível validar esses dados. Confira e-mail, nascimento e o tipo de cadastro.' })
    const code = randomBytes(32).toString('base64url')
    const expiresAt = now + 15 * 60
    const record: Record<string, AttributeValue> = {
      codeHash: { S: digest(code) }, flow: { S: 'fitpeso-email-login' },
      email: { S: email }, whatsapp: { S: identity.whatsapp },
      sessionTokenHash: { S: digest(sessionToken) },
      role: { S: asTrainer ? 'trainer' : 'customer' },
      expiresAt: { N: String(expiresAt) },
    }
    if (identity.trainerId && identity.city) {
      record.trainerId = { S: identity.trainerId }
      record.city = { S: identity.city }
    }
    await db.send(new PutItemCommand({
      TableName: process.env.IMC_REQUESTS_TABLE,
      Item: record,
      ConditionExpression: 'attribute_not_exists(codeHash)',
    }))
    const host = event.requestContext.domainName
    const stage = event.requestContext.stage
    if (!host || !stage || !/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('API host unavailable')
    const url = 'https://fitpeso.com.br/?emailLoginCode=' + encodeURIComponent(code)
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASSWORD },
    })
    await transport.sendMail({
      from: process.env.GMAIL_USER, to: email,
      subject: 'FitPeso — confirme seu login',
      text: 'Para confirmar seu login no FitPeso, abra o link abaixo:\n\n' + url +
        '\n\nO link expira em 15 minutos. Se não solicitou este acesso, ignore esta mensagem.',
    })
    return reply(200, { started: true, expiresAt })
  } catch (error) {
    console.error('[email-login] Login initialization failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível enviar a confirmação por e-mail.' })
  }
}

export async function emailLoginStatus(event: APIGatewayProxyEvent) {
  const data = parse(event)
  if (!validCode(data?.sessionToken) || (data?.role !== 'trainer' && data?.role !== 'customer')) {
    return reply(200, { authenticated: false })
  }
  const table = process.env.IMC_REQUESTS_TABLE
  if (!table) return reply(503, { error: 'Serviço indisponível.' })
  try {
    const session = (await db.send(new GetItemCommand({
      TableName: table, Key: { codeHash: { S: digest(data.sessionToken) } }, ConsistentRead: true,
    }))).Item
    return reply(200, {
      authenticated: session?.flow?.S === (data.role === 'trainer' ? 'fitpeso-trainer-login-session' : 'fitpeso-customer-login-session') &&
        Number(session.expiresAt?.N ?? 0) > Math.floor(Date.now() / 1000),
    })
  } catch {
    return reply(503, { error: 'Não foi possível consultar o login.' })
  }
}

export async function verifyEmailLogin(event: APIGatewayProxyEvent) {
  const code = event.queryStringParameters?.code ?? ''
  if (!validCode(code)) return reply(400, { error: 'Link de confirmação inválido.' })
  // GET never consumes a magic link: mail preview scanners may follow links automatically.
  if (event.httpMethod === 'GET') {
    return { statusCode: 302, headers: { location: 'https://fitpeso.com.br/?emailLoginCode=' + encodeURIComponent(code), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' }
  }
  const table = process.env.IMC_REQUESTS_TABLE
  if (!table) return reply(503, { error: 'Serviço indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  let ok = false
  let browserSessionToken = ''
  let challengeRole = 'customer'
  try {
    const challenge = (await db.send(new GetItemCommand({
      TableName: table, Key: { codeHash: { S: digest(code) } }, ConsistentRead: true,
    }))).Item
    if (challenge?.flow?.S === 'fitpeso-email-login' && Number(challenge.expiresAt?.N ?? 0) > now &&
        !challenge.consumedAt?.N && challenge.sessionTokenHash?.S &&
        challenge.whatsapp?.S && challenge.email?.S) {
      const record: Record<string, AttributeValue> = {
        codeHash: { S: challenge.sessionTokenHash.S },
        flow: { S: challenge.role?.S === 'trainer' ? 'fitpeso-trainer-login-session' : 'fitpeso-customer-login-session' },
        whatsapp: { S: challenge.whatsapp.S },
        expiresAt: { N: String(now + 12 * 60 * 60) },
      }
      if (challenge.role?.S === 'trainer' && challenge.trainerId?.S && challenge.city?.S) {
        record.trainerId = { S: challenge.trainerId.S }
        record.city = { S: challenge.city.S }
      }
      challengeRole = challenge.role?.S === 'trainer' ? 'trainer' : 'customer'
      browserSessionToken = randomBytes(32).toString('base64url')
      const browserRecord: Record<string, AttributeValue> = { ...record, codeHash: { S: digest(browserSessionToken) } }
      await db.send(new TransactWriteItemsCommand({
        TransactItems: [
          { Update: { TableName: table, Key: { codeHash: { S: digest(code) } },
            UpdateExpression: 'SET consumedAt = :now',
            ConditionExpression: '#flow = :flow AND expiresAt > :now AND attribute_not_exists(consumedAt)',
            ExpressionAttributeNames: { '#flow': 'flow' },
            ExpressionAttributeValues: { ':flow': { S: 'fitpeso-email-login' }, ':now': { N: String(now) } },
          } },
          { Put: { TableName: table, Item: record, ConditionExpression: 'attribute_not_exists(codeHash)' } },
          { Put: { TableName: table, Item: browserRecord, ConditionExpression: 'attribute_not_exists(codeHash)' } },
        ],
      }))
      ok = true
    }
  } catch (error) {
    if (!(error instanceof TransactionCanceledException)) {
      console.error('[email-login] Confirmation failed', { errorClass: error instanceof Error ? error.name : typeof error })
    }
  }
  return ok
    ? reply(200, { authenticated: true, sessionToken: browserSessionToken, role: challengeRole })
    : reply(410, { error: 'Este link expirou ou já foi utilizado. Solicite um novo login no FitPeso.' })
}
