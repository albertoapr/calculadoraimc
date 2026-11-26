import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ConditionalCheckFailedException, DynamoDBClient, PutItemCommand, QueryCommand, ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { writeCity } from '../amplify/functions/imc-submit/cities'
import { handler } from '../amplify/functions/imc-submit/handler'

test('city catalog seeds legacy cities, validates prices and lists public cities by active academy coverage', async (t) => {
  const environment = { ...process.env }
  t.after(() => {
    for (const key of ['CITIES_TABLE', 'ACADEMIES_TABLE', 'TRAINERS_TABLE']) {
      if (environment[key] === undefined) delete process.env[key]
      else process.env[key] = environment[key]
    }
  })
  process.env.CITIES_TABLE = 'cities'
  process.env.ACADEMIES_TABLE = 'academies'
  process.env.TRAINERS_TABLE = 'trainers'
  const cities = new Map<string, Record<string, AttributeValue>>()
  const activeAcademy = {
    academyId: { S: 'academy-1' }, name: { S: 'Fit Gym' }, neighborhood: { S: 'Centro' }, active: { BOOL: true },
  }
  const trainer = {
    trainerId: { S: 'trainer-1' }, name: { S: 'Ana Silva' }, whatsapp: { S: '+5521999999999' },
    slug: { S: 'ana-silva' }, active: { BOOL: true }, academyIds: { L: [{ S: 'academy-1' }] },
  }
  const academies = new Map([['Mesquita', [activeAcademy]], ['Nova Iguaçu', [activeAcademy]]])
  const trainers = new Map([['Mesquita', [trainer]]])
  t.mock.method(DynamoDBClient.prototype, 'send', async (command: unknown) => {
    if (command instanceof ScanCommand && command.input.TableName === 'cities')
      return { Items: [...cities.values()] }
    if (command instanceof PutItemCommand && command.input.TableName === 'cities') {
      const item = command.input.Item!
      const id = item.cityId!.S!
      const existing = cities.get(id)
      const expected = command.input.ExpressionAttributeValues?.[':previous']?.S
      if (existing?.updatedAt?.S !== expected)
        throw new ConditionalCheckFailedException({ message: 'City changed', $metadata: {} })
      cities.set(id, item)
      return {}
    }
    if (command instanceof QueryCommand) {
      const city = command.input.ExpressionAttributeValues?.[':city']?.S ?? command.input.ExpressionAttributeValues?.[':c']?.S ?? ''
      if (command.input.TableName === 'academies') return { Items: academies.get(city) ?? [] }
      if (command.input.TableName === 'trainers') return { Items: trainers.get(city) ?? [] }
    }
    assert.fail('Unexpected DynamoDB command')
  })
  async function list(registration = false) {
    const result = await handler({
      httpMethod: 'GET', resource: '/api/cities',
      queryStringParameters: registration ? { scope: 'registration' } : null,
    } as APIGatewayProxyEvent, {} as Context, () => {}) as APIGatewayProxyResult
    assert.equal(result.statusCode, 200)
    return JSON.parse(result.body).cities
  }

  assert.equal((await list(true)).length, 4)
  assert.deepEqual((await list()).map((city: { cityKey: string }) => city.cityKey), ['Mesquita'])

  const created = await writeCity({ name: 'São Paulo', state: 'SP', active: true, minimumHourlyRateCents: 6000 })
  assert.equal(created.status, 201)
  assert.ok((await list(true)).some((city: { slug: string }) => city.slug === 'sao-paulo-sp'))
  assert.equal((await list()).length, 1)
  assert.equal((await writeCity({ name: 'Sao Paulo', state: 'SP', active: true })).status, 409)
  assert.equal((await writeCity({ name: 'Osasco', state: 'SP', active: true, minimumHourlyRateCents: 6000, averageHourlyRateCents: 5000 })).status, 400)

  const { updatedAt } = (await list(true)).find((city: { cityId: string }) => city.cityId === 'mesquita')
  assert.equal((await writeCity({ active: false, updatedAt, minimumHourlyRateCents: 6000 }, 'mesquita')).status, 200)
  assert.equal((await list()).length, 0)
  assert.equal((await list(true)).some((city: { cityId: string }) => city.cityId === 'mesquita'), false)
  assert.equal(cities.get('mesquita')?.minimumHourlyRateCents?.N, '6000')
})
