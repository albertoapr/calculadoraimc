import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createBetaOnboardingInvitation,
  signBetaOnboardingMessage,
  verifyBetaOnboardingInvitation,
  BETA_ONBOARDING_TEMPLATES,
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
  for (const body of Object.values(BETA_ONBOARDING_TEMPLATES)) {
    const invite = createBetaOnboardingInvitation(body, secret)
    assert.equal(verifyBetaOnboardingInvitation(invite.shareText, secret), body)
  }
  assert.throws(() => signBetaOnboardingMessage('Mensagem\ncom quebra', secret))
  assert.throws(() => signBetaOnboardingMessage(academyMessage, ''))
})

test('API Beta rejeita texto alterado e texto sem hash antes de acessar o banco', async () => {
  const keys = [
    'IMC_REQUESTS_TABLE', 'FITPESO_CUSTOMERS_TABLE', 'TRAINERS_TABLE',
    'FITPESO_WHATSAPP_LOGIN_URL', 'TRAINER_WHATSAPP_VERIFY_SECRET',
  ] as const
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    process.env.IMC_REQUESTS_TABLE = 'test-only-code-store'
    process.env.FITPESO_CUSTOMERS_TABLE = 'test-only-customers'
    process.env.TRAINERS_TABLE = 'test-only-trainers'
    process.env.FITPESO_WHATSAPP_LOGIN_URL = 'https://develop.fitpeso.com.br/'
    process.env.TRAINER_WHATSAPP_VERIFY_SECRET = secret
    const { betaOnboardingCommand } = await import('../amplify/functions/imc-submit/beta-onboarding')
    const invitation = createBetaOnboardingInvitation(academyMessage, secret)
    const whatsapp = '+5521999999999'
    for (const message of [
      academyMessage,
      invitation.shareText.replace('Mesquita', 'Canadá'),
      invitation.shareText + '\nTexto adicionado',
    ]) {
      const result = await betaOnboardingCommand({ message, whatsapp })
      assert.equal(result.statusCode, 422)
      assert.match(result.body, /sem hash válido/)
    }
    // A valid HMAC passes the integrity check (no database access when phone is invalid).
    const accepted = await betaOnboardingCommand({ message: invitation.shareText, whatsapp: 'invalid' })
    assert.equal(accepted.statusCode, 400)
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key]
      else process.env[key] = old[key]
    }
  }
})


test('os dois textos oficiais têm assinaturas fixas distintas e não admitem alterações', () => {
  assert.equal(BETA_ONBOARDING_TEMPLATES.trainer,
    'Quero me inscrever em fitpeso.com.br como personal para receber pedidos de acompanhamento de treino.')
  assert.equal(BETA_ONBOARDING_TEMPLATES.customer,
    'Quero me inscrever em fitpeso.com.br como cliente para encontrar um personal trainer e solicitar acompanhamento de treino.')
  const personal = createBetaOnboardingInvitation(BETA_ONBOARDING_TEMPLATES.trainer, secret)
  const client = createBetaOnboardingInvitation(BETA_ONBOARDING_TEMPLATES.customer, secret)
  assert.notEqual(personal.hash, client.hash)
  assert.equal(verifyBetaOnboardingInvitation(personal.shareText, secret), BETA_ONBOARDING_TEMPLATES.trainer)
  assert.equal(verifyBetaOnboardingInvitation(client.shareText, secret), BETA_ONBOARDING_TEMPLATES.customer)
  assert.equal(verifyBetaOnboardingInvitation(
    personal.shareText.replace('receber pedidos', 'receber propostas'), secret,
  ), null)
  assert.equal(verifyBetaOnboardingInvitation(
    client.shareText.replace('como cliente', 'como personal'), secret,
  ), null)
  assert.deepEqual(parseBetaOnboardingMessage(BETA_ONBOARDING_TEMPLATES.trainer), { role: 'trainer' })
  assert.deepEqual(parseBetaOnboardingMessage(BETA_ONBOARDING_TEMPLATES.customer), { role: 'customer' })
})
