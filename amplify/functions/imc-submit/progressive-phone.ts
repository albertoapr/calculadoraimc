import { createHash, randomBytes } from 'node:crypto'
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, TransactWriteItemsCommand, TransactionCanceledException, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { findPersonIdByIdentification } from './identity-store'
import { betaTrainersByPhone } from './beta-onboarding'

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
  const customer = await db.send(new GetItemCommand({
    TableName: process.env.FITPESO_CUSTOMERS_TABLE!, Key: { whatsapp: { S: whatsapp } }, ConsistentRead: true,
  }))
  if (customer.Item && (customer.Item.whatsappVerified?.BOOL === true || customer.Item.status?.S !== 'PENDING_VERIFICATION')) return true
  const pessoaId = await findPersonIdByIdentification('WHATSAPP', whatsapp)
  if (!pessoaId) return false
  const userId = 'U_' + hash(pessoaId + '#CLIENTE').slice(0, 32)
  const role = await db.send(new GetItemCommand({ TableName: process.env.FITPESO_USUARIO_TABLE!,
    Key: { user_id: { S: userId } }, ConsistentRead: true }))
  return Boolean(role.Item)
}
export function normalizeSignupDisplayName(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 80)
}
export async function startPhoneSignup(event: APIGatewayProxyEvent) {
  const data = parse(event)
  const whatsapp = normalizeWhatsApp(data?.whatsapp)
  const role = data?.role ?? 'customer'
  if (!['customer', 'trainer'].includes(String(role)) || !whatsapp || !validSession(data?.sessionToken)) return reply(400, { error: 'Informe WhatsApp e sessão válidos.' })
  if (!process.env.FITPESO_CUSTOMERS_TABLE || !process.env.FITPESO_USUARIO_TABLE || !process.env.IMC_REQUESTS_TABLE) {
    return reply(503, { error: 'Cadastro temporariamente indisponível.' })
  }
  try {
    if (role === 'trainer' ? (await betaTrainersByPhone(whatsapp)).length > 0 : await registered(whatsapp)) {
      return reply(409, { registered: true, error: 'Este WhatsApp já possui cadastro. Entre na sua conta.' })
    }
    const code = randomBytes(16).toString('base64url')
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60
    await db.send(new PutItemCommand({
      TableName: process.env.IMC_REQUESTS_TABLE,
      Item: { codeHash: { S: hash(code) }, flow: { S: 'fitpeso-progressive-phone' },
        whatsapp: { S: whatsapp }, signupRole: { S: String(role) }, sessionHash: { S: hash(data!.sessionToken as string) },
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
    const verified = !expired && Boolean(challenge.consumedAt?.N)
    return reply(200, { verified, expired, ...(verified ? { whatsapp: challenge.whatsapp?.S ?? '', name: challenge.displayName?.S ?? '' } : {}) })
  } catch (error) {
    console.error('[signup] Phone status failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível consultar a confirmação.' })
  }
}
export async function verifyPhoneSignupFromBeta(event: APIGatewayProxyEvent) {
  const expected = process.env.TRAINER_WHATSAPP_VERIFY_SECRET
  const supplied = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === 'x-fitpeso-verification-secret')?.[1]
  if (!expected || !supplied || hash(expected) !== hash(supplied)) return reply(403, { error: 'Acesso não autorizado.' })
  return verifyProgressivePhone(parse(event))
}

export async function verifyProgressivePhone(data: Record<string, unknown> | null) {
  const whatsapp = normalizeWhatsApp(data?.whatsapp)
  if (!whatsapp || !validCode(data?.code)) return reply(200, { verified: false })
  if (!process.env.IMC_REQUESTS_TABLE) return reply(503, { error: 'Verificação indisponível.' })
  try {
    const codes = process.env.IMC_REQUESTS_TABLE!
    const key = { codeHash: { S: hash(data!.code as string) } }
    const proof = (await db.send(new GetItemCommand({ TableName: codes, Key: key, ConsistentRead: true }))).Item
    const now = Math.floor(Date.now() / 1000)
    if (proof?.flow?.S !== 'fitpeso-progressive-phone' || proof.whatsapp?.S !== whatsapp || Number(proof.expiresAt?.N ?? 0) <= now)
      return reply(200, { verified: false })
    if (proof.consumedAt?.N) return reply(200, { verified: true })
    const displayName = normalizeSignupDisplayName(data?.displayName ?? data?.pushName ?? data?.name)
    const update = {
      TableName: codes, Key: key,
      UpdateExpression: 'SET consumedAt = :now, displayName = :name',
      ConditionExpression: '#flow = :flow AND whatsapp = :phone AND expiresAt > :now AND attribute_not_exists(consumedAt)',
      ExpressionAttributeNames: { '#flow': 'flow' },
      ExpressionAttributeValues: {
        ':flow': { S: 'fitpeso-progressive-phone' }, ':phone': { S: whatsapp },
        ':name': { S: displayName }, ':now': { N: String(now) },
      },
    }
    if (proof.signupRole?.S === 'trainer') {
      const sessionHash = proof.sessionHash?.S ?? ''
      if (!/^[a-f0-9]{64}$/.test(sessionHash)) return reply(200, { verified: false })
      // Only the original browser knows the token represented by this hash.
      // Reuse the existing verified Beta trainer onboarding transaction.
      await db.send(new TransactWriteItemsCommand({ TransactItems: [
        { Update: update },
        { Put: { TableName: codes, Item: {
          codeHash: { S: sessionHash }, flow: { S: 'fitpeso-beta-trainer-signup-session' },
          whatsapp: { S: whatsapp }, name: { S: displayName }, expiresAt: { N: String(now + 15 * 60) },
        }, ConditionExpression: 'attribute_not_exists(codeHash)' } },
      ] }))
    } else await db.send(new UpdateItemCommand(update))
    return reply(200, { verified: true })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException || error instanceof TransactionCanceledException) return reply(200, { verified: false })
    console.error('[signup] Phone verification failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível confirmar o WhatsApp.' })
  }
}

