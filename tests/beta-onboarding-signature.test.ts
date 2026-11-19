import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createBetaOnboardingInvitation,
  signBetaOnboardingMessage,
  verifyBetaOnboardingInvitation,
} from '../amplify/functions/imc-submit/beta-onboarding-signature'
import { parseBetaOnboardingMessage } from '../amplify/functions/imc-submit/beta-onboarding-command'

const secret = 'a-server-only-key-for-testing-32bytes'
const academyMessage =
  'Sou personal da Academia Aquatic Center, no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso.'

test('mesma mensagem fixa gera o mesmo hash e pode ser compartilhada com varias pessoas', () => {
  const first = createBetaOnboardingInvitation(academyMessage, secret)
  const second = createBetaOnboardingInvitation(academyMessage, secret)
  assert.deepEqual(first, second)
  assert.equal(first.hash.length, 64)
  assert.equal(first.shareText, academyMessage + '\nHash: ' + first.hash)
  assert.equal(verifyBetaOnboardingInvitation(first.shareText, secret), academyMessage)
  assert.equal(verifyBetaOnboardingInvitation(first.shareText, secret), academyMessage)
  assert.deepEqual(parseBetaOnboardingMessage(academyMessage), {
    role: 'trainer',
    academyName: 'aquatic center',
    neighborhood: 'vila emil',
    city: 'Mesquita',
  })
})

test('qualquer alteracao no texto original ou hash faz rejeitar o convite', () => {
  const original = createBetaOnboardingInvitation(academyMessage, secret)
  for (const changed of [
    original.shareText.replace('Mesquita', 'Canadá'),
    original.shareText.replace('Sou personal', 'Sou professor'),
    original.shareText.replace('Aquatic Center', 'Academia X'),
    original.shareText.replace('na FitPeso.', 'na FitPeso. Outros dados pessoais.'),
    original.shareText.replace('Hash: ', 'hash: '),
    original.shareText.replace('Hash: ', 'Hash: 0'),
    original.shareText + ' ',
    original.shareText + '\n',
    original.shareText.replace('\n', '\r\n'),
    academyMessage,
    '',
  ]) {
    assert.equal(verifyBetaOnboardingInvitation(changed, secret), null)
  }
})

test('hash SHA-256 puro nao substitui uma assinatura HMAC secreta', () => {
  const digest = createHash('sha256').update(academyMessage).digest('hex')
  assert.equal(verifyBetaOnboardingInvitation(academyMessage + '\nHash: ' + digest, secret), null)
  const forged = createBetaOnboardingInvitation(academyMessage + ' Novo texto.', 'not-the-real-secret')
  assert.equal(verifyBetaOnboardingInvitation(forged.shareText, secret), null)
})

test('convites genericos de cliente e personal tambem sao assinados', () => {
  for (const body of ['Sou cliente fitpeso', 'Sou personal fitpeso']) {
    const invite = createBetaOnboardingInvitation(body, secret)
    assert.equal(verifyBetaOnboardingInvitation(invite.shareText, secret), body)
  }
  assert.throws(() => signBetaOnboardingMessage('Mensagem\ncom quebra', secret))
  assert.throws(() => signBetaOnboardingMessage(academyMessage, ''))
})
