import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

type Operation = {
  operationId?: string
  summary?: string
  responses?: Record<string, unknown>
  security?: Array<Record<string, unknown>>
  'x-internal'?: boolean
}

test('contrato OpenAPI é importável por ferramentas e agentes', async () => {
  const source = await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8')
  const document = JSON.parse(source) as {
    openapi?: string
    paths?: Record<string, Record<string, Operation>>
    components?: { securitySchemes?: Record<string, unknown> }
  }

  assert.match(document.openapi ?? '', /^3\.1\./)
  assert.ok(document.components?.securitySchemes?.BearerAuth)
  assert.ok(document.components?.securitySchemes?.IntegrationSecret)

  const operationIds = new Set<string>()
  let operationCount = 0
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    assert.match(path, /^\/api\//)
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue
      operationCount += 1
      assert.ok(operation.operationId, `${method.toUpperCase()} ${path} sem operationId`)
      assert.ok(operation.summary, `${operation.operationId} sem resumo`)
      assert.ok(operation.responses && Object.keys(operation.responses).length)
      assert.equal(operationIds.has(operation.operationId!), false)
      operationIds.add(operation.operationId!)
      if (operation['x-internal']) {
        assert.deepEqual(operation.security, [{ IntegrationSecret: [] }])
      }
    }
  }

  assert.ok(operationCount >= 45)
  assert.equal(source.includes('TRAINER_WHATSAPP_VERIFY_SECRET'), false)
})

test('notificações de propostas são operações internas e confirmadas por proposta', async () => {
  const { paths } = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'))
  const list = paths['/api/requests/proposal-notifications'].get
  const ack = paths['/api/requests/proposal-notified'].post
  for (const operation of [list, ack]) {
    assert.equal(operation['x-internal'], true)
    assert.deepEqual(operation.security, [{ IntegrationSecret: [] }])
  }
  assert.deepEqual(ack.requestBody.content['application/json'].schema.required, ['requestId', 'trainerId'])
  assert.ok(list.responses['200'].content['application/json'].schema.properties.proposals.items.properties.notificationId)
})
