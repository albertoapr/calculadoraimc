import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import {
  createAcademy,
  getAcademyBySlug,
  updateAcademy,
} from '../amplify/functions/imc-submit/academies'

test('reserva o slug globalmente e resolve unidades ativas e cadastros legados', async (t) => {
  const originalTable = process.env.ACADEMIES_TABLE
  process.env.ACADEMIES_TABLE = 'test-academies'
  t.after(() => {
    if (originalTable === undefined) delete process.env.ACADEMIES_TABLE
    else process.env.ACADEMIES_TABLE = originalTable
  })

  const items = new Map<string, Record<string, AttributeValue>>()
  t.mock.method(DynamoDBClient.prototype, 'send', async (command: unknown) => {
    if (command instanceof GetItemCommand)
      return { Item: items.get(command.input.Key!.academyId!.S!) }
    assert.ok(command instanceof TransactWriteItemsCommand)
    const writes = command.input.TransactItems!.flatMap((item) => (item.Put ? [item.Put] : []))
    for (const write of writes) {
      if (
        write.ConditionExpression === 'attribute_not_exists(academyId)' &&
        items.has(write.Item!.academyId!.S!)
      ) {
        const error = new Error('duplicate key')
        error.name = 'TransactionCanceledException'
        throw error
      }
    }
    for (const write of writes) items.set(write.Item!.academyId!.S!, write.Item!)
    return {}
  })

  const fields = { name: 'Aquatic Center', neighborhood: 'Vila Emil', city: 'Mesquita' }
  const slug = 'aquaticcenter-vilaemil'
  const body = (values: object, academyId?: string) =>
    ({ body: JSON.stringify(values), pathParameters: { academyId } }) as Parameters<
      typeof createAcademy
    >[0]
  const lookup = (value: string) =>
    getAcademyBySlug({ pathParameters: { slug: value } } as Parameters<typeof getAcademyBySlug>[0])

  const created = await createAcademy(body(fields), 'admin')
  assert.equal(created.statusCode, 201)
  const { academyId } = JSON.parse(created.body)
  const found = await lookup(slug)
  assert.equal(found.statusCode, 200)
  assert.equal(JSON.parse(found.body).academy.city, 'Mesquita')
  assert.equal(
    (await createAcademy(body({ ...fields, city: 'Nilópolis', slug }), 'admin')).statusCode,
    409,
  )
  assert.equal(
    (await updateAcademy(body({ ...fields, slug: 'outro' }, academyId), 'admin')).statusCode,
    409,
  )
  assert.equal(
    (await updateAcademy(body({ ...fields, active: false }, academyId), 'admin')).statusCode,
    200,
  )
  assert.equal((await lookup(slug)).statusCode, 404)

  const legacyId = '11111111-1111-1111-1111-111111111111'
  items.set(legacyId, {
    academyId: { S: legacyId },
    name: { S: fields.name },
    city: { S: 'Nilópolis' },
    neighborhood: { S: fields.neighborhood },
    active: { BOOL: true },
  })
  const legacySlug = slug + '-nilopolis'
  assert.equal(
    (
      await updateAcademy(
        body({ ...fields, city: 'Nilópolis', slug: legacySlug }, legacyId),
        'admin',
      )
    ).statusCode,
    200,
  )
  assert.equal(JSON.parse((await lookup(legacySlug)).body).academy.academyId, legacyId)
})
