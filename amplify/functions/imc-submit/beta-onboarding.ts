import { createHash, randomBytes } from 'node:crypto'
import {
  ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand,
  QueryCommand, TransactWriteItemsCommand, UpdateItemCommand, TransactionCanceledException,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import { createWhatsAppMagicLink, createBetaTrainerSignupLink, type WhatsAppLinkRole } from './whatsapp-login-link'
import { parseBetaOnboardingMessage, type BetaOnboardingMessage } from './beta-onboarding-command'
import { createBetaOnboardingInvitation, verifyBetaOnboardingInvitation } from './beta-onboarding-signature'

const db = new DynamoDBClient({})
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const headers = {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  'referrer-policy': 'no-referrer', 'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Fitpeso-Verification-Secret',
  'access-control-allow-methods': 'POST,OPTIONS',
}
const reply = (statusCode: number, body: Record<string, unknown>) =>
  ({ statusCode, headers, body: JSON.stringify(body) })
const validToken = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)
function phone(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? '+' + digits : ''
}
function betaName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name) ? name : ''
}
const table = () => process.env.IMC_REQUESTS_TABLE!
const customers = () => process.env.FITPESO_CUSTOMERS_TABLE!
const trainers = () => process.env.TRAINERS_TABLE!
const baseUrl = () => process.env.FITPESO_WHATSAPP_LOGIN_URL!
const secret = () => process.env.TRAINER_WHATSAPP_VERIFY_SECRET!
const ready = () => Boolean(table() && customers() && trainers() && baseUrl() && secret())

function comparable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Auto-select only one active academy with the exact city, name and neighborhood. */
async function resolveBetaAcademy(request: BetaOnboardingMessage) {
  if (!request.city || !request.academyName || !process.env.ACADEMIES_TABLE)
    return { match: 'not_found' as const }
  const found: Array<{ id: string; name: string; neighborhood: string }> = []
  let cursor: Record<string, AttributeValue> | undefined
  do {
    const page = await db.send(new QueryCommand({
      TableName: process.env.ACADEMIES_TABLE,
      IndexName: 'AcademiesByCity',
      KeyConditionExpression: '#city = :city',
      ExpressionAttributeNames: { '#city': 'city' },
      ExpressionAttributeValues: { ':city': { S: request.city } },
      ExclusiveStartKey: cursor,
    }))
    for (const item of page.Items ?? []) {
      const name = item.name?.S ?? ''
      const neighborhood = item.neighborhood?.S ?? ''
      if (item.active?.BOOL === true && item.academyId?.S &&
          comparable(name.replace(/^academia\s+/i, '')) === comparable(request.academyName.replace(/^academia\s+/i, '')) &&
          (!request.neighborhood || comparable(neighborhood) === comparable(request.neighborhood))) {
        found.push({ id: item.academyId.S, name, neighborhood })
      }
    }
    cursor = page.LastEvaluatedKey
  } while (cursor)
  if (found.length !== 1) return { match: found.length ? 'ambiguous' as const : 'not_found' as const }
  return { match: 'matched' as const, academyId: found[0].id, academyName: found[0].name, neighborhood: found[0].neighborhood }
}

export async function betaTrainersByPhone(whatsapp: string) {
  const found: Array<{ trainerId: string; city: string; active: boolean; verified: boolean }> = []
  for (const city of ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']) {
    let cursor: Record<string, AttributeValue> | undefined
    do {
      const page = await db.send(new QueryCommand({
        TableName: trainers(),
        KeyConditionExpression: '#city = :city',
        FilterExpression: '#phone = :phone',
        ProjectionExpression: '#id, #phone, #active, #verified',
        ExpressionAttributeNames: {
          '#city': 'city', '#id': 'trainerId', '#phone': 'whatsapp',
          '#active': 'active', '#verified': 'whatsappVerified',
        },
        ExpressionAttributeValues: { ':city': { S: city }, ':phone': { S: whatsapp } },
        ExclusiveStartKey: cursor,
      }))
      for (const item of page.Items ?? []) if (item.trainerId?.S) {
        found.push({
          trainerId: item.trainerId.S, city,
          active: item.active?.BOOL === true, verified: item.whatsappVerified?.BOOL === true,
        })
      }
      cursor = page.LastEvaluatedKey
    } while (cursor)
  }
  return found
}

