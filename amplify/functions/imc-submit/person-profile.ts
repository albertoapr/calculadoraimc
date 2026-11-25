import { DynamoDBClient, GetItemCommand, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'

const db = new DynamoDBClient({})
const photos = new S3Client({})
const MAX_PHOTO_BYTES = 65536
const photoPrefix = (id: string) => 'people/' + createHash('sha256').update(id).digest('hex') + '/'
function validPhotoKey(id: string, key: string) {
  const prefix = photoPrefix(id)
  return key.startsWith(prefix) && /^[a-f0-9-]{36}\.jpg$/.test(key.slice(prefix.length))
}
function photoBucket() {
  const bucket = process.env.PROFILE_PHOTOS_BUCKET
  if (!bucket) throw new Error('PROFILE_PHOTOS_UNAVAILABLE')
  return bucket
}
function jpegDataUrl(bytes: Uint8Array) {
  return 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64')
}
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
    googlePhotoUrl: await loadStoredPersonPhoto(pessoaId, record.Item) || record.Item.googlePhotoUrl?.S || fallback.googlePhotoUrl,
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

/** A tabela guarda somente a chave do objeto; a imagem permanece no bucket privado. */
export async function savePersonPhoto(pessoaId: string, bytes: Uint8Array, legacyPhoto?: string) {
  if (bytes.length < 100 || bytes.length > MAX_PHOTO_BYTES) throw new Error('INVALID_PROFILE_PHOTO')
  const bucket = photoBucket()
  const key = photoPrefix(pessoaId) + randomUUID() + '.jpg'
  await photos.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/jpeg',
    CacheControl: 'private, no-store', ServerSideEncryption: 'AES256',
  }))
  let oldKey: string | undefined
  try {
    const update = await db.send(new UpdateItemCommand({
      TableName: table(), Key: { pessoa_id: { S: pessoaId } },
      UpdateExpression: 'SET profilePhotoKey = :key REMOVE profilePhoto',
      ConditionExpression: 'attribute_exists(pessoa_id)' + (legacyPhoto === undefined ? '' :
        ' AND attribute_not_exists(profilePhotoKey) AND profilePhoto = :legacy'),
      ExpressionAttributeValues: {
        ':key': { S: key }, ...(legacyPhoto === undefined ? {} : { ':legacy': { S: legacyPhoto } }),
      },
      ReturnValues: 'ALL_OLD',
    }))
    oldKey = update.Attributes?.profilePhotoKey?.S
  } catch (error) {
    await photos.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)
    throw error
  }
  // Each upload has a different object key. Delete only the previous object after committing.
  if (oldKey && oldKey !== key && validPhotoKey(pessoaId, oldKey)) {
    await photos.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey })).catch(() => {
      console.warn('[profile-photo] Previous object cleanup failed')
    })
  }
}

/** Marker for directory responses, never the S3 key or the image bytes. */
export function personPhotoReference(record: Record<string, AttributeValue>) {
  const key = record.profilePhotoKey?.S
  if (key) return 'fitpeso-photo:' + createHash('sha256').update(key).digest('hex').slice(0, 24)
  if (record.profilePhoto?.S) return 'fitpeso-photo:legacy'
  return ''
}

async function loadStoredPersonPhoto(pessoaId: string, record: Record<string, AttributeValue>): Promise<string> {
  const key = record.profilePhotoKey?.S
  if (key && validPhotoKey(pessoaId, key)) {
    try {
      const object = await photos.send(new GetObjectCommand({ Bucket: photoBucket(), Key: key }))
      if (!object.Body || (object.ContentLength ?? 0) > MAX_PHOTO_BYTES) return ''
      const bytes = await object.Body.transformToByteArray()
      return bytes.length <= MAX_PHOTO_BYTES ? jpegDataUrl(bytes) : ''
    } catch {
      console.warn('[profile-photo] Object read failed')
      return ''
    }
  }
  // Compatibility with the earlier develop build. Migrate only if the old value is unchanged.
  const legacy = record.profilePhoto?.S ?? ''
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(legacy) && legacy.length <= 16407) {
    try {
      await savePersonPhoto(pessoaId, Buffer.from(legacy.slice('data:image/jpeg;base64,'.length), 'base64'), legacy)
      return legacy
    } catch {
      // A simultaneous upload may have replaced it; reload the current metadata once.
      try {
        const current = await db.send(new GetItemCommand({
          TableName: table(), Key: { pessoa_id: { S: pessoaId } }, ConsistentRead: true,
        }))
        if (current.Item?.profilePhotoKey?.S) return loadStoredPersonPhoto(pessoaId, current.Item)
      } catch { /* retain the existing photo if migration is temporarily unavailable */ }
      return legacy
    }
  }
  return ''
}
