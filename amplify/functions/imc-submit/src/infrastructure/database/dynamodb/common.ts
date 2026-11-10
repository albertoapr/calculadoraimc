import {
  DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'

/** Utilitários internos para as novas tabelas. Nenhuma tabela legada é acessada. */
export type Item = Record<string, AttributeValue>
export type Data = Record<string, unknown>

export const dynamo = new DynamoDBClient({})

export function requiredTable(name: string | undefined, envName: string): string {
  if (!name) throw new Error(`Tabela não configurada: ${envName}`)
  return name
}

export function encode(data: Data): Item {
  const result: Item = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') result[key] = { S: value }
    else if (typeof value === 'number') result[key] = { N: String(value) }
    else if (typeof value === 'boolean') result[key] = { BOOL: value }
    else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
      result[key] = { L: value.map(v => ({ S: v as string })) }
    } else throw new Error(`Atributo não suportado: ${key}`)
  }
  return result
}

export function decode(item: Item): Data {
  const result: Data = {}
  for (const [key, value] of Object.entries(item)) {
    if (value.S !== undefined) result[key] = value.S
    else if (value.N !== undefined) result[key] = Number(value.N)
    else if (value.BOOL !== undefined) result[key] = value.BOOL
    else if (value.L !== undefined) result[key] = value.L.map(v => v.S ?? '')
  }
  return result
}

export async function get<T>(table: string, key: Data): Promise<T | null> {
  const response = await dynamo.send(new GetItemCommand({
    TableName: table, Key: encode(key), ConsistentRead: true,
  }))
  return response.Item ? decode(response.Item) as unknown as T : null
}

export async function create(table: string, data: Data, pk: string): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: table, Item: encode(data),
    ConditionExpression: 'attribute_not_exists(#pk)',
    ExpressionAttributeNames: { '#pk': pk },
  }))
}

export async function replace(table: string, data: Data, pk: string): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: table, Item: encode(data),
    ConditionExpression: 'attribute_exists(#pk)',
    ExpressionAttributeNames: { '#pk': pk },
  }))
}

/** Paginação completa, inclusive para índices com mais de 1 MB. */
export async function queryAll<T>(table: string, index: string, attribute: string, value: AttributeValue): Promise<T[]> {
  const results: T[] = []
  let cursor: Item | undefined
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: table, IndexName: index,
      KeyConditionExpression: '#attr = :value',
      ExpressionAttributeNames: { '#attr': attribute },
      ExpressionAttributeValues: { ':value': value },
      ExclusiveStartKey: cursor,
    }))
    for (const item of response.Items ?? []) results.push(decode(item) as unknown as T)
    cursor = response.LastEvaluatedKey
  } while (cursor)
  return results
}

export async function scanAll<T>(table: string): Promise<T[]> {
  const results: T[] = []
  let cursor: Item | undefined
  do {
    const response = await dynamo.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }))
    for (const item of response.Items ?? []) results.push(decode(item) as unknown as T)
    cursor = response.LastEvaluatedKey
  } while (cursor)
  return results
}
