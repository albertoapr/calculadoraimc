import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { bindPublicNavigation } from '../src/composables/usePublicNavigation'

test('public navigation supports directory, home and browser history without resetting a draft', async () => {
  const component = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component }],
  })
  await router.push('/')
  const mode = ref('home')
  const draft = { days: ['Segunda-feira'], trainers: ['personal-1'] }
  const stop = bindPublicNavigation(
    router,
    mode,
    () => {
      mode.value = 'public-trainers'
    },
    () => {
      mode.value = 'home'
    },
  )
  mode.value = 'public-trainers'
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(router.currentRoute.value.path, '/profissionais')
  mode.value = 'home'
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(router.currentRoute.value.path, '/')
  mode.value = 'public-trainers'
  await new Promise((resolve) => setImmediate(resolve))
  await router.push('/')
  assert.equal(mode.value, 'home')
  const returned = new Promise<void>((resolve) => {
    const remove = router.afterEach(() => {
      remove()
      resolve()
    })
  })
  router.back()
  await returned
  assert.equal(mode.value, 'public-trainers')
  assert.deepEqual(draft, { days: ['Segunda-feira'], trainers: ['personal-1'] })
  stop()
})