async function createLoginLink(
  whatsapp: string, role: WhatsAppLinkRole, trainer?: { trainerId: string; city: string },
) {
  const now = Math.floor(Date.now() / 1000)
  const link = createWhatsAppMagicLink({
    code: randomBytes(16).toString('base64url'), whatsapp, role,
    challengeExpiresAt: now + 300, secret: secret(), baseUrl: baseUrl(), nowSeconds: now,
    trainerId: trainer?.trainerId, city: trainer?.city,
  })
  await db.send(new PutItemCommand({
    TableName: table(), Item: link.item,
    ConditionExpression: 'attribute_not_exists(codeHash)',
  }))
  return { loginLink: link.loginLink, loginLinkExpiresAt: link.expiresAt }
}

/**
 * Mint one signed, permanent, shareable invitation for an ACTIVE academy.
 * Beta calls this once, using the same integration secret as other Beta routes.
 * The output is identical every time for the same academy and secret.
 */
export async function betaOnboardingTemplate(data: Record<string, unknown> | null) {
  if (!secret() || !process.env.ACADEMIES_TABLE)
    return reply(503, { error: 'Serviço de convites indisponível.' })
  const role = data?.role
  if (role !== 'trainer' && role !== 'customer')
    return reply(400, { error: 'Informe role: trainer ou customer.' })
  const academyId = data?.academyId
  if (academyId !== undefined && (role !== 'trainer' || typeof academyId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(academyId)))
    return reply(400, { error: 'Identificador de academia inválido.' })
  try {
    let message = role === 'customer' ? 'Sou cliente fitpeso' : 'Sou personal fitpeso'
    if (role === 'trainer' && typeof academyId === 'string') {
      const result = await db.send(new GetItemCommand({
        TableName: process.env.ACADEMIES_TABLE,
        Key: { academyId: { S: academyId } },
        ConsistentRead: true,
      }))
      const academy = result.Item
      if (!academy || academy.active?.BOOL !== true)
        return reply(404, { error: 'Academia não encontrada ou inativa.' })
      const name = (academy.name?.S ?? '').trim().replace(/^academia\s+/i, '').trim()
      const neighborhood = (academy.neighborhood?.S ?? '').trim()
      const city = academy.city?.S ?? ''
      message = `Sou personal da Academia ${name}, no bairro ${neighborhood}, em ${city}, e quero me cadastrar na FitPeso.`
      const parsed = parseBetaOnboardingMessage(message)
      if (parsed?.role !== 'trainer' || parsed.city !== city ||
          comparable(parsed.academyName ?? '') !== comparable(name) ||
          comparable(parsed.neighborhood ?? '') !== comparable(neighborhood)) {
        return reply(422, { error: 'Os dados desta academia não permitem gerar uma mensagem padrão. Confira o cadastro.' })
      }
    }
    return reply(200, { role, ...(typeof academyId === 'string' ? { academyId } : {}),
      ...createBetaOnboardingInvitation(message, secret()),
    })
  } catch (error) {
    console.error('[beta-onboarding] Signed template issue failed', {
      errorClass: error instanceof Error ? error.name : typeof error,
    })
    return reply(503, { error: 'Não foi possível gerar a mensagem padrão.' })
  }
}

