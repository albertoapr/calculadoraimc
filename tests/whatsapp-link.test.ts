import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppMagicLink } from '../amplify/functions/imc-submit/whatsapp-login-link'

const input = {
  code: 'A'.repeat(22),
  whatsapp: '+5521999999999',
  role: 'customer' as const,
  challengeExpiresAt: 1_000_000 + 15 * 60,
  secret: 'beta-secret-only-on-server',
  baseUrl: 'https://develop.fitpeso.com.br/',
  nowSeconds: 1_000_000,
}

test('WhatsApp link is opaque, keyed, branch scoped and valid for at most five minutes', () => {
  const link = createWhatsAppMagicLink(input)
  const url = new URL(link.loginLink)
  const token = url.searchParams.get('whatsappLoginCode')!
  assert.equal(url.origin, 'https://develop.fitpeso.com.br')
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(token, input.code)
  assert.equal(link.item.codeHash.S?.length, 64)
  assert.equal(link.item.codeHash.S, link.linkHash)
  assert.equal(link.item.whatsapp.S, input.whatsapp)
  assert.equal(link.item.expiresAt.N, String(1_000_300))
  assert.equal(createWhatsAppMagicLink(input).loginLink, link.loginLink)
  assert.notEqual(createWhatsAppMagicLink({ ...input, secret: 'another-secret' }).loginLink, link.loginLink)
})
test('link expires with its challenge and a trainer link must carry a trainer identity', () => {
  const link = createWhatsAppMagicLink({ ...input, challengeExpiresAt: 1_000_120 })
  assert.equal(link.expiresAt, 1_000_120)
  assert.throws(() => createWhatsAppMagicLink({ ...input, role: 'trainer' }), /Trainer identification/)
  const trainer = createWhatsAppMagicLink({ ...input, role: 'trainer', trainerId: 'id', city: 'Mesquita' })
  assert.equal(trainer.item.trainerId.S, 'id')
})
test('reject open redirects, untrusted hosts and insecure URL schemes', () => {
  for (const baseUrl of [
    'http://fitpeso.com.br/',
    'https://evil.example/',
    'https://develop.d3w24y6suih6n1.amplifyapp.com/',
    'https://fitpeso.com.br.evil.example/',
    'https://fitpeso.com.br@evil.example/',
    'https://fitpeso.com.br/path',
    'https://fitpeso.com.br/?redirect=https://evil.example/',
  ]) assert.throws(() => createWhatsAppMagicLink({ ...input, baseUrl }))
})
