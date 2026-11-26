import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newTrainerSignupToken, trainerSignupTokenHash, matchesTrainerSignupToken } from '../amplify/functions/imc-submit/trainer-signup-proof'
test('browser proof is separate from the WhatsApp code and stored only as a hash', () => {
  const token = newTrainerSignupToken()
  assert.equal(token.length, 43)
  const hash = trainerSignupTokenHash(token)
  assert.equal(matchesTrainerSignupToken(token, hash), true)
  assert.equal(matchesTrainerSignupToken(newTrainerSignupToken(), hash), false)
  assert.equal(matchesTrainerSignupToken('A'.repeat(22), hash), false)
  assert.equal(matchesTrainerSignupToken(token, undefined), false)
})
