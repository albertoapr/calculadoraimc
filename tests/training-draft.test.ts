import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useTrainingDraft } from '../src/stores/trainingDraft'

test('training draft restores preferences and selection without storing contact or consent', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
  const first = effectScope()
  const second = effectScope()
  try {
    setActivePinia(createPinia())
    const draft = first.run(() => useTrainingDraft())!
    draft.hasDraft = true
    Object.assign(draft.form, {
      city: 'Mesquita', gymName: 'Academia Teste', age: '45',
      objective: 'Condicionamento', trainingDays: ['Terça-feira'],
      name: 'Nome privado', phone: '21999999999', email: 'private@example.test',
      shareContactConsent: true, singleLesson: true,
    })
    draft.selectedTrainerIds = ['personal-1']
    draft.trainingStartMinutes = 360
    draft.trainingEndMinutes = 540
    await nextTick()
    const saved = JSON.parse(values.get('fitpeso:training-draft:v1')!)
    assert.equal(saved.form.name, undefined)
    assert.equal(saved.form.phone, undefined)
    assert.equal(saved.form.email, undefined)
    assert.equal(saved.form.shareContactConsent, undefined)
    first.stop()

    setActivePinia(createPinia())
    const restored = second.run(() => useTrainingDraft())!
    assert.equal(restored.hasDraft, true)
    assert.equal(restored.form.age, '45')
    assert.equal(restored.form.city, 'Mesquita')
    assert.equal(restored.form.gymName, 'Academia Teste')
    assert.equal(restored.form.singleLesson, true)
    assert.deepEqual(restored.form.trainingDays, ['Terça-feira'])
    assert.deepEqual(restored.selectedTrainerIds, ['personal-1'])
    assert.equal(restored.trainingStartMinutes, 360)
    assert.equal(restored.trainingEndMinutes, 540)
    assert.equal(restored.form.name, '')
    assert.equal(restored.form.shareContactConsent, false)
    restored.clearDraft()
    await nextTick()
    assert.equal(values.has('fitpeso:training-draft:v1'), false)
  } finally {
    first.stop()
    second.stop()
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})
