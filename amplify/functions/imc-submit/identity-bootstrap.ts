/**
 * Migracao progressiva e ADITIVA de cadastros existentes.
 *
 * Uma conta Google comprovada NAO comprova posse do telefone cadastrado.
 * Vincular CUSTOMER via login Google preserva a autorizacao legada, mas
 * NUNCA cria identificacao WHATSAPP a partir desse fato.
 *
 * O vinculo WHATSAPP so e criado em sessao confirmada pelo provedor do WhatsApp.
 * Em caso de titulares conflitantes, o fluxo novo fica pendente de revisao:
 * nao mesclar contas automaticamente.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand,
  TransactWriteItemsCommand, TransactionCanceledException, UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import {
  attachVerifiedIdentification, findPersonIdByIdentification,
  listPersonProfiles, type PersonProfile, type UserRole,
} from './identity-store'

const db = new DynamoDBClient({})
const ROLE_CODES: Record<UserRole, number> = { ADMIN: 1, CLIENTE: 2, PERSONAL: 3 }

export type LegacyCustomerIdentity = {
  whatsapp: string
  name: string
  email?: string
  isAdmin?: boolean
  pessoaId?: string
  identitySource?: string
  sex?: 'masculino' | 'feminino'
  heightCm?: number
  dateOfBirth?: string
  googlePhotoUrl?: string
}
export type LegacyTrainerIdentity = {
  trainerId: string
  city: string
  whatsapp: string
  name: string
  email?: string
  pessoaId?: string
  identitySource?: string
}

function table(env: string) {
  const name = process.env[env]
  if (!name) throw new Error(`Identidade sem tabela ${env}`)
  return name
}

export function toE164Brazilian(value: string): string {
  const digits = value.replace(/\D/g, '')
  const full = digits.startsWith('55') ? digits : `55${digits}`
  if (!/^55[1-9][1-9]\d{8,9}$/.test(full)) throw new Error('WHATSAPP_INVALID')
  return `+${full}`
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

/** ID estável de cliente derivado da pessoa, nunca de WhatsApp ou e-mail. */
export function customerIdForPerson(pessoaId: string): string {
  if (!pessoaId.trim()) throw new Error('pessoaId obrigatorio')
  return stableId('C', `${pessoaId}#CLIENTE`)
}

function isConflict(error: unknown) {
  return error instanceof ConditionalCheckFailedException ||
    (error instanceof TransactionCanceledException &&
      Boolean(error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')))
}

async function createPersonByProof(type: 'GOOGLE' | 'WHATSAPP' | 'EMAIL', value: string, name: string) {
  const existing = await findPersonIdByIdentification(type, value)
  if (existing) return existing
  const pessoaId = randomUUID()
  const now = new Date().toISOString()
  const identificationKey = `${type}#${value}`
  try {
    await db.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: { TableName: table('FITPESO_PESSOA_TABLE'),
        Item: { pessoa_id: { S: pessoaId }, nome: { S: name }, criado_em: { S: now } },
        ConditionExpression: 'attribute_not_exists(pessoa_id)' } },
      { Put: { TableName: table('FITPESO_PESSOA_IDENTIFICACAO_TABLE'),
        Item: { identificationKey: { S: identificationKey },
          pessoa_id: { S: pessoaId }, tipo: { S: type }, verificado_em: { S: now } },
        ConditionExpression: 'attribute_not_exists(identificationKey)' } },
    ] }))
    return pessoaId
  } catch (error) {
    if (!isConflict(error)) throw error
    // Uma tentativa simultanea pode ter criado a identidade primeiro.
    const winner = await findPersonIdByIdentification(type, value)
    if (winner) return winner
    throw error
  }
}

async function ensureGooglePerson(sub: string, verifiedEmail: string, name: string) {
  const byGoogle = await findPersonIdByIdentification('GOOGLE', sub)
  const byEmail = await findPersonIdByIdentification('EMAIL', verifiedEmail)
  if (byGoogle && byEmail && byGoogle !== byEmail) throw new Error('IDENTITY_LINK_CONFLICT')
  const pessoaId = byGoogle ?? byEmail ?? await createPersonByProof('GOOGLE', sub, name)
  await attachVerifiedIdentification({ pessoaId, type: 'GOOGLE', verifiedValue: sub })
  await attachVerifiedIdentification({ pessoaId, type: 'EMAIL', verifiedValue: verifiedEmail })
  return pessoaId
}

