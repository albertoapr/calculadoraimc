import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCityRequest } from '../amplify/functions/imc-submit/city-request-validation'

test('city request normalizes names and deduplicates by municipality and UF', () => {
  assert.equal(parseCityRequest({ name: '  São   Paulo ', state: 'sp' })?.requestId, 'sao-paulo-sp')
  assert.equal(parseCityRequest({ name: 'Sao Paulo', state: 'SP' })?.requestId, 'sao-paulo-sp')
  assert.notEqual(parseCityRequest({ name: 'São Paulo', state: 'PR' })?.requestId, 'sao-paulo-sp')
  assert.equal(parseCityRequest({ name: 'Curitiba', state: 'PR' })?.state, 'PR')
  assert.equal(parseCityRequest({ name: 'Cidade', state: 'XX' }), null)
  assert.equal(parseCityRequest({ name: '<script>', state: 'RJ' }), null)
  assert.equal(parseCityRequest({ name: 'Cidade', state: 'RJ', phone: '123' }), null)
})
