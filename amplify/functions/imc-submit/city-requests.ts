import { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand, ConditionalCheckFailedException, type AttributeValue } from '@aws-sdk/client-dynamodb'
import { citySlug, getCities, writeCity } from './cities'
import { parseCityRequest } from './city-request-validation'

const db = new DynamoDBClient({})
function table() {
  const name = process.env.CITY_REQUESTS_TABLE
  if (!name) throw new Error('CITY_REQUESTS_UNAVAILABLE')
  return name
}
type Item = Record<string, AttributeValue>
const matchingCity = async (name: string, state: string) =>
  (await getCities()).find(city => city.state === state && citySlug(city.name) === citySlug(name))

function toRequest(item: Item) {
  return { requestId: item.requestId?.S ?? '', name: item.name?.S ?? '', state: item.state?.S ?? '',
    status: item.status?.S ?? 'PENDING', createdAt: item.createdAt?.S ?? '', updatedAt: item.updatedAt?.S ?? '',
    cityId: item.cityId?.S ?? '' }
}
export async function requestCity(data: Record<string, unknown> | null) {
  const parsed = parseCityRequest(data)
  if (!parsed) return { status: 400, body: { error: 'Informe município e UF válidos.' } }
  const existing = await matchingCity(parsed.name, parsed.state)
  if (existing?.active) return { status: 200, body: { status: 'AVAILABLE', city: existing } }
  const stamp = new Date().toISOString()
  try {
    await db.send(new PutItemCommand({ TableName: table(), Item: {
      requestId: { S: parsed.requestId }, name: { S: parsed.name }, state: { S: parsed.state },
      status: { S: 'PENDING' }, createdAt: { S: stamp }, updatedAt: { S: stamp },
    }, ConditionExpression: 'attribute_not_exists(requestId)' }))
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error
    // Idempotent: a repeated request does not create another record or reopen a rejection.
  }
  const stored = (await db.send(new GetItemCommand({ TableName: table(),
    Key: { requestId: { S: parsed.requestId } }, ConsistentRead: true }))).Item
  if (!stored) throw new Error('CITY_REQUEST_UNAVAILABLE')
  const request = toRequest(stored)
  // A previously approved city might subsequently have been deactivated.
  return { status: 200, body: { status: request.status === 'APPROVED' ? 'UNAVAILABLE' : request.status } }
}

export async function listCityRequests() {
  const requests: ReturnType<typeof toRequest>[] = []
  let cursor: Item | undefined
  do {
    const page = await db.send(new ScanCommand({ TableName: table(), ExclusiveStartKey: cursor }))
    requests.push(...(page.Items ?? []).map(toRequest))
    cursor = page.LastEvaluatedKey
  } while (cursor)
  return requests.sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.createdAt.localeCompare(a.createdAt))
}

export async function reviewCityRequest(requestId: string, data: Record<string, unknown> | null, reviewer: string) {
  if (!/^[a-z0-9-]{3,84}$/.test(requestId) || !data ||
      Object.keys(data).some(key => !['action', 'updatedAt'].includes(key)) ||
      !['approve', 'reject'].includes(String(data.action)) || typeof data.updatedAt !== 'string')
    return { status: 400, body: { error: 'Confira a ação solicitada.' } }
  const item = (await db.send(new GetItemCommand({ TableName: table(),
    Key: { requestId: { S: requestId } }, ConsistentRead: true }))).Item
  if (!item) return { status: 404, body: { error: 'Solicitação não encontrada.' } }
  const request = toRequest(item)
  if (request.status !== 'PENDING' || request.updatedAt !== data.updatedAt)
    return { status: 409, body: { error: 'Solicitação já alterada. Atualize a lista.' } }
  const approval = data.action === 'approve'
  // Claim the review before performing the idempotent catalog operation.
  const claimedAt = new Date().toISOString()
  try {
    await db.send(new UpdateItemCommand({ TableName: table(), Key: { requestId: { S: requestId } },
      UpdateExpression: 'SET #status = :reviewing, updatedAt = :now',
      ConditionExpression: '#status = :pending AND updatedAt = :previous',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':reviewing': { S: 'REVIEWING' }, ':pending': { S: 'PENDING' },
        ':now': { S: claimedAt }, ':previous': { S: request.updatedAt } } }))
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return { status: 409, body: { error: 'Solicitação já alterada. Atualize a lista.' } }
    throw error
  }
  try {
    let city = await matchingCity(request.name, request.state)
    if (approval && !city?.active) {
      const result = await writeCity({ name: request.name, state: request.state, active: true,
        minimumHourlyRateCents: city?.minimumHourlyRateCents ?? null, averageHourlyRateCents: city?.averageHourlyRateCents ?? null,
        updatedAt: city?.updatedAt }, city?.cityId)
      city = await matchingCity(request.name, request.state)
      if (result.status >= 400 && !city?.active) throw new Error('CITY_APPROVAL_FAILED')
      if (!city?.active) throw new Error('CITY_APPROVAL_FAILED')
    }
    const approved = approval || city?.active === true
    await db.send(new UpdateItemCommand({ TableName: table(), Key: { requestId: { S: requestId } },
      UpdateExpression: 'SET #status = :status, updatedAt = :now, reviewedBy = :by' + (approved ? ', cityId = :city' : ''),
      ConditionExpression: '#status = :reviewing AND updatedAt = :claimed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': { S: approved ? 'APPROVED' : 'REJECTED' }, ':reviewing': { S: 'REVIEWING' },
        ':now': { S: new Date().toISOString() }, ':claimed': { S: claimedAt }, ':by': { S: reviewer },
        ...(approved ? { ':city': { S: city!.cityId } } : {}) } }))
    return { status: 200, body: { reviewed: true, status: approved ? 'APPROVED' : 'REJECTED' } }
  } catch (error) {
    // Restore a pending item on a recoverable failure. If the city was already created,
    // the next approval reuses it. A hard Lambda timeout may require operator recovery.
    await db.send(new UpdateItemCommand({ TableName: table(), Key: { requestId: { S: requestId } },
      UpdateExpression: 'SET #status = :pending, updatedAt = :now',
      ConditionExpression: '#status = :reviewing AND updatedAt = :claimed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': { S: 'PENDING' }, ':reviewing': { S: 'REVIEWING' },
        ':now': { S: new Date().toISOString() }, ':claimed': { S: claimedAt } } }))
    throw error
  }
}