async function ensureEmailPerson(verifiedEmail: string, name: string) {
  const email = verifiedEmail.trim().toLowerCase()
  const existing = await findPersonIdByIdentification('EMAIL', email)
  const pessoaId = existing ?? await createPersonByProof('EMAIL', email, name)
  await attachVerifiedIdentification({ pessoaId, type: 'EMAIL', verifiedValue: email })
  return pessoaId
}

async function ensureWhatsappPerson(verifiedPhone: string, name: string) {
  const pessoaId = await createPersonByProof('WHATSAPP', verifiedPhone, name)
  await attachVerifiedIdentification({ pessoaId, type: 'WHATSAPP', verifiedValue: verifiedPhone })
  return pessoaId
}

async function ensureUserRole(pessoaId: string, role: UserRole) {
  const userId = stableId('U', `${pessoaId}#${role}`)
  const code = ROLE_CODES[role]
  try {
    await db.send(new PutItemCommand({
      TableName: table('FITPESO_TIPO_USUARIO_TABLE'),
      Item: { tipo_usuario_id: { N: String(code) }, codigo: { S: role }, nome: { S: role } },
      ConditionExpression: 'attribute_not_exists(tipo_usuario_id)',
    }))
  } catch (error) {
    if (!isConflict(error)) throw error
  }
  try {
    await db.send(new PutItemCommand({
      TableName: table('FITPESO_USUARIO_TABLE'),
      Item: {
        user_id: { S: userId }, pessoa_id: { S: pessoaId },
        tipo_usuario_id: { N: String(code) }, tipo: { S: role },
        ativo: { BOOL: true }, criado_em: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(user_id)',
    }))
  } catch (error) {
    if (!isConflict(error)) throw error
    const existing = await db.send(new GetItemCommand({
      TableName: table('FITPESO_USUARIO_TABLE'), Key: { user_id: { S: userId } }, ConsistentRead: true,
    }))
    if (existing.Item?.pessoa_id?.S !== pessoaId || existing.Item.tipo_usuario_id?.N !== String(code))
      throw new Error('USER_ROLE_CONFLICT')
  }
  return userId
}

async function ensureSpecificProfile(env: string, key: string, id: string, userId: string, extras: Record<string, { S: string }>) {
  try {
    await db.send(new PutItemCommand({
      TableName: table(env),
      Item: { [key]: { S: id }, user_id: { S: userId }, ...extras },
      ConditionExpression: `attribute_not_exists(${key})`,
    }))
  } catch (error) {
    if (!isConflict(error)) throw error
    const existing = await db.send(new GetItemCommand({
      TableName: table(env), Key: { [key]: { S: id } }, ConsistentRead: true,
    }))
    if (existing.Item?.user_id?.S !== userId) throw new Error('LEGACY_PROFILE_CONFLICT')
  }
}

/**
 * So anexa dados legados apos validar a sessao e os atributos ativos na Lambda.
 * A condicao impede mover um perfil legado ja atribuido para outra pessoa.
 */
async function linkLegacyCustomer(legacy: LegacyCustomerIdentity, pessoaId: string, userId: string, source: 'GOOGLE' | 'WHATSAPP' | 'EMAIL') {
  await db.send(new UpdateItemCommand({
    TableName: table('FITPESO_CUSTOMERS_TABLE'),
    Key: { whatsapp: { S: legacy.whatsapp } },
    UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :person), user_id = if_not_exists(user_id, :user), identitySource = if_not_exists(identitySource, :source)',
    ConditionExpression: '#status = :active AND whatsappVerified = :verified AND (attribute_not_exists(pessoa_id) OR pessoa_id = :person) AND (attribute_not_exists(user_id) OR user_id = :user)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':active': { S: 'ACTIVE' }, ':verified': { BOOL: true },
      ':person': { S: pessoaId }, ':user': { S: userId }, ':source': { S: source },
    },
  }))
}

/**
 * Cadastro canônico de CLIENTE pelo Google.
 * Não cria item na tabela legada nem usa WhatsApp como identificador de cliente.
 * Apenas provas Google verificadas pela Lambda podem chamar esta operação.
 */
