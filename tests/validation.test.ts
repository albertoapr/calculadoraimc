import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidAge,
  isValidBirthDate,
  isValidEmail,
  isValidFormattedCref,
  isValidInstagramHandle,
  isValidLooseCref,
  isValidPersonName,
  isValidProfileSlug,
  normalizeBrazilianPhone,
  normalizeContactIdentifier,
  normalizeEmail,
  normalizeInstagramHandle,
  normalizePersonName,
} from '../src/utils/validation'

test('shared frontend validation keeps identity fields consistent', async (t) => {
  await t.test('names and e-mails normalize before validation', () => {
    assert.equal(normalizePersonName('  Ana   da Silva  '), 'Ana da Silva')
    assert.equal(isValidPersonName('Ana da Silva'), true)
    assert.equal(isValidPersonName('A'), false)
    assert.equal(isValidPersonName('Ana_123'), false)
    assert.equal(isValidPersonName('', true), true)
    assert.equal(normalizeEmail(' ANA@EXAMPLE.COM '), 'ana@example.com')
    assert.equal(isValidEmail('ana@example.com'), true)
    assert.equal(isValidEmail('ana@example'), false)
    assert.equal(isValidEmail(`${'a'.repeat(242)}@example.com`), true)
    assert.equal(isValidEmail(`${'a'.repeat(243)}@example.com`), false)
    assert.equal(isValidEmail('', true), true)
  })

  await t.test('contact parsing returns one canonical WhatsApp or e-mail value', () => {
    assert.equal(normalizeBrazilianPhone('(21) 99999-9999'), '+5521999999999')
    assert.equal(normalizeBrazilianPhone('21 9999-9999'), '+552199999999')
    assert.equal(normalizeBrazilianPhone('123'), '')
    assert.deepEqual(normalizeContactIdentifier(' ANA@EXAMPLE.COM '), {
      kind: 'email',
      value: 'ana@example.com',
    })
    assert.deepEqual(normalizeContactIdentifier('(21) 99999-9999'), {
      kind: 'whatsapp',
      value: '+5521999999999',
    })
    assert.equal(normalizeContactIdentifier('inválido'), null)
  })

  await t.test('dates and ages reject impossible and out-of-range values', () => {
    assert.equal(isValidBirthDate('1990-02-28'), true)
    assert.equal(isValidBirthDate('2020-02-30'), false)
    assert.equal(isValidBirthDate('1899-12-31'), false)
    assert.equal(isValidBirthDate('2999-01-01'), false)
    assert.equal(isValidAge('15'), true)
    assert.equal(isValidAge(100), true)
    assert.equal(isValidAge('14'), false)
    assert.equal(isValidAge('20.5'), false)
  })

  await t.test('professional identifiers share the same boundary rules', () => {
    assert.equal(isValidProfileSlug('vinicius-personal'), true)
    assert.equal(isValidProfileSlug('develop'), false)
    assert.equal(isValidProfileSlug('ab'), false)
    assert.equal(isValidProfileSlug('Nome Inválido'), false)
    assert.equal(normalizeInstagramHandle('instagram.com/ana.personal/'), '@ana.personal')
    assert.equal(normalizeInstagramHandle('https://evil.test/ana'), '')
    assert.equal(isValidInstagramHandle('@ana.personal'), true)
    assert.equal(isValidInstagramHandle('@ana..personal'), false)
    assert.equal(isValidInstagramHandle('', true), true)
    assert.equal(isValidLooseCref('CREF 072573-G/RJ'), true)
    assert.equal(isValidLooseCref('CREF@'), false)
    assert.equal(isValidFormattedCref('072573-g/rj'), true)
    assert.equal(isValidFormattedCref('CREF 072573-G/RJ'), false)
    assert.equal(isValidFormattedCref(''), true)
  })
})