/** Invoked ONLY by secret-authenticated Beta using the transport's sender phone. */
export async function betaOnboardingCommand(data: Record<string, unknown> | null) {
  if (!ready()) return reply(503, { error: 'Serviço indisponível.' })
  // The signed invitation is identical for EVERY recipient. Reject any edited
  // text or hash before parsing, touching DynamoDB, or issuing a login link.
  const approvedText = verifyBetaOnboardingInvitation(data?.message, secret())
  if (!approvedText) return reply(422, {
    error: 'Mensagem de cadastro alterada ou sem hash válido. Compartilhe a mensagem original, sem editar.',
  })
  const parsed = parseBetaOnboardingMessage(approvedText)
  const role = parsed?.role
  const whatsapp = phone(data?.whatsapp)
  if (!whatsapp || !role) return reply(400, {
    error: 'Mensagem de cadastro ou número do remetente inválido.',
  })
  const now = Math.floor(Date.now() / 1000)
  // Bounded reply rate avoids chat loops, link floods, and repeated side effects.
  try {
    await db.send(new PutItemCommand({
      TableName: table(),
      Item: {
        codeHash: { S: hash('fitpeso:beta-onboarding:v1:' + role + ':' + whatsapp) },
        flow: { S: 'fitpeso-beta-onboarding-cooldown' },
        expiresAt: { N: String(now + 30) },
      },
      ConditionExpression: 'attribute_not_exists(codeHash) OR expiresAt < :now',
      ExpressionAttributeValues: { ':now': { N: String(now) } },
    }))
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException)
      return reply(429, { error: 'Aguarde 30 segundos antes de solicitar outro link.' })
    return reply(503, { error: 'Não foi possível iniciar o atendimento.' })
  }
  try {
    if (role === 'customer') {
      const name = betaName(data?.name) || 'Cliente FitPeso'
      const existing = (await db.send(new GetItemCommand({
        TableName: customers(), Key: { whatsapp: { S: whatsapp } }, ConsistentRead: true,
      }))).Item
      let registered = false
      if (!existing) {
        await db.send(new PutItemCommand({
          TableName: customers(),
          Item: {
            whatsapp: { S: whatsapp }, name: { S: name },
            status: { S: 'ACTIVE' }, whatsappVerified: { BOOL: true },
            createdAt: { S: new Date(now * 1000).toISOString() },
            verifiedAt: { S: new Date(now * 1000).toISOString() },
            signupSource: { S: 'BETA_WHATSAPP' }, profileIncomplete: { BOOL: true },
          },
          ConditionExpression: 'attribute_not_exists(whatsapp)',
        }))
        registered = true
      } else if (existing.status?.S === 'PENDING_VERIFICATION' && existing.whatsappVerified?.BOOL === false) {
        // Do not trust a name previously typed by an unauthenticated browser.
        await db.send(new UpdateItemCommand({
          TableName: customers(), Key: { whatsapp: { S: whatsapp } },
          UpdateExpression: 'SET #status = :active, whatsappVerified = :yes, verifiedAt = :now, #name = :name, signupSource = :source, profileIncomplete = :incomplete',
          ConditionExpression: '#status = :pending AND whatsappVerified = :no',
          ExpressionAttributeNames: { '#status': 'status', '#name': 'name' },
          ExpressionAttributeValues: {
            ':active': { S: 'ACTIVE' }, ':pending': { S: 'PENDING_VERIFICATION' },
            ':yes': { BOOL: true }, ':no': { BOOL: false },
            ':now': { S: new Date(now * 1000).toISOString() }, ':name': { S: name },
            ':source': { S: 'BETA_WHATSAPP' }, ':incomplete': { BOOL: true },
          },
        }))
        registered = true
      } else if (existing.status?.S !== 'ACTIVE' || existing.whatsappVerified?.BOOL !== true) {
        return reply(409, { error: 'Este cadastro está indisponível. Procure o suporte FitPeso.' })
      }
      const link = await createLoginLink(whatsapp, 'customer')
      return reply(200, {
        ok: true, role, action: registered ? 'registered_and_login' : 'login',
        registered, ...link,
        replyText: (registered ? 'Seu cadastro de cliente FitPeso foi criado! ' : 'Bem-vindo de volta à FitPeso! ') +
          'Entre pelo link seguro. É de uso único e expira em 5 minutos:\n' + link.loginLink,
      })
    }

    const matches = await betaTrainersByPhone(whatsapp)
    const trainerIds = [...new Set(matches.map(x => x.trainerId))]
    if (trainerIds.length > 1 || matches.some(x => !x.active || !x.verified))
      return reply(409, { error: 'Já existe um cadastro de personal pendente ou conflitante. Procure o suporte.' })
    if (trainerIds.length === 1) {
      const link = await createLoginLink(whatsapp, 'trainer', matches[0])
      return reply(200, {
        ok: true, role, action: 'login', registered: false, ...link,
        replyText: 'Seu perfil de personal FitPeso já existe. Entre pelo link seguro (válido por 5 minutos, uso único):\n' + link.loginLink,
      })
    }
    const academy = await resolveBetaAcademy(parsed!)
    const code = randomBytes(32).toString('base64url')
    const expiresAt = now + 5 * 60
    const loginLink = createBetaTrainerSignupLink(baseUrl(), code)
    await db.send(new PutItemCommand({
      TableName: table(),
      Item: {
        codeHash: { S: hash(code) }, flow: { S: 'fitpeso-beta-trainer-signup-link' },
        whatsapp: { S: whatsapp }, ...(betaName(data?.name) ? { name: { S: betaName(data?.name) } } : {}),
        ...(parsed?.city ? { city: { S: parsed.city } } : {}),
        ...(parsed?.sexHint ? { sexHint: { S: parsed.sexHint } } : {}),
        ...(parsed?.academyName ? { proposedAcademyName: { S: parsed.academyName } } : {}),
        ...(parsed?.neighborhood ? { proposedNeighborhood: { S: parsed.neighborhood } } : {}),
        academyMatch: { S: academy.match },
        ...(academy.match === 'matched' ? {
          academyId: { S: academy.academyId }, academyName: { S: academy.academyName },
        } : {}),
        expiresAt: { N: String(expiresAt) },
      },
      ConditionExpression: 'attribute_not_exists(codeHash)',
    }))
    return reply(200, {
      ok: true, role, action: 'complete_registration', registered: false,
      loginLink, loginLinkExpiresAt: expiresAt,
      replyText: 'Seu cadastro de personal FitPeso foi iniciado! O número do WhatsApp já está confirmado. ' +
        'Abra o link seguro para conferir seus dados e concluir o cadastro (válido por 5 minutos):\n' + loginLink,
    })
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException || error instanceof TransactionCanceledException)
      return reply(409, { error: 'Cadastro alterado durante a solicitação. Tente novamente.' })
    console.error('[beta-onboarding] Command failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível iniciar o cadastro agora.' })
  }
}