export async function registerGoogleCustomerIdentity(input: {
  sub: string; email: string; name: string; googlePhotoUrl?: string;
  sex?: 'masculino' | 'feminino'; heightCm?: number; dateOfBirth?: string;
}) {
  const email = input.email.trim().toLowerCase()
  const pessoaId = await ensureGooglePerson(input.sub, email, input.name)
  const userId = await ensureUserRole(pessoaId, 'CLIENTE')
  const customerId = customerIdForPerson(pessoaId)
  const now = new Date().toISOString()
  try {
    await db.send(new PutItemCommand({
      TableName: table('FITPESO_CUSTOMER_V2_TABLE'),
      Item: {
        customer_id: { S: customerId }, user_id: { S: userId },
        nome: { S: input.name }, email: { S: email },
        ...(input.googlePhotoUrl ? { googlePhotoUrl: { S: input.googlePhotoUrl } } : {}),
        ...(input.sex ? { sexo: { S: input.sex } } : {}),
        ...(input.heightCm !== undefined ? { altura_cm: { N: String(input.heightCm) } } : {}),
        ...(input.dateOfBirth ? { nascimento: { S: input.dateOfBirth } } : {}),
        ativo: { BOOL: true }, criado_em: { S: now },
      },
      ConditionExpression: 'attribute_not_exists(customer_id)',
    }))
  } catch (error) {
    if (!isConflict(error)) throw error
    const existing = await db.send(new GetItemCommand({
      TableName: table('FITPESO_CUSTOMER_V2_TABLE'),
      Key: { customer_id: { S: customerId } }, ConsistentRead: true,
    }))
    if (existing.Item?.user_id?.S !== userId || existing.Item?.email?.S !== email)
      throw new Error('CUSTOMER_IDENTITY_CONFLICT')
  }
  return { pessoaId, userId, customerId }
}

/** Consulta forte para novos clientes: não depende da consistência eventual dos GSIs. */
export async function loadGoogleCustomerIdentity(sub: string) {
  const pessoaId = await findPersonIdByIdentification('GOOGLE', sub)
  if (!pessoaId) return null
  const userId = stableId('U', `${pessoaId}#CLIENTE`)
  const customerId = customerIdForPerson(pessoaId)
  const record = await db.send(new GetItemCommand({
    TableName: table('FITPESO_CUSTOMER_V2_TABLE'),
    Key: { customer_id: { S: customerId } }, ConsistentRead: true,
  }))
  const item = record.Item
  if (!item || item.user_id?.S !== userId || item.ativo?.BOOL === false) return null
  const usuarios = await listPersonProfiles(pessoaId)
  const cliente = usuarios.find(user => user.usuarioId === userId)
  if (cliente) cliente.clienteId = customerId
  else usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.CLIENTE, tipo: 'CLIENTE', clienteId: customerId,
  })
  return { pessoaId, userId, customerId, usuarios, item }
}

/** Migra cadastros provisórios GOOGLE#sub sem apagar ou renomear sua chave legada. */
export async function syncProvisionalGoogleCustomerIdentity(legacy: LegacyCustomerIdentity, proof: {
  sub: string; email: string
}) {
  if (legacy.whatsapp !== `GOOGLE#${proof.sub}` || legacy.email?.toLowerCase() !== proof.email.toLowerCase())
    throw new Error('GOOGLE_LEGACY_EMAIL_MISMATCH')
  const byGoogle = await findPersonIdByIdentification('GOOGLE', proof.sub)
  if (legacy.pessoaId && byGoogle && legacy.pessoaId !== byGoogle)
    throw new Error('IDENTITY_LINK_CONFLICT')
  const result = await registerGoogleCustomerIdentity({
    sub: proof.sub, email: proof.email, name: legacy.name,
    googlePhotoUrl: legacy.googlePhotoUrl, sex: legacy.sex,
    heightCm: legacy.heightCm, dateOfBirth: legacy.dateOfBirth,
  })
  if (legacy.pessoaId && legacy.pessoaId !== result.pessoaId)
    throw new Error('IDENTITY_LINK_CONFLICT')
  await db.send(new UpdateItemCommand({
    TableName: table('FITPESO_CUSTOMERS_TABLE'),
    Key: { whatsapp: { S: legacy.whatsapp } },
    UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :person), user_id = if_not_exists(user_id, :user), identitySource = if_not_exists(identitySource, :source)',
    ConditionExpression: '#status = :active AND googleSubject = :sub AND whatsappVerified = :false AND (attribute_not_exists(pessoa_id) OR pessoa_id = :person) AND (attribute_not_exists(user_id) OR user_id = :user)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':active': { S: 'ACTIVE' }, ':false': { BOOL: false },
      ':sub': { S: proof.sub }, ':person': { S: result.pessoaId },
      ':user': { S: result.userId }, ':source': { S: 'GOOGLE' },
    },
  }))
  const loaded = await loadGoogleCustomerIdentity(proof.sub)
  if (!loaded) throw new Error('GOOGLE_PROFILE_PENDING')
  return { pessoaId: loaded.pessoaId, usuarios: loaded.usuarios }
}

