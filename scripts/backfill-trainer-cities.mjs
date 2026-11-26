// Dry-run by default. Run against a deployed DEVELOP environment, then verify counts.
import { DynamoDBClient, ScanCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
const { TRAINERS_TABLE, CITIES_TABLE, TRAINER_CITIES_TABLE } = process.env
if (!TRAINERS_TABLE || !CITIES_TABLE || !TRAINER_CITIES_TABLE || new Set([TRAINERS_TABLE, CITIES_TABLE, TRAINER_CITIES_TABLE]).size !== 3)
  throw new Error('Informe TRAINERS_TABLE, CITIES_TABLE e TRAINER_CITIES_TABLE do ambiente develop.')
const apply = process.argv.includes('--apply')
const db = new DynamoDBClient({})
async function* scan(table, projection) {
  let cursor
  do {
    const page = await db.send(new ScanCommand({ TableName: table, ConsistentRead: true,
      ProjectionExpression: projection, ExclusiveStartKey: cursor }))
    yield* page.Items ?? []
    cursor = page.LastEvaluatedKey
  } while (cursor)
}
const catalog = new Map()
for await (const row of scan(CITIES_TABLE, 'cityId, cityKey')) {
  if (row.cityId?.S && row.cityKey?.S) catalog.set(row.cityKey.S, row.cityId.S)
}
const legacy = []
let invalid = 0
for await (const row of scan(TRAINERS_TABLE, 'trainerId, city')) {
  const trainerId = row.trainerId?.S, city = row.city?.S, cityId = catalog.get(city)
  if (!trainerId || !cityId) { invalid++; continue }
  legacy.push({ trainerId, city, cityId })
}
const key = (trainerId, cityId) => JSON.stringify([trainerId, cityId])
const expected = new Set(legacy.map(row => key(row.trainerId, row.cityId)))
const actual = new Set()
for await (const row of scan(TRAINER_CITIES_TABLE, 'trainerId, cityId'))
  actual.add(key(row.trainerId?.S, row.cityId?.S))
const missing = legacy.filter(row => !actual.has(key(row.trainerId, row.cityId)))
const orphan = [...actual].filter(k => !expected.has(k)).length
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', expected: expected.size, existing: actual.size, missing: missing.length, orphan, invalid }))
if (invalid || orphan) throw new Error('Há vínculos inconsistentes. Revise antes de aplicar; não serão removidos automaticamente.')
if (!apply) process.exit(0)
let written = 0
for (const row of missing) {
  // Atomic existence check avoids resurrecting a link removed while backfill runs.
  await db.send(new TransactWriteItemsCommand({ TransactItems: [
    { ConditionCheck: { TableName: TRAINERS_TABLE, Key: { city: { S: row.city }, trainerId: { S: row.trainerId } },
      ConditionExpression: 'attribute_exists(trainerId)' } },
    { Update: { TableName: TRAINER_CITIES_TABLE, Key: { trainerId: { S: row.trainerId }, cityId: { S: row.cityId } },
      UpdateExpression: 'SET cityKey = :city, createdAt = if_not_exists(createdAt, :now)',
      ExpressionAttributeValues: { ':city': { S: row.city }, ':now': { S: new Date().toISOString() } } } },
  ] }))
  written++
}
console.log(JSON.stringify({ written, next: 'Execute novamente sem --apply; missing e orphan devem ser zero.' }))
