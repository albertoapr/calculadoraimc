import { createHash } from 'node:crypto'
import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand, TransactWriteItemsCommand, type TransactWriteItem } from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const db = new DynamoDBClient({})
const customerTable = () => {
  const value = process.env.FITPESO_CUSTOMER_V2_TABLE
  if (!value) throw new Error('Tabela customer_v2 indisponível')
  return value
}
const legacyTable = () => {
  const value = process.env.FITPESO_CUSTOMERS_TABLE
  if (!value) throw new Error('Tabela de compatibilidade indisponível')
  return value
}
const personTable = () => {
  const value = process.env.FITPESO_PESSOA_TABLE
  if (!value) throw new Error('Tabela de pessoas indisponível')
  return value
}
const userTable = () => {
  const value = process.env.FITPESO_USUARIO_TABLE
  if (!value) throw new Error('Tabela de usuários indisponível')
  return value
}
const response = (statusCode: number, body: object) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
})
type Item = Record<string, import('@aws-sdk/client-dynamodb').AttributeValue>
const str = (row: Item, field: string) => row[field]?.S ?? ''
const bool = (row: Item, field: string) => row[field]?.BOOL === true
const validName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().replace(/\s+/g, ' ').length >= 2 &&
  name.trim().length <= 80 && !/[<>]/.test(name)
const validBirth = (value: unknown): value is string =>
  typeof value === 'string' && (!value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value &&
  value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)))
const isDynamoConflict = (error: unknown) =>
  error instanceof Error && ['ConditionalCheckFailedException', 'TransactionCanceledException'].includes(error.name)

// Mesmo identificador determinístico da migração de identidade.
export function roleUserId(pessoaId: string, role: 'ADMIN' | 'CLIENTE') {
  return 'U_' + createHash('sha256').update(pessoaId + '#' + role).digest('hex').slice(0, 32)
}
export async function hasAdminRole(pessoaId: string) {
  if (!pessoaId) return false
  const row = (await db.send(new GetItemCommand({
    TableName: userTable(), Key: { user_id: { S: roleUserId(pessoaId, 'ADMIN') } }, ConsistentRead: true,
  }))).Item
  return !!row && row.pessoa_id?.S === pessoaId && row.tipo?.S === 'ADMIN' &&
    row.tipo_usuario_id?.N === '1' && row.ativo?.BOOL !== false
}

/** A administração usa apenas a tabela canônica V2; nunca expõe tokens ou identificações do provedor. */
export async function listAdminCustomers() {
  try {
    const rows: Item[] = []
    let cursor: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined
    do {
      const page = await db.send(new ScanCommand({
        TableName: customerTable(),
        ExclusiveStartKey: cursor,
        Limit: 200,
      }))
      rows.push(...(page.Items ?? []))
      cursor = page.LastEvaluatedKey
      if (rows.length > 2000) return response(413, { error: 'Muitos cadastros. Utilize a busca paginada.' })
    } while (cursor)
    const adminCustomerUsers = new Set<string>()
    let adminCursor: Item | undefined
    do {
      const page = await db.send(new QueryCommand({
        TableName: userTable(), IndexName: 'UsuarioByTipo',
        KeyConditionExpression: 'tipo_usuario_id = :admin',
        ExpressionAttributeValues: { ':admin': { N: '1' } },
        ExclusiveStartKey: adminCursor,
      }))
      for (const row of page.Items ?? []) {
        const person = str(row, 'pessoa_id')
        if (person && str(row, 'tipo') === 'ADMIN' && row.ativo?.BOOL !== false)
          adminCustomerUsers.add(roleUserId(person, 'CLIENTE'))
      }
      adminCursor = page.LastEvaluatedKey
    } while (adminCursor)
    return response(200, { customers: rows.map(row => ({
      customerId: str(row, 'customer_id'),
      userId: str(row, 'user_id'),
      name: str(row, 'nome'),
      email: str(row, 'email'),
      whatsapp: str(row, 'whatsapp'),
      whatsappVerified: bool(row, 'whatsappVerified'),
      dateOfBirth: str(row, 'nascimento'),
      sex: str(row, 'sexo'),
      heightCm: row.altura_cm?.N ? Number(row.altura_cm.N) : null,
      active: row.ativo?.BOOL !== false,
      hasLegacy: Boolean(str(row, 'legacyWhatsapp')),
      isAdmin: adminCustomerUsers.has(str(row, 'user_id')),
    })).filter(row => row.customerId && row.userId) })
  } catch (error) {
    console.error('[fitpeso] admin customer list error', { kind: error instanceof Error ? error.name : 'UNKNOWN' })
    return response(503, { error: 'Não foi possível consultar os clientes.' })
  }
}