/** Converte acesso Google legado de CLIENTE sem declarar que o WhatsApp foi provado. */
export async function syncGoogleCustomerIdentity(legacy: LegacyCustomerIdentity, proof: {
  sub: string; email: string
}): Promise<{ pessoaId: string; usuarios: PersonProfile[] }> {
  if (!legacy.whatsapp || legacy.email?.toLowerCase() !== proof.email.toLowerCase())
    throw new Error('GOOGLE_LEGACY_EMAIL_MISMATCH')
  // Google nao assume um cliente que ja foi vinculado por prova de WhatsApp.
  if (legacy.pessoaId && legacy.identitySource !== 'GOOGLE') throw new Error('IDENTITY_LINK_REQUIRES_BOTH_PROOFS')
  const pessoaId = await ensureGooglePerson(proof.sub, proof.email, legacy.name)
  if (legacy.pessoaId && legacy.pessoaId !== pessoaId) throw new Error('IDENTITY_LINK_CONFLICT')
  const userId = stableId('U', `${pessoaId}#CLIENTE`)
  // Primeiro reserva o vinculo com o registro legado; depois cria os perfis V2.
  await linkLegacyCustomer(legacy, pessoaId, userId, 'GOOGLE')
  await ensureUserRole(pessoaId, 'CLIENTE')
  await ensureSpecificProfile('FITPESO_CUSTOMER_V2_TABLE', 'customer_id',
    stableId('C', legacy.whatsapp), userId, { legacyWhatsapp: { S: legacy.whatsapp } })
  const adminUserId = legacy.isAdmin ? await ensureUserRole(pessoaId, 'ADMIN') : undefined
  const usuarios = await listPersonProfiles(pessoaId)
  // GSIs do DynamoDB possuem consistencia eventual. Devolva pelo menos
  // os perfis confirmados pelos writes desta requisicao no primeiro login.
  if (!usuarios.some(u => u.usuarioId === userId)) usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.CLIENTE, tipo: 'CLIENTE',
    clienteId: stableId('C', legacy.whatsapp),
  })
  if (adminUserId && !usuarios.some(u => u.usuarioId === adminUserId)) usuarios.push({
    usuarioId: adminUserId, tipoUsuarioId: ROLE_CODES.ADMIN, tipo: 'ADMIN',
  })
  return { pessoaId, usuarios }
}

/**
 * WhatsApp confirmado pode criar uma identidade propria.
 * Se o cliente ja foi associado por Google sem prova do numero,
 * NAO mesclamos automaticamente ambas as contas.
 */
