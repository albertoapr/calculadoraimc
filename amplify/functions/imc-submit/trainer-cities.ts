import type { TransactWriteItem } from '@aws-sdk/client-dynamodb'
import { getCities } from './cities'

/** During migration the legacy directory remains authoritative; mirror the relationships atomically. */
export async function trainerCityChanges(trainerId: string, previous: string[], next: string[]): Promise<TransactWriteItem[]> {
  const table = process.env.TRAINER_CITIES_TABLE
  if (!table) throw new Error('TRAINER_CITIES_TABLE_UNAVAILABLE')
  const catalog = new Map((await getCities()).map(city => [city.cityKey, city.cityId]))
  const keys = new Set([...previous, ...next])
  for (const city of keys) if (!catalog.has(city)) throw new Error('INVALID_CITY')
  const changes: TransactWriteItem[] = []
  for (const city of next) changes.push({ Update: {
    TableName: table, Key: { trainerId: { S: trainerId }, cityId: { S: catalog.get(city)! } },
    UpdateExpression: 'SET cityKey = :city, createdAt = if_not_exists(createdAt, :now)',
    ExpressionAttributeValues: { ':city': { S: city }, ':now': { S: new Date().toISOString() } },
  } })
  for (const city of previous.filter(city => !next.includes(city))) changes.push({ Delete: {
    TableName: table, Key: { trainerId: { S: trainerId }, cityId: { S: catalog.get(city)! } },
  } })
  return changes
}