/** Dados de login (e-mail, WhatsApp, confirmação) não podem ser alterados pelo administrador.
 * Desativar nunca apaga a pessoa, os outros perfis nem o histórico de solicitações. */
export async function updateAdminCustomer(
  event: APIGatewayProxyEvent,
  data: Record<string, unknown> | null,
  actingPersonId: string,
) {
  const id = event.pathParameters?.customerId ?? ''
  if (!/^C_[a-f0-9]{32}$/.test(id)) return response(400, { error: 'Identificador de cliente inválido.' })
  if (!data || !validName(data.name) ||
      !validBirth(data.dateOfBirth ?? '') ||
      ![undefined, '', 'masculino', 'feminino'].includes(data.sex as string | undefined) ||
      (data.heightCm !== undefined && data.heightCm !== null &&
        (typeof data.heightCm !== 'number' || !Number.isFinite(data.heightCm) ||
        data.heightCm < 80 || data.heightCm > 250)) ||
      (data.active !== undefined && typeof data.active !== 'boolean') ||
      Object.keys(data).some(key => !['name', 'dateOfBirth', 'sex', 'heightCm', 'active'].includes(key))) {
    return response(400, { error: 'Confira nome, nascimento, sexo e altura informados.' })
  }
  try {
    const customer = (await db.send(new GetItemCommand({
      TableName: customerTable(), Key: { customer_id: { S: id } }, ConsistentRead: true,
    }))).Item
    if (!customer?.user_id?.S) return response(404, { error: 'Cliente não encontrado.' })
    const user = (await db.send(new GetItemCommand({
      TableName: userTable(), Key: { user_id: { S: customer.user_id.S } }, ConsistentRead: true,
    }))).Item
    if (!user || user.tipo?.S !== 'CLIENTE') return response(409, { error: 'Vínculo do cliente inconsistente.' })
    const pessoaId = user.pessoa_id?.S ?? ''
    if (!pessoaId) return response(409, { error: 'Identidade do cliente incompleta.' })
    if (data.active === false && pessoaId === actingPersonId)
      return response(409, { error: 'Não é permitido desativar a própria conta administrativa.' })
    const newActive = typeof data.active === 'boolean' ? data.active : customer.ativo?.BOOL !== false
    const oldActive = customer.ativo?.BOOL !== false
    const dob = typeof data.dateOfBirth === 'string' ? data.dateOfBirth : ''
    const sex = typeof data.sex === 'string' ? data.sex : ''
    const name = data.name.trim().replace(/\s+/g, ' ')
    const attrs = {
      ':uid': { S: customer.user_id.S },
      ':name': { S: name },
      ':active': { BOOL: newActive },
      ':dob': { S: dob },
      ':sex': { S: sex },
      ...(typeof data.heightCm === 'number' ? { ':height': { N: String(data.heightCm) } } : {}),
      ':updated': { S: new Date().toISOString() },
    }
    const update = {
      TableName: customerTable(),
      Key: { customer_id: { S: id } },
      UpdateExpression: 'SET nome = :name, nascimento = :dob, sexo = :sex, ativo = :active, atualizado_em = :updated' +
        (typeof data.heightCm === 'number' ? ', altura_cm = :height' : ''),
      ConditionExpression: 'user_id = :uid',
      ExpressionAttributeValues: attrs,
    }
    const personUpdate = {
      TableName: personTable(),
      Key: { pessoa_id: { S: pessoaId } },
      UpdateExpression: 'SET nome = :name' + (dob ? ', nascimento = :dob' : ''),
      ConditionExpression: 'attribute_exists(pessoa_id)',
      ExpressionAttributeValues: {
        ':name': { S: name },
        ...(dob ? { ':dob': { S: dob } } : {}),
      },
    }
    const legacyKey = str(customer, 'legacyWhatsapp')
    if (legacyKey) {
      const legacy = (await db.send(new GetItemCommand({
        TableName: legacyTable(), Key: { whatsapp: { S: legacyKey } }, ConsistentRead: true,
      }))).Item
      if (!legacy || str(legacy, 'pessoa_id') !== pessoaId ||
          str(legacy, 'user_id') !== customer.user_id.S ||
          !['ACTIVE', 'INACTIVE'].includes(str(legacy, 'status')))
        return response(409, { error: 'Vínculo legado inconsistente. Nenhuma alteração efetuada.' })
      await db.send(new TransactWriteItemsCommand({ TransactItems: [
        { Update: update },
        { Update: personUpdate },
        { Update: {
          TableName: legacyTable(), Key: { whatsapp: { S: legacyKey } },
          UpdateExpression: 'SET #status = :target, #name = :name, dateOfBirth = :dob, sex = :sex' +
            (typeof data.heightCm === 'number' ? ', heightCm = :height' : ''),
          ConditionExpression: '#status = :previous AND pessoa_id = :person AND user_id = :uid',
          ExpressionAttributeNames: { '#status': 'status', '#name': 'name' },
          ExpressionAttributeValues: {
            ':target': { S: newActive ? 'ACTIVE' : 'INACTIVE' },
            ':previous': { S: oldActive ? 'ACTIVE' : 'INACTIVE' },
            ':person': { S: pessoaId },
            ':uid': { S: customer.user_id.S },
            ':name': { S: name },
            ':dob': { S: dob },
            ':sex': { S: sex },
            ...(typeof data.heightCm === 'number' ? { ':height': { N: String(data.heightCm) } } : {}),
          },
        } },
      ] }))
    } else {
      await db.send(new TransactWriteItemsCommand({ TransactItems: [
        { Update: update }, { Update: personUpdate },
      ] }))
    }
    return response(200, { updated: true })
  } catch (error) {
    if (isDynamoConflict(error)) return response(409, { error: 'Cadastro alterado por outra operação. Atualize a lista.' })
    console.error('[fitpeso] admin customer update error', { kind: error instanceof Error ? error.name : 'UNKNOWN' })
    return response(503, { error: 'Não foi possível atualizar o cliente.' })
  }
}