export async function syncWhatsappCustomerIdentity(legacy: LegacyCustomerIdentity) {
  const phone = toE164Brazilian(legacy.whatsapp)
  // Se o perfil foi vinculado pelo Google, telefone e Google precisam ser
  // comprovados juntos antes de mesclar os perfis.
  if (legacy.pessoaId && legacy.identitySource !== 'WHATSAPP')
    throw new Error('IDENTITY_LINK_REQUIRES_BOTH_PROOFS')
  const existingPhonePerson = await findPersonIdByIdentification('WHATSAPP', phone)
  if (existingPhonePerson && legacy.pessoaId && existingPhonePerson !== legacy.pessoaId)
    throw new Error('IDENTITY_LINK_CONFLICT')
  const personFromPhone = legacy.pessoaId ?? existingPhonePerson ?? await ensureWhatsappPerson(phone, legacy.name)
  await attachVerifiedIdentification({ pessoaId: personFromPhone, type: 'WHATSAPP', verifiedValue: phone })
  const userId = stableId('U', `${personFromPhone}#CLIENTE`)
  await linkLegacyCustomer(legacy, personFromPhone, userId, 'WHATSAPP')
  await ensureUserRole(personFromPhone, 'CLIENTE')
  await ensureSpecificProfile('FITPESO_CUSTOMER_V2_TABLE', 'customer_id',
    stableId('C', legacy.whatsapp), userId, { legacyWhatsapp: { S: legacy.whatsapp } })
  const adminUserId = legacy.isAdmin ? await ensureUserRole(personFromPhone, 'ADMIN') : undefined
  const usuarios = await listPersonProfiles(personFromPhone)
  if (!usuarios.some(u => u.usuarioId === userId)) usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.CLIENTE, tipo: 'CLIENTE',
    clienteId: stableId('C', legacy.whatsapp),
  })
  if (adminUserId && !usuarios.some(u => u.usuarioId === adminUserId)) usuarios.push({
    usuarioId: adminUserId, tipoUsuarioId: ROLE_CODES.ADMIN, tipo: 'ADMIN',
  })
  return { pessoaId: personFromPhone, usuarios }
}

/** EMAIL comprovado no link autenticado nunca implica posse do numero de telefone. */
export async function syncEmailCustomerIdentity(legacy: LegacyCustomerIdentity, verifiedEmail: string) {
  const email = verifiedEmail.trim().toLowerCase()
  if (!email || legacy.email?.toLowerCase() !== email) throw new Error('EMAIL_LEGACY_MISMATCH')
  if (legacy.pessoaId && !['GOOGLE', 'EMAIL'].includes(legacy.identitySource ?? ''))
    throw new Error('IDENTITY_LINK_REQUIRES_BOTH_PROOFS')
  const byEmail = await findPersonIdByIdentification('EMAIL', email)
  if (legacy.pessoaId && byEmail && legacy.pessoaId !== byEmail)
    throw new Error('IDENTITY_LINK_CONFLICT')
  const pessoaId = legacy.pessoaId ?? byEmail ?? await ensureEmailPerson(email, legacy.name)
  await attachVerifiedIdentification({ pessoaId, type: 'EMAIL', verifiedValue: email })
  const userId = stableId('U', `${pessoaId}#CLIENTE`)
  await linkLegacyCustomer(legacy, pessoaId, userId, 'EMAIL')
  await ensureUserRole(pessoaId, 'CLIENTE')
  await ensureSpecificProfile('FITPESO_CUSTOMER_V2_TABLE', 'customer_id',
    stableId('C', legacy.whatsapp), userId, { legacyWhatsapp: { S: legacy.whatsapp } })
  const adminUserId = legacy.isAdmin ? await ensureUserRole(pessoaId, 'ADMIN') : undefined
  const usuarios = await listPersonProfiles(pessoaId)
  if (!usuarios.some(u => u.usuarioId === userId)) usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.CLIENTE, tipo: 'CLIENTE',
    clienteId: stableId('C', legacy.whatsapp),
  })
  if (adminUserId && !usuarios.some(u => u.usuarioId === adminUserId)) usuarios.push({
    usuarioId: adminUserId, tipoUsuarioId: ROLE_CODES.ADMIN, tipo: 'ADMIN',
  })
  return { pessoaId, usuarios }
}

