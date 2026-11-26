import assert from 'node:assert/strict'
import { test } from 'node:test'
import { trainerSlugCandidate, validTrainerSlug } from '../amplify/functions/imc-submit/trainer-slug'

test('endereço automático normaliza nomes e gera sufixos', () => {
  assert.equal(trainerSlugCandidate('João da Silva'), 'joao-da-silva')
  assert.equal(trainerSlugCandidate('João da Silva', 2), 'joao-da-silva-2')
  assert.equal(trainerSlugCandidate('Admin'), 'admin-personal')
  assert.equal(trainerSlugCandidate('Li'), 'personal-li')
  for (const ordinal of [1, 2, 10, 100]) {
    const slug = trainerSlugCandidate('Á'.repeat(80), ordinal)
    assert.ok(validTrainerSlug(slug))
    assert.ok(slug.length <= 40)
  }
  assert.equal(validTrainerSlug('admin'), false)
  assert.equal(validTrainerSlug('abc/def'), false)
})
