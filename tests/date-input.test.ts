import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatDateForInput,
  maskDateInput,
  parseDateInput,
} from '../src/utils/dateInput'

test('data de nascimento aceita digitação brasileira e mantém ISO na API', () => {
  assert.equal(maskDateInput('01021990'), '01/02/1990')
  assert.equal(maskDateInput('01a02b1990'), '01/02/1990')
  assert.equal(parseDateInput('29/02/2024', '1900-01-01', '2026-12-31'), '2024-02-29')
  assert.equal(formatDateForInput('2024-02-29'), '29/02/2024')
})

test('data de nascimento rejeita datas inexistentes e fora dos limites', () => {
  assert.equal(parseDateInput('31/02/2024'), '')
  assert.equal(parseDateInput('29/02/2023'), '')
  assert.equal(parseDateInput('31/12/1899', '1900-01-01'), '')
  assert.equal(parseDateInput('01/01/2027', '1900-01-01', '2026-12-31'), '')
})
