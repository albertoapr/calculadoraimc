import { createHash, randomBytes } from 'node:crypto'
import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
import { OAuth2Client } from 'google-auth-library'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { activateGoogleTrainerIdentity, loadGoogleCustomerIdentity } from './identity-bootstrap'
import { findPersonIdByIdentification, listPersonProfiles } from './identity-store'

/** A confirmação chega somente do número informado pelo provedor da Beta.
 * O Google autentica a pessoa, mas nunca comprova titularidade do telefone. */
const db = new DynamoDBClient({})
const cities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const reply = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})
const table = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error('PHONE_VERIFICATION_TABLE_UNAVAILABLE')
  return value
}
const phoneOf = (value: unknown) => {
  if (typeof value !== 'string') return ''
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? '+' + digits : ''
}

async function googleOwner(event: APIGatewayProxyEvent) {
  const token = (event.headers?.authorization ?? event.headers?.Authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
  if (!token || !process.env.GOOGLE_OAUTH_CLIENT_ID) return null
  try {
    const payload = (await new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID).verifyIdToken({
      idToken: token, audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    })).getPayload()
    if (!payload?.sub || !payload.email_verified || !payload.email) return null
    const account = await loadGoogleCustomerIdentity(payload.sub)
    if (!account || account.item.email?.S !== payload.email.toLowerCase()) return null
    return account
  } catch {
    return null
  }
}

async function trainerRowsForPerson(pessoaId: string) {
  const rows: { city: string; trainerId: string; whatsapp: string; userId: string }[] = []
  for (const city of cities) {
    let cursor: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined
    do {
      const result = await db.send(new QueryCommand({
        TableName: table('TRAINERS_TABLE'),
        KeyConditionExpression: '#city = :city',
        ExpressionAttributeNames: { '#city': 'city' },
        ExpressionAttributeValues: { ':city': { S: city } },
        ExclusiveStartKey: cursor,
      }))
      for (const item of result.Items ?? []) {
        if (item.pessoa_id?.S === pessoaId && item.identitySource?.S === 'GOOGLE' && item.trainerId?.S)
          rows.push({ city, trainerId: item.trainerId.S, whatsapp: item.whatsapp?.S ?? '', userId: item.user_id?.S ?? '' })
      }
      cursor = result.LastEvaluatedKey
    } while (cursor)
  }
  return rows
}

async function phoneUsedByAnotherAccount(phone: string, pessoaId: string) {
  const owner = await findPersonIdByIdentification('WHATSAPP', phone)
  if (owner && owner !== pessoaId) return true
  const customer = await db.send(new GetItemCommand({
    TableName: table('FITPESO_CUSTOMERS_TABLE'),
    Key: { whatsapp: { S: phone } }, ConsistentRead: true,
  }))
  if (customer.Item?.whatsappVerified?.BOOL === true &&
      customer.Item.pessoa_id?.S !== pessoaId) return true
  for (const city of cities) {
    let cursor: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined
    do {
      const page = await db.send(new QueryCommand({
        TableName: table('TRAINERS_TABLE'),
        KeyConditionExpression: '#city = :city',
        ExpressionAttributeNames: { '#city': 'city' },
        ExpressionAttributeValues: { ':city': { S: city } },
        ExclusiveStartKey: cursor,
      }))
      if ((page.Items ?? []).some(row => row.whatsapp?.S === phone &&
        row.whatsappVerified?.BOOL === true && row.pessoa_id?.S !== pessoaId)) return true
      cursor = page.LastEvaluatedKey
    } while (cursor)
  }
  return false
}

