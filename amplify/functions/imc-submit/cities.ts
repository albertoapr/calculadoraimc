import {
  ConditionalCheckFailedException, DynamoDBClient, PutItemCommand, ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'

type Item = Record<string, AttributeValue>
type City = {
  cityId: string
  cityKey: string
  name: string
  state: string
  slug: string
  active: boolean
  minimumHourlyRateCents: number | null
  averageHourlyRateCents: number | null
  pricesUpdatedAt: string | null
}

const dynamodb = new DynamoDBClient({})
const initialCities: City[] = [
  ['Mesquita', 'mesquita'],
  ['Nilópolis', 'nilopolis'],
  ['Nova Iguaçu', 'nova-iguacu'],
  ['Rio de Janeiro', 'rio-de-janeiro'],
].map(([name, slug]) => ({
  cityId: slug, cityKey: name, name, state: 'RJ', slug, active: true,
  minimumHourlyRateCents: null, averageHourlyRateCents: null, pricesUpdatedAt: null,
}))

function cityItem(city: City, updatedAt: string): Item {
  return {
    cityId: { S: city.cityId }, cityKey: { S: city.cityKey }, name: { S: city.name },
    state: { S: city.state }, slug: { S: city.slug }, active: { BOOL: city.active },
    updatedAt: { S: updatedAt },
    ...(city.minimumHourlyRateCents === null ? {} : { minimumHourlyRateCents: { N: String(city.minimumHourlyRateCents) } }),
    ...(city.averageHourlyRateCents === null ? {} : { averageHourlyRateCents: { N: String(city.averageHourlyRateCents) } }),
    ...(city.pricesUpdatedAt ? { pricesUpdatedAt: { S: city.pricesUpdatedAt } } : {}),
  }
}

function fromItem(item: Item): City {
  return {
    cityId: item.cityId.S!, cityKey: item.cityKey.S!, name: item.name.S!,
    state: item.state.S!, slug: item.slug.S!, active: item.active?.BOOL === true,
    minimumHourlyRateCents: item.minimumHourlyRateCents?.N === undefined ? null : Number(item.minimumHourlyRateCents.N),
    averageHourlyRateCents: item.averageHourlyRateCents?.N === undefined ? null : Number(item.averageHourlyRateCents.N),
    pricesUpdatedAt: item.pricesUpdatedAt?.S ?? null,
  }
}

async function scanCities(tableName: string) {
  const items: Item[] = []
  let cursor: Item | undefined
  do {
    const page = await dynamodb.send(new ScanCommand({
      TableName: tableName, ConsistentRead: true, ExclusiveStartKey: cursor,
    }))
    items.push(...(page.Items ?? []))
    cursor = page.LastEvaluatedKey
  } while (cursor)
  return items
}

export async function getCities() {
  const tableName = process.env.CITIES_TABLE
  if (!tableName) throw new Error('CITY_TABLE_UNAVAILABLE')
  let items = await scanCities(tableName)
  const existingIds = new Set(items.map(item => item.cityId.S))
  const missing = initialCities.filter(city => !existingIds.has(city.cityId))
  if (missing.length) {
    await Promise.all(missing.map(async city => {
      try {
        await dynamodb.send(new PutItemCommand({
          TableName: tableName, Item: cityItem(city, new Date().toISOString()),
          ConditionExpression: 'attribute_not_exists(cityId)',
        }))
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error
      }
    }))
    items = await scanCities(tableName)
  }
  return items.map(item => ({ ...fromItem(item), updatedAt: item.updatedAt.S! }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.state.localeCompare(b.state))
}

export async function getActiveCityKeys() {
  return (await getCities()).filter(city => city.active).map(city => city.cityKey)
}

export async function getCityKeys() {
  return (await getCities()).map(city => city.cityKey)
}

const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const citySlug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function validPrice(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

export async function writeCity(data: Record<string, unknown> | null, cityId?: string) {
  if (!data || typeof data.active !== 'boolean') return { status: 400, body: { error: 'Confira os dados da cidade.' } }
  const minimum = data.minimumHourlyRateCents ?? null
  const average = data.averageHourlyRateCents ?? null
  if (!validPrice(minimum) || !validPrice(average) || (minimum !== null && average !== null && average < minimum)) {
    return { status: 400, body: { error: 'Informe valores positivos. O valor médio deve ser igual ou superior ao mínimo.' } }
  }

  const cities = await getCities()
  const previous = cities.find(city => city.cityId === cityId)
  if (previous && data.updatedAt !== previous.updatedAt)
    return { status: 409, body: { error: 'A cidade foi alterada. Atualize a lista antes de salvar.' } }
  if (cityId && !previous) return { status: 404, body: { error: 'Cidade não encontrada.' } }
  const name = previous?.name ?? (typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ').normalize('NFC') : '')
  const state = previous?.state ?? (typeof data.state === 'string' ? data.state.trim().toUpperCase() : '')
  const slug = previous?.slug ?? `${citySlug(name)}-${state.toLowerCase()}`
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name) || !citySlug(name) || !states.has(state)) {
    return { status: 400, body: { error: 'Informe o nome do município e uma UF válida.' } }
  }
  if (!previous && cities.some(city => city.state === state && citySlug(city.name) === citySlug(name))) {
    return { status: 409, body: { error: 'Este município já está cadastrado nesta UF.' } }
  }

  const now = new Date().toISOString()
  const pricesChanged = minimum !== (previous?.minimumHourlyRateCents ?? null) ||
    average !== (previous?.averageHourlyRateCents ?? null)
  const city: City = {
    cityId: previous?.cityId ?? slug, cityKey: previous?.cityKey ?? `${name}, ${state}`, name, state, slug,
    active: data.active, minimumHourlyRateCents: minimum, averageHourlyRateCents: average,
    pricesUpdatedAt: pricesChanged ? now : previous?.pricesUpdatedAt ?? null,
  }
  try {
    await dynamodb.send(new PutItemCommand({
      TableName: process.env.CITIES_TABLE, Item: cityItem(city, now),
      ...(previous ? {
        ConditionExpression: 'updatedAt = :previous',
        ExpressionAttributeValues: { ':previous': { S: previous.updatedAt } },
      } : { ConditionExpression: 'attribute_not_exists(cityId)' }),
    }))
    return { status: previous ? 200 : 201, body: { city: { ...city, updatedAt: now } } }
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException)
      return { status: 409, body: { error: 'A cidade já existe ou foi alterada simultaneamente. Atualize a lista.' } }
    throw error
  }
}
