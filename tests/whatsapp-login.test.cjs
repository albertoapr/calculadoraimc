const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Execute the real waiting controller with a controlled clock, storage and network.
function harness() {
  let now = 1_000_000,
    nextId = 0,
    active = 0,
    maxActive = 0,
    calls = 0
  const timers = new Map(),
    storage = new Map(),
    listeners = new Map()
  let reply = { authenticated: false },
    networkFailure = false,
    deferred
  const ref = (value) => ({ value })
  const state = Object.fromEntries(
    [
      'trainerLoginCode',
      'trainerLoginToken',
      'trainerLoginLink',
      'trainerLoginError',
      'customerLoginCode',
      'customerLoginSessionToken',
      'customerLoginVerificationLink',
      'customerLoginError',
      'customerLoginStatus',
      'loginIdentifier',
      'customerLoginWhatsApp',
      'loginIdentifierKind',
      'customerLoginMethod',
      'trainerLoginDialog',
      'showCustomerLoginDialog',
      'showCustomerLogin',
      'showCustomerSignup',
      'showTrainerSignup',
      'loginAsTrainer',
      'loginStep',
    ].map((k) => [k, ref('')]),
  )
  let applied = false
  const requests = []
  const replacedUrls = []
  const context = {
    ...state,
    ref,
    computed: (fn) => ({
      get value() {
        return fn()
      },
    }),
    Date: { now: () => now },
    Number,
    JSON,
    Math,
    AbortController,
    URL,
    crypto: require('node:crypto').webcrypto,
    btoa,
    sessionStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    document: { hidden: false, removeEventListener() {} },
    window: {
      setTimeout: (fn, ms) => {
        timers.set(++nextId, { fn, at: now + ms })
        return nextId
      },
      setInterval: (fn, ms) => {
        timers.set(++nextId, { fn, at: now + ms, interval: ms })
        return nextId
      },
      clearTimeout: (id) => timers.delete(id),
      clearInterval: (id) => timers.delete(id),
      removeEventListener() {},
    },
    onUnmounted: (fn) => listeners.set('unmount', fn),
    getRequestApiEndpoint: async () => 'https://example.test',
    fetch: async (_, options) => {
      requests.push({ url: _, options })
      calls++
      active++
      maxActive = Math.max(maxActive, active)
      try {
        if (deferred) await deferred
        if (options.signal?.aborted) throw Error('Aborted')
        if (networkFailure) throw Error('Offline')
        return { ok: true, json: async () => reply }
      } finally {
        active--
      }
    },
    loadTrainerSession: async () => ({ name: 'Personal' }),
    loadCustomerProfile: async () => ({ name: 'Cliente' }),
    applyTrainerSession: () => {
      applied = true
    },
    applyCustomerProfile: () => {
      applied = true
    },
    goHome() {},
    returnToRequestFormAfterLogin: async () => {},
    returnToLoginIdentifier() {
      context.api.clearPendingWhatsAppLogin()
    },
  }
  function loadModule(file, dependencies) {
    const sandbox = {
      ...context,
      exports: {},
      require: (name) => {
        if (!(name in dependencies)) throw new Error('Unexpected import: ' + name)
        return dependencies[name]
      },
    }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    vm.createContext(sandbox)
    vm.runInContext(code, sandbox)
    return sandbox.exports
  }
  const service = loadModule('src/services/authenticationService.ts', {
    './api': { getRequestApiEndpoint: context.getRequestApiEndpoint },
  })
  const validation = loadModule('src/utils/validation.ts', {})
  const { useAuthentication } = loadModule('src/composables/useAuthentication.ts', {
    vue: {
      ref,
      computed: context.computed,
      nextTick: async (fn) => fn?.(),
      onUnmounted: context.onUnmounted,
    },
    '../services/authenticationService': {
      ...service,
      loadCustomerProfile: context.loadCustomerProfile,
      loadTrainerSession: context.loadTrainerSession,
    },
    '../utils/validation': validation,
  })
  const api = useAuthentication({
    initialRole: '',
    showCustomerSignup: state.showCustomerSignup,
    showTrainerSignup: state.showTrainerSignup,
    saveRole() {},
    applyCustomerProfile: context.applyCustomerProfile,
    applyTrainerSession: context.applyTrainerSession,
    renderGoogleButton: async () => {},
    goHome: context.goHome,
    returnToRequestFormAfterLogin: context.returnToRequestFormAfterLogin,
    replaceUrl(url) {
      replacedUrls.push(url)
    },
  })
  context.api = api
  Object.assign(state, api)
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  return {
    api,
    storage,
    state,
    context,
    requests,
    replacedUrls,
    unmount: () => listeners.get('unmount')(),
    flush,
    get applied() {
      return applied
    },
    get calls() {
      return calls
    },
    get maxActive() {
      return maxActive
    },
    set reply(v) {
      reply = v
    },
    set networkFailure(v) {
      networkFailure = v
    },
    set deferred(v) {
      deferred = v
    },
    async advance(ms) {
      now += ms
      for (const [id, t] of [...timers])
        if (t.at <= now) {
          if (t.interval) t.at = now + t.interval
          else timers.delete(id)
          t.fn()
        }
      await flush()
    },
  }
}
const key = 'fitpeso-pending-whatsapp-login'
function begin(h, role = 'customer') {
  h.api.saveNewWhatsAppAttempt(role, '+5521999999999', 'A'.repeat(22), 'B'.repeat(43))
}