/** Only POST redeems; link previews cannot burn a one-use code. */
export async function redeemBetaTrainerSignup(data: Record<string, unknown> | null) {
  const code = data?.code
  if (!validToken(code)) return reply(410, { error: 'Link inválido.' })
  if (!table()) return reply(503, { error: 'Serviço indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  try {
    const row = (await db.send(new GetItemCommand({
      TableName: table(), Key: { codeHash: { S: hash(code) } }, ConsistentRead: true,
    }))).Item
    const whatsapp = phone(row?.whatsapp?.S)
    if (row?.flow?.S !== 'fitpeso-beta-trainer-signup-link' || row.consumedAt?.N ||
        Number(row.expiresAt?.N ?? 0) <= now || !whatsapp)
      return reply(410, { error: 'Link usado ou expirado. Solicite outro à Beta.' })
    const sessionToken = randomBytes(32).toString('base64url')
    await db.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: {
        TableName: table(), Key: { codeHash: { S: hash(code) } },
        UpdateExpression: 'SET consumedAt = :now',
        ConditionExpression: '#flow = :flow AND expiresAt > :now AND attribute_not_exists(consumedAt)',
        ExpressionAttributeNames: { '#flow': 'flow' },
        ExpressionAttributeValues: {
          ':flow': { S: 'fitpeso-beta-trainer-signup-link' }, ':now': { N: String(now) },
        },
      } },
      { Put: {
        TableName: table(),
        Item: {
          codeHash: { S: hash(sessionToken) }, flow: { S: 'fitpeso-beta-trainer-signup-session' },
          whatsapp: { S: whatsapp }, ...(row.name?.S ? { name: { S: row.name.S } } : {}),
          ...(row.city?.S ? { city: { S: row.city.S } } : {}),
          ...(row.sexHint?.S ? { sexHint: { S: row.sexHint.S } } : {}),
          ...(row.academyMatch?.S ? { academyMatch: { S: row.academyMatch.S } } : {}),
          ...(row.academyName?.S ? { academyName: { S: row.academyName.S } } : {}),
          ...(row.academyId?.S ? { academyId: { S: row.academyId.S } } : {}),
          ...(row.proposedAcademyName?.S ? { proposedAcademyName: { S: row.proposedAcademyName.S } } : {}),
          ...(row.proposedNeighborhood?.S ? { proposedNeighborhood: { S: row.proposedNeighborhood.S } } : {}),
          expiresAt: { N: String(now + 15 * 60) },
        },
        ConditionExpression: 'attribute_not_exists(codeHash)',
      } },
    ] }))
    return reply(200, {
      started: true, sessionToken, whatsapp, name: row.name?.S ?? '',
      city: row.city?.S ?? '', sexHint: row.sexHint?.S ?? '',
      academyMatch: row.academyMatch?.S ?? '',
      academyName: row.academyName?.S ?? '',
      proposedAcademyName: row.proposedAcademyName?.S ?? '',
      proposedNeighborhood: row.proposedNeighborhood?.S ?? '',
      expiresAt: now + 15 * 60,
    })
  } catch (error) {
    if (error instanceof TransactionCanceledException || error instanceof ConditionalCheckFailedException)
      return reply(410, { error: 'Link usado ou expirado. Solicite outro à Beta.' })
    console.error('[beta-onboarding] Redeem failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível abrir o cadastro.' })
  }
}

