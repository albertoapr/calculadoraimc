import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toE164Brazilian } from '../amplify/functions/imc-submit/identity-bootstrap'

test('normaliza numero brasileiro legado para E.164', () => {
  assert.equal(toE164Brazilian('21999999999'), '+5521999999999')
  assert.equal(toE164Brazilian('5521999999999'), '+5521999999999')
  assert.equal(toE164Brazilian('+55 (21) 99999-9999'), '+5521999999999')
})

test('recusa telefone ausente ou com quantidade errada de digitos', () => {
  assert.throws(() => toE164Brazilian(''))
  assert.throws(() => toE164Brazilian('123'))
  assert.throws(() => toE164Brazilian('0011223344'))
})