for (const role of ['customer', 'trainer'])
  test(`${role}: return starts 15-second timer; reload preserves it; 100% does not authenticate`, async () => {
    const h = harness()
    begin(h, role)
    h.api.markWhatsAppOpened()
    assert.equal(h.api.whatsappProgressStartedAt.value, 0)
    h.api.onWhatsAppBlur()
    h.api.onWhatsAppReturn()
    await h.flush()
    const started = h.api.whatsappProgressStartedAt.value
    assert.ok(started)
    await h.advance(5000)
    assert.equal(h.api.whatsappProgress.value, 33)
    assert.equal(h.api.whatsappSecondsRemaining.value, 10)
    h.api.restoreWhatsAppAttempt()
    await h.flush()
    assert.equal(h.api.whatsappProgressStartedAt.value, started)
    await h.advance(10000)
    assert.equal(h.api.whatsappProgress.value, 100)
    assert.equal(h.applied, false)
    h.reply = { authenticated: true }
    await h.api.checkPendingWhatsAppLogin()
    assert.equal(h.applied, true)
    assert.equal(h.storage.has(key), false)
    assert.ok(h.storage.has(`fitpeso-${role}-session`))
  })
test('focus and visibility share one in-flight query; cancellation discards late success', async () => {
  const h = harness()
  begin(h)
  let release
  h.deferred = new Promise((r) => (release = r))
  h.api.onWhatsAppReturn()
  h.api.onWhatsAppReturn()
  h.api.onWhatsAppVisibilityChange()
  await h.flush()
  assert.equal(h.calls, 1)
  assert.equal(h.maxActive, 1)
  h.api.clearPendingWhatsAppLogin()
  h.reply = { authenticated: true }
  release()
  await h.flush()
  assert.equal(h.applied, false)
  assert.equal(h.storage.has(key), false)
})
test('hidden page pauses queries; return checks immediately and network errors recover', async () => {
  const h = harness()
  begin(h)
  h.context.document.hidden = true
  await h.api.checkPendingWhatsAppLogin()
  assert.equal(h.calls, 0)
  h.context.document.hidden = false
  h.networkFailure = true
  h.api.onWhatsAppReturn()
  await h.flush()
  assert.equal(h.api.whatsappNetworkError.value, true)
  h.networkFailure = false
  h.reply = { authenticated: true }
  await h.advance(3000)
  assert.equal(h.applied, true)
})
test('expiration removes pending credentials and prevents authentication', async () => {
  const h = harness()
  begin(h)
  await h.advance(900001)
  assert.equal(h.storage.has(key), false)
  assert.match(h.state.customerLoginError.value, /expirou/)
  h.api.restoreWhatsAppAttempt()
  await h.api.checkPendingWhatsAppLogin()
  assert.equal(h.calls, 0)
})
test('a new WhatsApp visit starts a new window, duplicate return events do not', async () => {
  const h = harness()
  begin(h)
  h.api.markWhatsAppOpened()
  h.api.onWhatsAppBlur()
  h.api.onWhatsAppReturn()
  await h.flush()
  await h.advance(5000)
  h.api.onWhatsAppReturn()
  assert.equal(h.api.whatsappProgress.value, 33)
  h.api.markWhatsAppOpened()
  h.api.onWhatsAppBlur()
  h.api.onWhatsAppReturn()
  assert.equal(h.api.whatsappProgress.value, 0)
})

