import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBetaOnboardingCommand } from '../amplify/functions/imc-submit/beta-onboarding-command'
import { createBetaTrainerSignupLink } from '../amplify/functions/imc-submit/whatsapp-login-link'

test('comandos explícitos da Beta são reconhecidos sem depender de maiúsculas/minúsculas', () => {
  assert.equal(parseBetaOnboardingCommand('Sou cliente fitpeso'), 'customer')
  assert.equal(parseBetaOnboardingCommand('  SOU PERSONAL FitPeso!  '), 'trainer')
  assert.equal(parseBetaOnboardingCommand('sou   personal   fitpeso.'), 'trainer')
  assert.equal(parseBetaOnboardingCommand('Sou cliente FITPESO?'), 'customer')
  for (const message of ['oi', 'sou cliente', 'sou personal fitpeso 55219999', 'Confirmar login FitPeso 123', '', 'Sou cliente fitpeso\nOutra ação', 'sou personal fitpeso'.repeat(30)]) {
    assert.equal(parseBetaOnboardingCommand(message), null)
  }
})

test('link de cadastro de personal usa domínio personalizado e token opaco', () => {
  const token = 'A'.repeat(43)
  const url = new URL(createBetaTrainerSignupLink('https://develop.fitpeso.com.br/', token))
  assert.equal(url.origin, 'https://develop.fitpeso.com.br')
  assert.equal(url.pathname, '/cadastro/personal')
  assert.equal(url.searchParams.get('betaSignupCode'), token)
  assert.throws(() => createBetaTrainerSignupLink('https://evil.example/', token))
  assert.throws(() => createBetaTrainerSignupLink('https://develop.fitpeso.com.br/', 'short'))
  assert.throws(() => createBetaTrainerSignupLink('http://develop.fitpeso.com.br/', token))
})