export async function startGooglePhoneVerification(event: APIGatewayProxyEvent, data: Record<string, unknown> | null) {
  const account = await googleOwner(event)
  if (!account) return reply(401, { error: 'Entre novamente pelo Google para verificar seu WhatsApp.' })
  const phone = phoneOf(data?.whatsapp)
  if (!phone) return reply(400, { error: 'Informe um WhatsApp válido com DDD.' })
  if (account.item.whatsappVerified?.BOOL === true)
    return reply(409, { error: 'Seu WhatsApp já está confirmado.' })
  if (await phoneUsedByAnotherAccount(phone, account.pessoaId))
    return reply(409, { error: 'Este WhatsApp já está vinculado a outro cadastro.' })
  const code = randomBytes(16).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60
  await db.send(new PutItemCommand({
    TableName: table('IMC_REQUESTS_TABLE'),
    Item: {
      codeHash: { S: hash(code) },
      flow: { S: 'fitpeso-google-phone-verification' },
      pessoa_id: { S: account.pessoaId },
      whatsapp: { S: phone },
      expiresAt: { N: String(expiresAt) },
    },
    ConditionExpression: 'attribute_not_exists(codeHash)',
  }))
  return reply(200, { started: true, code, expiresAt,
    verificationUrl: 'https://wa.me/5521971118383?text=' +
      encodeURIComponent('Confirmar login FitPeso ' + code) })
}

/** Consultado somente pela sessão Google titular do desafio. */
export async function googlePhoneVerificationStatus(event: APIGatewayProxyEvent, data: Record<string, unknown> | null) {
  const account = await googleOwner(event)
  if (!account) return reply(401, { error: 'Sessão Google expirada. Entre novamente.' })
  const code = typeof data?.code === 'string' ? data.code : ''
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return reply(400, { error: 'Verificação inválida.' })
  const result = await db.send(new GetItemCommand({
    TableName: table('IMC_REQUESTS_TABLE'),
    Key: { codeHash: { S: hash(code) } }, ConsistentRead: true,
  }))
  const row = result.Item
  if (row?.flow?.S !== 'fitpeso-google-phone-verification' || row.pessoa_id?.S !== account.pessoaId)
    return reply(404, { error: 'Verificação não encontrada.' })
  return reply(200, {
    verified: Boolean(row.consumedAt?.N && account.item.whatsappVerified?.BOOL === true &&
      account.item.whatsapp?.S === row.whatsapp?.S),
    expired: !row.consumedAt?.N && Number(row.expiresAt?.N ?? 0) <= Math.floor(Date.now() / 1000),
  })
}

/** Invocado exclusivamente por /customers/verify-login após autenticar o segredo
 * da integração Beta; whatsapp vem dos metadados do remetente, não da mensagem. */