/** Concede um papel adicional, sem substituir CLIENTE/PERSONAL.
 * O ID do beneficiário é resolvido no servidor; a autorização é revalidada na transação. */
export async function promoteAdminCustomer(event: APIGatewayProxyEvent, data: Record<string, unknown> | null, actingPersonId: string) {
  const id = event.pathParameters?.customerId ?? ''
  if (!/^C_[a-f0-9]{32}$/.test(id) || !data || data.confirmation !== 'TORNAR_ADMINISTRADOR' ||
      Object.keys(data).some(key => key !== 'confirmation'))
    return response(400, { error: 'Confirme a concessão do perfil de administrador.' })
  try {
    if (!(await hasAdminRole(actingPersonId))) return response(403, { error: 'Acesso restrito a administradores.' })
    const customer = (await db.send(new GetItemCommand({
      TableName: customerTable(), Key: { customer_id: { S: id } }, ConsistentRead: true,
    }))).Item
    const userId = customer?.user_id?.S
    if (!customer || !userId) return response(404, { error: 'Cliente não encontrado.' })
    if (customer.ativo?.BOOL === false) return response(409, { error: 'Reative o cliente antes de conceder acesso administrativo.' })
    const user = (await db.send(new GetItemCommand({
      TableName: userTable(), Key: { user_id: { S: userId } }, ConsistentRead: true,
    }))).Item
    const personId = user?.pessoa_id?.S
    if (!personId || user?.tipo?.S !== 'CLIENTE' || user.tipo_usuario_id?.N !== '2' ||
        user.ativo?.BOOL === false || userId !== roleUserId(personId, 'CLIENTE'))
      return response(409, { error: 'Identidade do cliente inconsistente.' })
    if (personId === actingPersonId) return response(409, { error: 'Sua conta já tem acesso administrativo.' })
    const adminId = roleUserId(personId, 'ADMIN')
    if (await hasAdminRole(personId)) return response(200, { promoted: true })
    const stamp = new Date().toISOString()
    const changes: TransactWriteItem[] = [
      { ConditionCheck: {
        TableName: userTable(), Key: { user_id: { S: roleUserId(actingPersonId, 'ADMIN') } },
        ConditionExpression: 'pessoa_id = :actor AND #tipo = :admin AND tipo_usuario_id = :code AND (attribute_not_exists(ativo) OR ativo = :yes)',
        ExpressionAttributeNames: { '#tipo': 'tipo' },
        ExpressionAttributeValues: { ':actor': { S: actingPersonId }, ':admin': { S: 'ADMIN' }, ':code': { N: '1' }, ':yes': { BOOL: true } },
      } },
      { ConditionCheck: {
        TableName: customerTable(), Key: { customer_id: { S: id } },
        ConditionExpression: 'user_id = :user AND (attribute_not_exists(ativo) OR ativo = :yes)',
        ExpressionAttributeValues: { ':user': { S: userId }, ':yes': { BOOL: true } },
      } },
      { ConditionCheck: {
        TableName: userTable(), Key: { user_id: { S: userId } },
        ConditionExpression: 'pessoa_id = :person AND #tipo = :customer AND (attribute_not_exists(ativo) OR ativo = :yes)',
        ExpressionAttributeNames: { '#tipo': 'tipo' },
        ExpressionAttributeValues: { ':person': { S: personId }, ':customer': { S: 'CLIENTE' }, ':yes': { BOOL: true } },
      } },
      { ConditionCheck: {
        TableName: personTable(), Key: { pessoa_id: { S: personId } },
        ConditionExpression: 'attribute_exists(pessoa_id) AND attribute_not_exists(deletionRequestedAt)',
      } },
      { Update: {
        TableName: userTable(), Key: { user_id: { S: adminId } },
        UpdateExpression: 'SET pessoa_id = :person, #tipo = :admin, tipo_usuario_id = :code, ativo = :yes, criado_em = if_not_exists(criado_em, :now), adminGrantedAt = :now, adminGrantedBy = :actor',
        ConditionExpression: 'attribute_not_exists(user_id) OR (pessoa_id = :person AND #tipo = :admin AND tipo_usuario_id = :code AND ativo = :no)',
        ExpressionAttributeNames: { '#tipo': 'tipo' },
        ExpressionAttributeValues: { ':person': { S: personId }, ':admin': { S: 'ADMIN' }, ':code': { N: '1' }, ':yes': { BOOL: true }, ':no': { BOOL: false }, ':now': { S: stamp }, ':actor': { S: actingPersonId } },
      } },
    ]
    const legacyKey = str(customer, 'legacyWhatsapp')
    if (legacyKey) changes.push({ Update: {
      TableName: legacyTable(), Key: { whatsapp: { S: legacyKey } },
      UpdateExpression: 'SET isAdmin = :yes',
      ConditionExpression: 'pessoa_id = :person AND user_id = :user AND #status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':person': { S: personId }, ':user': { S: userId }, ':active': { S: 'ACTIVE' }, ':yes': { BOOL: true } },
    } })
    await db.send(new TransactWriteItemsCommand({ TransactItems: changes }))
    return response(200, { promoted: true })
  } catch (error) {
    if (isDynamoConflict(error)) return response(409, { error: 'Não foi possível confirmar a concessão. Atualize a lista e verifique o cadastro.' })
    console.error('[fitpeso] admin promotion failed', { kind: error instanceof Error ? error.name : 'UNKNOWN' })
    return response(503, { error: 'Não foi possível conceder acesso administrativo.' })
  }
}
