import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { bindApplicationNavigation } from '../src/composables/useApplicationNavigation'
import { screenRoutes, safeReturnPath } from '../src/router/screens'
import type { AppScreen } from '../src/router/screens'
import type { AppViewMode } from '../src/types/navigation'

const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setImmediate(resolve))
  await nextTick()
}
async function fixture(path: string, restoring = false) {
  const component = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...screenRoutes.map((route) => ({ path: route.path, component })),
      { path: '/personal/:slug', component },
      { path: '/p/:id', component },
    ],
  })
  await router.push(path)
  const entered: AppScreen[] = []
  const state = {
    viewMode: ref<AppViewMode>('home'),
    showCustomerLogin: ref(false),
    showCustomerSignup: ref(false),
    showTrainerSignup: ref(false),
    showRequestForm: ref(false),
    requestLoginReturn: ref(false),
    loginAsTrainer: ref(false),
    sessionRestoring: ref(restoring),
    customerSignedInName: ref(''),
    trainerSignedInId: ref(''),
    customerIsAdmin: ref(false),
    onEnter: (screen: AppScreen) => {
      entered.push(screen)
    },
  }
  const navigation = bindApplicationNavigation(router, state)
  await settle()
  return { router, state, entered, ...navigation }
}

test('direct public routes, state transitions and browser history stay synchronized', async () => {
  const f = await fixture('/cadastro/cliente')
  try {
    assert.equal(f.state.showCustomerLogin.value, true)
    f.state.showCustomerLogin.value = false
    f.state.viewMode.value = 'assessment'
    await settle()
    assert.equal(f.router.currentRoute.value.path, '/avaliacao')
    await f.router.push('/solicitar-treinamento')
    await settle()
    assert.equal(f.state.viewMode.value, 'contact')
    assert.equal(f.state.showRequestForm.value, true)
    f.state.requestLoginReturn.value = true
    f.router.back()
    await settle()
    assert.equal(f.state.viewMode.value, 'assessment')
    assert.equal(f.state.requestLoginReturn.value, false)
    assert.equal(f.state.showRequestForm.value, false)
    f.router.forward()
    await settle()
    assert.equal(f.state.viewMode.value, 'contact')
    assert.equal(f.router.currentRoute.value.path, '/solicitar-treinamento')
  } finally {
    f.stop()
  }
})

test('private deep links wait for restored identity before loading the destination', async () => {
  const f = await fixture('/meu-cadastro', true)
  try {
    assert.equal(f.navigationPending.value, true)
    assert.equal(f.state.showCustomerLogin.value, false)
    assert.deepEqual(f.entered, [])
    f.state.customerSignedInName.value = 'Ana Silva'
    f.state.sessionRestoring.value = false
    await settle()
    assert.equal(f.router.currentRoute.value.path, '/meu-cadastro')
    assert.equal(f.state.viewMode.value, 'my-profile')
    assert.equal(f.navigationPending.value, false)
    assert.deepEqual(f.entered, ['my-profile'])
  } finally {
    f.stop()
  }
})

test('visitors keep their destination when changing between login and signup', async () => {
  const f = await fixture('/minhas-solicitacoes')
  try {
    assert.equal(f.router.currentRoute.value.path, '/entrar')
    assert.equal(f.router.currentRoute.value.query.redirect, '/minhas-solicitacoes')
    assert.equal(f.state.showCustomerLogin.value, true)
    f.state.showCustomerLogin.value = false
    f.state.showCustomerSignup.value = true
    await settle()
    assert.equal(f.router.currentRoute.value.path, '/cadastro/cliente/dados')
    assert.equal(f.router.currentRoute.value.query.redirect, '/minhas-solicitacoes')
    f.state.customerSignedInName.value = 'Ana Silva'
    await f.router.replace(String(f.router.currentRoute.value.query.redirect))
    await settle()
    assert.equal(f.state.viewMode.value, 'customer-requests')
    assert.equal(f.state.showCustomerSignup.value, false)
  } finally {
    f.stop()
  }
})

test('account roles protect trainer and admin routes', async () => {
  const f = await fixture('/solicitacoes-recebidas')
  try {
    assert.equal(f.state.loginAsTrainer.value, true)
    f.state.customerSignedInName.value = 'Cliente'
    f.state.showCustomerLogin.value = false
    await f.router.push('/admin/academias')
    await settle()
    assert.equal(f.router.currentRoute.value.path, '/')
    f.state.customerIsAdmin.value = true
    await f.router.push('/admin/academias')
    await settle()
    assert.equal(f.state.viewMode.value, 'admin-academies')
    f.state.customerSignedInName.value = ''
    f.state.trainerSignedInId.value = 'personal-1'
    await f.router.push('/solicitacoes-recebidas')
    await settle()
    assert.equal(f.state.viewMode.value, 'trainer-requests')
  } finally {
    f.stop()
  }
})

test('legacy hashes become canonical routes and redirects stay internal', async () => {
  const f = await fixture('/?emailLoginCode=example#cadastro-personal')
  try {
    assert.equal(f.router.currentRoute.value.path, '/cadastro/personal')
    assert.equal(f.router.currentRoute.value.query.emailLoginCode, 'example')
    assert.equal(f.router.currentRoute.value.hash, '')
    assert.equal(f.state.showTrainerSignup.value, true)
    assert.equal(safeReturnPath('//external.test'), '')
    assert.equal(safeReturnPath('https://external.test'), '')
    assert.equal(safeReturnPath('/entrar'), '')
    assert.equal(safeReturnPath('/meu-cadastro'), '/meu-cadastro')
    await f.router.push('/personal/vinicius')
    await settle()
    assert.equal(f.router.currentRoute.value.path, '/personal/vinicius')
    assert.equal(f.state.viewMode.value, 'home')
  } finally {
    f.stop()
  }
})