export async function verifyGooglePhoneFromBeta(data: Record<string, unknown> | null) {
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  const phone = phoneOf(data?.whatsapp)
  if (!/^[A-Za-z0-9_-]{22}$/.test(code) || !phone) return reply(200, { verified: false })
  const key = { codeHash: { S: hash(code) } }
  const challenge = (await db.send(new GetItemCommand({
    TableName: table('IMC_REQUESTS_TABLE'), Key: key, ConsistentRead: true,
  }))).Item
  const now = Math.floor(Date.now() / 1000)
  if (challenge?.flow?.S !== 'fitpeso-google-phone-verification' ||
      challenge.whatsapp?.S !== phone || Number(challenge.expiresAt?.N ?? 0) <= now)
    return reply(200, { verified: false })
  if (challenge.consumedAt?.N) return reply(200, { verified: true, alreadyVerified: true })
  const pessoaId = challenge.pessoa_id?.S ?? ''
  if (!pessoaId) return reply(200, { verified: false })
  try {
    const profiles = await listPersonProfiles(pessoaId)
    const client = profiles.find(p => p.tipo === 'CLIENTE' && p.clienteId)
    if (!client?.clienteId) return reply(200, { verified: false })
    if (await phoneUsedByAnotherAccount(phone, pessoaId))
      return reply(409, { verified: false, error: 'WhatsApp já utilizado por outro cadastro.' })
    const trainerRows = await trainerRowsForPerson(pessoaId)
    const personalUser = profiles.find(p => p.tipo === 'PERSONAL')?.usuarioId
    const validTrainerRows = trainerRows.filter(row => !row.userId || row.userId === personalUser)
    if (validTrainerRows.length !== trainerRows.length)
      return reply(409, { verified: false, error: 'Vínculo profissional precisa de revisão.' })
    const actions: import('@aws-sdk/client-dynamodb').TransactWriteItemsCommandInput['TransactItems'] = [
      { Update: {
        TableName: table('FITPESO_PESSOA_IDENTIFICACAO_TABLE'),
        Key: { identificationKey: { S: 'WHATSAPP#' + phone } },
        UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :person), #tipo = if_not_exists(#tipo, :type), verificado_em = if_not_exists(verificado_em, :verified)',
        ConditionExpression: 'attribute_not_exists(identificationKey) OR pessoa_id = :person',
        ExpressionAttributeNames: { '#tipo': 'tipo' },
        ExpressionAttributeValues: {
          ':person': { S: pessoaId }, ':type': { S: 'WHATSAPP' },
          ':verified': { S: new Date(now * 1000).toISOString() },
        },
      } },
      { Update: {
        TableName: table('IMC_REQUESTS_TABLE'), Key: key,
        UpdateExpression: 'SET consumedAt = :now',
        ConditionExpression: '#flow = :flow AND whatsapp = :phone AND expiresAt > :now AND attribute_not_exists(consumedAt)',
        ExpressionAttributeNames: { '#flow': 'flow' },
        ExpressionAttributeValues: {
          ':flow': { S: 'fitpeso-google-phone-verification' }, ':phone': { S: phone },
          ':now': { N: String(now) },
        },
      } },
      { Update: {
        TableName: table('FITPESO_CUSTOMER_V2_TABLE'),
        Key: { customer_id: { S: client.clienteId } },
        UpdateExpression: 'SET whatsapp = :phone, whatsappVerified = :yes',
        ConditionExpression: 'user_id = :user AND (attribute_not_exists(whatsappVerified) OR whatsappVerified = :no OR whatsapp = :phone)',
        ExpressionAttributeValues: {
          ':phone': { S: phone }, ':user': { S: client.usuarioId },
          ':yes': { BOOL: true }, ':no': { BOOL: false },
        },
      } },
      ...validTrainerRows.map(row => ({ Update: {
        TableName: table('TRAINERS_TABLE'),
        Key: { city: { S: row.city }, trainerId: { S: row.trainerId } },
        UpdateExpression: 'SET whatsapp = :phone, whatsappVerified = :yes, active = :yes, #status = :active, whatsappVerifiedAt = :now',
        ConditionExpression: 'pessoa_id = :person AND identitySource = :google AND (attribute_not_exists(user_id) OR user_id = :user)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':phone': { S: phone }, ':person': { S: pessoaId }, ':google': { S: 'GOOGLE' },
          ':user': { S: personalUser ?? '' }, ':yes': { BOOL: true },
          ':active': { S: 'active' }, ':now': { N: String(now) },
        },
      } })),
    ]
    await db.send(new TransactWriteItemsCommand({ TransactItems: actions }))
    for (const group of new Map(validTrainerRows.map(row => [row.trainerId,
      validTrainerRows.filter(item => item.trainerId === row.trainerId).map(item => item.city)])).entries()) {
      const [trainerId, trainerCities] = group
      try { await activateGoogleTrainerIdentity({ pessoaId, trainerId, cities: trainerCities, whatsapp: phone }) }
      catch (error) { console.warn('[fitpeso] Google personal role sync pending', { reason: error instanceof Error ? error.name : 'UNKNOWN' }) }
    }
    return reply(200, { verified: true })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException || error instanceof Error && error.message === 'IDENTIFICATION_ALREADY_LINKED')
      return reply(409, { verified: false, error: 'Este WhatsApp já está vinculado a outra pessoa.' })
    console.error('[fitpeso] Google phone verification error', { name: error instanceof Error ? error.name : 'UNKNOWN' })
    return reply(503, { verified: false, error: 'Não foi possível concluir a verificação agora.' })
  }
}
