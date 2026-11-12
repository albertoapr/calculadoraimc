import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createPinia, setActivePinia, storeToRefs } from 'pinia'
import { useTrainerSelection } from '../src/stores/trainerSelection'

beforeEach(() => {
  setActivePinia(createPinia())
})

test('starts with an empty selection', () => {
  const selection = useTrainerSelection()
  assert.deepEqual(selection.selectedTrainerIds, [])
  assert.equal(selection.count, 0)
  assert.equal(selection.canAdd, true)
})

test('limits selection to 20 professionals and removes duplicate ids', () => {
  const selection = useTrainerSelection()
  selection.setSelectedTrainerIds(['trainer-1', 'trainer-1', ...Array.from({ length: 24 }, (_, i) => `trainer-${i + 2}`)])
  assert.equal(selection.selectedTrainerIds.length, 20)
  assert.equal(new Set(selection.selectedTrainerIds).size, 20)
  assert.equal(selection.count, 20)
  assert.equal(selection.canAdd, false)
})

test('shared store references update and clear when the request is reset', () => {
  const first = useTrainerSelection()
  const second = useTrainerSelection()
  const { selectedTrainerIds } = storeToRefs(second)

  first.setSelectedTrainerIds(['trainer-42'])
  assert.deepEqual(selectedTrainerIds.value, ['trainer-42'])
  second.clearSelection()
  assert.deepEqual(first.selectedTrainerIds, [])
  assert.equal(first.count, 0)
})