for (const role of ['customer', 'trainer'])
  test(`${role}: email confirmation restores the correct profile and session`, async () => {
    const h = harness()
    h.state.showCustomerLogin.value = true
    h.state.loginAsTrainer.value = role === 'trainer'
    h.state.loginIdentifier.value = 'cliente@example.test'
    h.reply = { started: true }
    await h.api.startEmailLogin()
    assert.match(h.requests[0].url, /\/api\/customers\/start-email-login$/)
    assert.equal(JSON.parse(h.requests[0].options.body).asTrainer, role === 'trainer')
    assert.equal(h.state.emailLoginPending.value, true)
    assert.equal(h.state.emailLoginSubmitting.value, false)
    const token = h.state.emailLoginSessionToken.value
    assert.equal(token.length, 43)
    h.reply = { authenticated: true }
    await h.api.pollEmailLogin()
    assert.equal(JSON.parse(h.requests[1].options.body).role, role)
    assert.equal(h.applied, true)
    assert.equal(h.storage.get(`fitpeso-${role}-session`), token)
    assert.equal(h.state.emailLoginPending.value, false)
    assert.equal(h.state.showCustomerLogin.value, false)
    h.unmount()
  })

test('email waiting expires and module disposal cancels remaining timers and late WhatsApp success', async () => {
  const h = harness()
  h.state.showCustomerLogin.value = true
  h.reply = { started: true }
  await h.api.startEmailLogin()
  h.reply = { authenticated: false }
  await h.advance(900001)
  assert.equal(h.state.emailLoginPending.value, false)
  assert.match(h.state.emailLoginError.value, /expirou/)

  begin(h)
  let release
  h.deferred = new Promise((resolve) => {
    release = resolve
  })
  h.api.onWhatsAppReturn()
  await h.flush()
  h.unmount()
  h.reply = { authenticated: true }
  release()
  await h.flush()
  const calls = h.calls
  await h.advance(30000)
  assert.equal(h.applied, false)
  assert.equal(h.calls, calls)
})

test('email callback removes the one-time code before verifying and restores the returned role', async () => {
  const h = harness()
  h.context.window.location = {
    href: 'https://fitpeso.test/?emailLoginCode=one%2Ftime&keep=1#section',
  }
  h.reply = { authenticated: true, sessionToken: 'verified-session', role: 'trainer' }
  await h.api.finishEmailLoginFromLink()
  assert.equal(h.replacedUrls[0], '/?keep=1#section')
  assert.match(h.requests[0].url, /verify-email-login\?code=one%2Ftime$/)
  assert.equal(h.requests[0].options.method, 'POST')
  assert.equal(h.requests[0].options.cache, 'no-store')
  assert.equal(h.storage.get('fitpeso-trainer-session'), 'verified-session')
  assert.equal(h.applied, true)
})
