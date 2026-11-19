import assert from 'node:assert/strict'
import { test } from 'node:test'
import { identificationKey } from '../amplify/functions/imc-submit/identity-store'

test('email normalizado e independente de caixa', () => {
  assert.equal(identificationKey('EMAIL', ' Pessoa@Example.COM '), 'EMAIL#pessoa@example.com')
})

test('WhatsApp preserva formato E.164', () => {
  assert.equal(identificationKey('WHATSAPP', '+5521999999999'), 'WHATSAPP#+5521999999999')
  assert.throws(() => identificationKey('WHATSAPP', '(21) 99999-9999'))
})

test('identificacao vazia ou email invalido e rejeitado', () => {
  assert.throws(() => identificationKey('EMAIL', ''))
  assert.throws(() => identificationKey('EMAIL', 'nome-invalido'))
})

test('Google usa sub e nao endereco de email', () => {
  assert.equal(identificationKey('GOOGLE', '12345678901234567890'), 'GOOGLE#12345678901234567890')
  assert.throws(() => identificationKey('GOOGLE', 'pessoa@example.com'))
})
