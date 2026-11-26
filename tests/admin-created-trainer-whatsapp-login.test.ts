import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import { handler } from '../amplify/functions/imc-submit/handler'

test('login unificado confirma e vincula o personal criado pelo administrador', async () => {
  const previousSend = DynamoDBClient.prototype.send
  const previousEnvironment = { ...process.env }
  const whatsapp = '+5521999999999'
  const trainerId = '0123456789abcdef0123456789abcdef'
  const sessionToken = 's'.repeat(43)
  const trainer = {
    city: { S: 'Mesquita' },
    trainerId: { S: trainerId },
    name: { S: 'Personal Teste' },
    whatsapp: { S: whatsapp },
    active: { BOOL: true },
    whatsappVerified: { BOOL: false },
    createdByAdmin: { S: '+5521888888888' },
  }
  const customer = {
    name: { S: 'Personal Teste' },
    status: { S: 'ACTIVE' },
    whatsappVerified: { BOOL: true },
  }
  let challenge: Record<string, AttributeValue> | undefined
  let verificationTransaction: TransactWriteItemsCommand['input'] | undefined

  Object.assign(process.env, {
    FITPESO_CUSTOMERS_TABLE: 'customers',
    IMC_REQUESTS_TABLE: 'codes',
    TRAINERS_TABLE: 'trainers',
    TRAINER_WHATSAPP_VERIFY_SECRET: 'test-secret',
    FITPESO_WHATSAPP_LOGIN_URL: 'https://fitpeso.com.br',
  })

  DynamoDBClient.prototype.send = async function (command) {
    if (command instanceof QueryCommand && command.input.TableName === 'trainers') {
      return command.input.ExpressionAttributeValues?.[':city']?.S === 'Mesquita'
        ? { Items: [trainer] }
        : { Items: [] }
    }
    if (command instanceof GetItemCommand && command.input.TableName === 'customers') {
      return { Item: customer }
    }
    if (command instanceof GetItemCommand && command.input.TableName === 'trainers') {
      return command.input.Key?.city?.S === 'Mesquita' ? { Item: trainer } : {}
    }
    if (command instanceof GetItemCommand && command.input.TableName === 'codes') {
      return { Item: challenge }
    }
    if (command instanceof PutItemCommand && command.input.TableName === 'codes') {
      challenge = command.input.Item
      return {}
    }
    if (command instanceof TransactWriteItemsCommand) {
      verificationTransaction = command.input
      return {}
    }
    throw new Error(`Comando inesperado: ${command.constructor.name}`)
  } as typeof DynamoDBClient.prototype.send

  try {
    const started = await handler({
      httpMethod: 'POST',
      resource: '/api/customers/login',
      body: JSON.stringify({ whatsapp, sessionToken }),
    } as never)
    assert.equal(started.statusCode, 200)
    const startedBody = JSON.parse(started.body)
    assert.equal(startedBody.started, true)
    assert.equal(challenge?.trainerId?.S, trainerId)
    assert.equal(challenge?.createCustomerProfile, undefined)

    const verified = await handler({
      httpMethod: 'POST',
      resource: '/api/customers/verify-login',
      headers: { 'X-Fitpeso-Verification-Secret': 'test-secret' },
      body: JSON.stringify({ code: startedBody.verificationCode, whatsapp }),
    } as never)
    assert.equal(verified.statusCode, 200)
    assert.equal(JSON.parse(verified.body).verified, true)

    const writes = verificationTransaction?.TransactItems ?? []
    const trainerUpdate = writes.find((item) => item.Update?.TableName === 'trainers')?.Update
    assert.ok(trainerUpdate)
    assert.equal(trainerUpdate.Key?.trainerId?.S, trainerId)
    assert.match(trainerUpdate.UpdateExpression ?? '', /whatsappVerified/)
    assert.match(trainerUpdate.ConditionExpression ?? '', /createdByAdmin/)
    assert.equal(
      writes.some((item) => item.Put?.TableName === 'customers'),
      false,
    )
  } finally {
    DynamoDBClient.prototype.send = previousSend
    process.env = previousEnvironment
  }
})