export async function completePhoneSignup(data: Record<string, unknown> | null) {
  const code = data?.code, token = data?.sessionToken
  const name = typeof data?.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : ''
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : ''
  const sex = data?.sex, height = data?.heightCm
  if (!validCode(code) || !validSession(token) || name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name) ||
      (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (sex !== 'masculino' && sex !== 'feminino') ||
      (height !== undefined && (typeof height !== 'number' || !Number.isFinite(height) || height < 80 || height > 250)))
    return reply(400, { error: 'Confira os dados e confirme seu WhatsApp.' })
  const codes = process.env.IMC_REQUESTS_TABLE, customers = process.env.FITPESO_CUSTOMERS_TABLE
  if (!codes || !customers) return reply(503, { error: 'Cadastro indisponível.' })
  const now = Math.floor(Date.now() / 1000), sessionHash = hash(token)
  try {
    const proof = (await db.send(new GetItemCommand({ TableName: codes, Key: { codeHash: { S: hash(code) } }, ConsistentRead: true }))).Item
    const whatsapp = proof?.whatsapp?.S ?? ''
    if (!whatsapp || proof?.flow?.S !== 'fitpeso-progressive-phone' || (proof.signupRole?.S ?? 'customer') !== 'customer' || proof.sessionHash?.S !== sessionHash || !proof.consumedAt?.N || Number(proof.expiresAt?.N ?? 0) <= now)
      return reply(403, { error: 'Confirme seu WhatsApp antes de concluir o cadastro.' })
    if (proof.completedAt?.N) {
      const session = (await db.send(new GetItemCommand({ TableName: codes, Key: { codeHash: { S: sessionHash } }, ConsistentRead: true }))).Item
      if (session?.flow?.S === 'fitpeso-customer-login-session' && session.whatsapp?.S === whatsapp && Number(session.expiresAt?.N ?? 0) > now)
        return reply(200, { registered: true, authenticated: true, whatsapp })
      return reply(409, { error: 'Cadastro concluído. Entre na sua conta.' })
    }
    if (await registered(whatsapp)) return reply(409, { error: 'WhatsApp já cadastrado. Entre na sua conta.' })
    const timestamp = new Date(now * 1000).toISOString()
    await db.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: { TableName: codes, Key: { codeHash: { S: hash(code) } },
        UpdateExpression: 'SET completedAt = :now',
        ConditionExpression: '#flow = :flow AND (attribute_not_exists(signupRole) OR signupRole = :customer) AND sessionHash = :hash AND whatsapp = :phone AND expiresAt > :now AND attribute_exists(consumedAt) AND attribute_not_exists(completedAt)',
        ExpressionAttributeNames: { '#flow': 'flow' },
        ExpressionAttributeValues: { ':flow': { S: 'fitpeso-progressive-phone' }, ':customer': { S: 'customer' }, ':hash': { S: sessionHash }, ':phone': { S: whatsapp }, ':now': { N: String(now) } } },
      { Put: { TableName: customers, Item: { whatsapp: { S: whatsapp }, name: { S: name }, sex: { S: sex },
        ...(email ? { email: { S: email } } : {}), ...(typeof height === 'number' ? { heightCm: { N: String(height) } } : {}),
        status: { S: 'ACTIVE' }, whatsappVerified: { BOOL: true }, verifiedAt: { S: timestamp }, createdAt: { S: timestamp } },
        ConditionExpression: 'attribute_not_exists(whatsapp) OR (#status = :pending AND whatsappVerified = :false)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pending': { S: 'PENDING_VERIFICATION' }, ':false': { BOOL: false } } } },
      { Put: { TableName: codes, Item: { codeHash: { S: sessionHash }, flow: { S: 'fitpeso-customer-login-session' },
        identityProof: { S: 'WHATSAPP' }, whatsapp: { S: whatsapp }, expiresAt: { N: String(now + 12 * 60 * 60) } },
        ConditionExpression: 'attribute_not_exists(codeHash)' } },
    ] }))
    return reply(201, { registered: true, authenticated: true, whatsapp })
  } catch (error) {
    if (error instanceof TransactionCanceledException) return reply(409, { error: 'Cadastro alterado. Tente novamente ou entre na sua conta.' })
    console.error('[signup] Finalization failed', { type: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível concluir o cadastro.' })
  }
}
