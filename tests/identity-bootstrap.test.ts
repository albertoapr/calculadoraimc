import assert from 'node:assert/strict'
import { test } from 'node:test'
import { customerIdForPerson, toE164Brazilian } from '../amplify/functions/imc-submit/identity-bootstrap'

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

test('customer_id é estável por pessoa e independente da identificação de login', () => {
  const pessoaId = '27bfb44f-91c5-4abc-b5ca-17a35ee81d7c'
  const cliente = customerIdForPerson(pessoaId)
  assert.match(cliente, /^C_[0-9a-f]{32}$/)
  assert.equal(customerIdForPerson(pessoaId), cliente)
  assert.notEqual(customerIdForPerson('ab0ef845-42e9-41ca-b34f-2a1d5d1ecc6a'), cliente)
  assert.throws(() => customerIdForPerson(''))
})