/** PERSONAL e associado por telefone somente apos validacao de sessao WhatsApp do personal. */
export async function syncWhatsappTrainerIdentity(legacy: LegacyTrainerIdentity) {
  if (!legacy.trainerId || !legacy.city) throw new Error('INVALID_LEGACY_TRAINER')
  const phone = toE164Brazilian(legacy.whatsapp)
  if (legacy.pessoaId && legacy.identitySource !== 'WHATSAPP')
    throw new Error('IDENTITY_LINK_REQUIRES_BOTH_PROOFS')
  const existingPhonePerson = await findPersonIdByIdentification('WHATSAPP', phone)
  if (legacy.pessoaId && existingPhonePerson && legacy.pessoaId !== existingPhonePerson)
    throw new Error('IDENTITY_LINK_CONFLICT')
  const pessoaId = legacy.pessoaId ?? existingPhonePerson ?? await ensureWhatsappPerson(phone, legacy.name)
  await attachVerifiedIdentification({ pessoaId, type: 'WHATSAPP', verifiedValue: phone })
  const userId = stableId('U', `${pessoaId}#PERSONAL`)
  await db.send(new UpdateItemCommand({
    TableName: table('TRAINERS_TABLE'),
    Key: { city: { S: legacy.city }, trainerId: { S: legacy.trainerId } },
    UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :p), user_id = if_not_exists(user_id, :u), identitySource = if_not_exists(identitySource, :source)',
    ConditionExpression: 'active = :active AND whatsappVerified = :verified AND whatsapp = :phone AND (attribute_not_exists(pessoa_id) OR pessoa_id = :p) AND (attribute_not_exists(user_id) OR user_id = :u)',
    ExpressionAttributeValues: {
      ':p': { S: pessoaId }, ':u': { S: userId }, ':phone': { S: legacy.whatsapp },
      ':active': { BOOL: true }, ':verified': { BOOL: true },
      ':source': { S: 'WHATSAPP' },
    },
  }))
  await ensureUserRole(pessoaId, 'PERSONAL')
  await ensureSpecificProfile('FITPESO_PERSONAL_V2_TABLE', 'personal_id',
    legacy.trainerId, userId, { legacyTrainerId: { S: legacy.trainerId }, cidade: { S: legacy.city } })
  const usuarios = await listPersonProfiles(pessoaId)
  if (!usuarios.some(u => u.usuarioId === userId)) usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.PERSONAL, tipo: 'PERSONAL',
    personalId: legacy.trainerId,
  })
  return { pessoaId, usuarios }
}

/** Perfil PERSONAL de um login comprovado por link de email. */
export async function syncEmailTrainerIdentity(legacy: LegacyTrainerIdentity, verifiedEmail: string) {
  const email = verifiedEmail.trim().toLowerCase()
  if (!email || legacy.email?.toLowerCase() !== email) throw new Error('EMAIL_LEGACY_MISMATCH')
  if (legacy.pessoaId && legacy.identitySource !== 'EMAIL')
    throw new Error('IDENTITY_LINK_REQUIRES_BOTH_PROOFS')
  const byEmail = await findPersonIdByIdentification('EMAIL', email)
  if (legacy.pessoaId && byEmail && legacy.pessoaId !== byEmail)
    throw new Error('IDENTITY_LINK_CONFLICT')
  const pessoaId = legacy.pessoaId ?? byEmail ?? await ensureEmailPerson(email, legacy.name)
  await attachVerifiedIdentification({ pessoaId, type: 'EMAIL', verifiedValue: email })
  const userId = stableId('U', `${pessoaId}#PERSONAL`)
  await db.send(new UpdateItemCommand({
    TableName: table('TRAINERS_TABLE'),
    Key: { city: { S: legacy.city }, trainerId: { S: legacy.trainerId } },
    UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :p), user_id = if_not_exists(user_id, :u), identitySource = if_not_exists(identitySource, :source)',
    ConditionExpression: 'active = :active AND whatsappVerified = :verified AND email = :email AND (attribute_not_exists(pessoa_id) OR pessoa_id = :p) AND (attribute_not_exists(user_id) OR user_id = :u)',
    ExpressionAttributeValues: {
      ':p': { S: pessoaId }, ':u': { S: userId }, ':email': { S: email },
      ':active': { BOOL: true }, ':verified': { BOOL: true }, ':source': { S: 'EMAIL' },
    },
  }))
  await ensureUserRole(pessoaId, 'PERSONAL')
  await ensureSpecificProfile('FITPESO_PERSONAL_V2_TABLE', 'personal_id',
    legacy.trainerId, userId, { legacyTrainerId: { S: legacy.trainerId }, cidade: { S: legacy.city } })
  const usuarios = await listPersonProfiles(pessoaId)
  if (!usuarios.some(u => u.usuarioId === userId)) usuarios.push({
    usuarioId: userId, tipoUsuarioId: ROLE_CODES.PERSONAL, tipo: 'PERSONAL',
    personalId: legacy.trainerId,
  })
  return { pessoaId, usuarios }
}
