import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const db = new DynamoDBClient({})
const table = () => {
  const name = process.env.FITPESO_PESSOA_TABLE
  if (!name) throw new Error('Tabela pessoa indisponível')
  return name
}

export type PersonFields = { name: string; googlePhotoUrl: string; dateOfBirth: string }

/** Pessoa é a fonte canônica de dados compartilhados por todos os perfis. */
export async function loadPersonFields(
  pessoaId: string | undefined,
  fallback: PersonFields,
): Promise<PersonFields> {
  if (!pessoaId) return fallback
  const record = await db.send(new GetItemCommand({
    TableName: table(), Key: { pessoa_id: { S: pessoaId } }, ConsistentRead: true,
  }))
  if (!record.Item) throw new Error('PERSON_NOT_FOUND')
  return {
    name: record.Item.nome?.S || fallback.name,
    googlePhotoUrl: record.Item.googlePhotoUrl?.S || fallback.googlePhotoUrl,
    dateOfBirth: record.Item.nascimento?.S || fallback.dateOfBirth,
  }
}

/** Inicializa campos da pessoa sem sobrescrever dados cadastrais já editados. */
export async function seedPersonFields(pessoaId: string, values: Partial<PersonFields>) {
  const updates: string[] = []
  const attributes: Record<string, { S: string }> = {}
  if (values.name?.trim()) {
    updates.push('nome = if_not_exists(nome, :name)')
    attributes[':name'] = { S: values.name.trim() }
  }
  if (values.googlePhotoUrl) {
    updates.push('googlePhotoUrl = if_not_exists(googlePhotoUrl, :photo)')
    attributes[':photo'] = { S: values.googlePhotoUrl }
  }
  if (values.dateOfBirth) {
    updates.push('nascimento = if_not_exists(nascimento, :birth)')
    attributes[':birth'] = { S: values.dateOfBirth }
  }
  if (!updates.length) return
  await db.send(new UpdateItemCommand({
    TableName: table(), Key: { pessoa_id: { S: pessoaId } },
    UpdateExpression: 'SET ' + updates.join(', '),
    ConditionExpression: 'attribute_exists(pessoa_id)',
    ExpressionAttributeValues: attributes,
  }))
}

/** Uma foto obtida de um ID token Google validado pertence à pessoa, não ao papel. */
export async function setVerifiedGooglePersonPhoto(pessoaId: string, photoUrl: string) {
  if (!photoUrl) return
  await db.send(new UpdateItemCommand({
    TableName: table(), Key: { pessoa_id: { S: pessoaId } },
    UpdateExpression: 'SET googlePhotoUrl = :photo',
    ConditionExpression: 'attribute_exists(pessoa_id)',
    ExpressionAttributeValues: { ':photo': { S: photoUrl } },
  }))
}

export async function savePersonFields(pessoaId: string, name: string, dateOfBirth?: string) {
  const values: Record<string, { S: string }> = { ':name': { S: name.trim() } }
  let expression = 'SET nome = :name'
  if (dateOfBirth) {
    expression += ', nascimento = :birth'
    values[':birth'] = { S: dateOfBirth }
  }
  await db.send(new UpdateItemCommand({
    TableName: table(), Key: { pessoa_id: { S: pessoaId } },
    UpdateExpression: expression,
    ConditionExpression: 'attribute_exists(pessoa_id)',
    ExpressionAttributeValues: values,
  }))
}
