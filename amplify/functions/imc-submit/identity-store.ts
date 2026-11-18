/**
 * Camada aditiva de identidade da FitPeso.
 * As tabelas legadas continuam sendo a fonte dos fluxos atuais ate a migracao controlada.
 * Nunca use um identificador informado pelo cliente sem validacao do provedor.
 */
import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

export type IdentificationType = 'EMAIL' | 'WHATSAPP' | 'GOOGLE'
export type UserRole = 'ADMIN' | 'CLIENTE' | 'PERSONAL'

const client = new DynamoDBClient({})

function table(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Tabela de identidade nao configurada: ${name}`)
  return value
}

export function identificationKey(type: IdentificationType, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Identificacao vazia')
  if (type === 'EMAIL') {
    const email = trimmed.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email invalido')
    return `EMAIL#${email}`
  }
  if (type === 'WHATSAPP') {
    if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) throw new Error('WhatsApp deve estar em E.164')
    return `WHATSAPP#${trimmed}`
  }
  // Google: usar o "sub" de um ID token verificado; nunca somente o email.
  if (!/^\d{6,64}$/.test(trimmed)) throw new Error('Google sub invalido')
  return `GOOGLE#${trimmed}`
}

export async function findPersonIdByIdentification(type: IdentificationType, verifiedValue: string): Promise<string | null> {
  const result = await client.send(new GetItemCommand({
    TableName: table('FITPESO_PESSOA_IDENTIFICACAO_TABLE'),
    Key: { identificationKey: { S: identificationKey(type, verifiedValue) } },
    ConsistentRead: true,
  }))
  return result.Item?.pessoa_id?.S ?? null
}

/** Invocar apenas apos o provedor confirmar que a pessoa controla a identificacao. */
export async function attachVerifiedIdentification(input: {
  pessoaId: string
  type: IdentificationType
  verifiedValue: string
  verifiedAt?: string
}): Promise<void> {
  if (!input.pessoaId.trim()) throw new Error('pessoaId obrigatorio')
  const key = identificationKey(input.type, input.verifiedValue)
  // Vinculo idempotente: nunca substitui o dono de uma identificacao.
  try {
    await client.send(new UpdateItemCommand({
      TableName: table('FITPESO_PESSOA_IDENTIFICACAO_TABLE'),
      Key: { identificationKey: { S: key } },
      UpdateExpression: 'SET pessoa_id = if_not_exists(pessoa_id, :owner), #tipo = if_not_exists(#tipo, :tipo), verificado_em = if_not_exists(verificado_em, :verified)',
      ConditionExpression: 'attribute_not_exists(identificationKey) OR pessoa_id = :owner',
      ExpressionAttributeNames: { '#tipo': 'tipo' },
      ExpressionAttributeValues: {
        ':owner': { S: input.pessoaId }, ':tipo': { S: input.type },
        ':verified': { S: input.verifiedAt ?? new Date().toISOString() },
      },
    }))
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) throw new Error('IDENTIFICATION_ALREADY_LINKED')
    throw error
  }
}

export interface PersonProfile {
  usuarioId: string
  tipoUsuarioId: number
  tipo: UserRole
  clienteId?: string
  personalId?: string
}

async function queryAll(tableName: string, indexName: string, keyName: string, keyValue: string) {
  const results: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue>[] = []
  let lastKey: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined
  do {
    const page = await client.send(new QueryCommand({
      TableName: table(tableName),
      IndexName: indexName,
      KeyConditionExpression: '#key = :value',
      ExpressionAttributeNames: { '#key': keyName },
      ExpressionAttributeValues: { ':value': { S: keyValue } },
      ExclusiveStartKey: lastKey,
    }))
    results.push(...(page.Items ?? []))
    lastKey = page.LastEvaluatedKey
  } while (lastKey)
  return results
}

/** Resolve todos os usuarios e perfis, sem escolher previamente CLIENTE/PERSONAL. */
export async function listPersonProfiles(pessoaId: string): Promise<PersonProfile[]> {
  if (!pessoaId) throw new Error('pessoaId obrigatorio')
  const users = await queryAll('FITPESO_USUARIO_TABLE', 'UsuarioByPessoa', 'pessoa_id', pessoaId)
  const profiles = await Promise.all(users.map(async user => {
    const usuarioId = user.user_id?.S
    const tipoUsuarioId = Number(user.tipo_usuario_id?.N)
    if (!usuarioId || !Number.isInteger(tipoUsuarioId)) throw new Error('Registro usuario invalido')
    const [clientes, personais] = await Promise.all([
      queryAll('FITPESO_CUSTOMER_V2_TABLE', 'CustomerByUsuario', 'user_id', usuarioId),
      queryAll('FITPESO_PERSONAL_V2_TABLE', 'PersonalByUsuario', 'user_id', usuarioId),
    ])
    const role = user.tipo?.S || ({ 1: 'ADMIN', 2: 'CLIENTE', 3: 'PERSONAL' } as Record<number, UserRole>)[tipoUsuarioId]
    if (role !== 'ADMIN' && role !== 'CLIENTE' && role !== 'PERSONAL') throw new Error('Tipo de usuario desconhecido')
    return {
      usuarioId,
      tipoUsuarioId,
      tipo: role,
      ...(clientes[0]?.customer_id?.S ? { clienteId: clientes[0].customer_id.S } : {}),
      ...(personais[0]?.personal_id?.S ? { personalId: personais[0].personal_id.S } : {}),
    }
  }))
  return profiles
}

export async function resolveVerifiedIdentity(type: IdentificationType, verifiedValue: string) {
  const pessoaId = await findPersonIdByIdentification(type, verifiedValue)
  if (!pessoaId) return null
  return { pessoaId, usuarios: await listPersonProfiles(pessoaId) }
}