/** The caller validates registration fields and supplies a transactional writer. */
export async function completeBetaTrainerSignup(
  data: Record<string, unknown> | null,
  validRegistration: (input: Record<string, unknown> | null) => boolean,
  register: (
    input: Record<string, unknown>,
    proof: {
      betaSignupSessionHash: string
      issuedSessionToken: string
      academyId?: string
      academyName?: string
      academyCity?: string
    },
  ) => Promise<{ slug: string }>,
) {
  const proofToken = data?.onboardingSessionToken
  if (!validToken(proofToken)) return reply(401, { error: 'Sessão de cadastro inválida.' })
  if (!table()) return reply(503, { error: 'Serviço indisponível.' })
  const now = Math.floor(Date.now() / 1000)
  try {
    const record = (await db.send(new GetItemCommand({
      TableName: table(), Key: { codeHash: { S: hash(proofToken) } }, ConsistentRead: true,
    }))).Item
    const whatsapp = phone(record?.whatsapp?.S)
    if (!whatsapp || record?.flow?.S !== 'fitpeso-beta-trainer-signup-session' ||
        record.consumedAt?.N || Number(record.expiresAt?.N ?? 0) <= now)
      return reply(401, { error: 'Confirmação expirada. Solicite outro link à Beta.' })
    if (data?.whatsapp !== whatsapp || !validRegistration(data)) return reply(400, {
      error: 'Confira nome, WhatsApp, sexo, cidade e os dados obrigatórios.',
    })
    if ((await betaTrainersByPhone(whatsapp)).length)
      return reply(409, { error: 'WhatsApp já vinculado a um personal. Procure o suporte ou faça login.' })
    const sessionToken = randomBytes(32).toString('base64url')
    const result = await register(data!, {
      betaSignupSessionHash: hash(proofToken), issuedSessionToken: sessionToken,
      ...(record.academyId?.S && record.academyName?.S && record.city?.S ? {
        academyId: record.academyId.S, academyName: record.academyName.S, academyCity: record.city.S,
      } : {}),
    })
    return reply(201, { registered: true, role: 'trainer', sessionToken, slug: result.slug })
  } catch (error) {
    if (error instanceof TransactionCanceledException || error instanceof ConditionalCheckFailedException)
      return reply(409, { error: 'Cadastro alterado ou confirmação já utilizada. Solicite outro link.' })
    if (error instanceof Error && error.name === 'TrainerSlugUnavailableError')
      return reply(409, { error: 'Endereço do perfil já está em uso. Escolha outro.' })
    console.error('[beta-onboarding] Trainer complete failed', { errorClass: error instanceof Error ? error.name : typeof error })
    return reply(503, { error: 'Não foi possível concluir o cadastro.' })
  }
}
