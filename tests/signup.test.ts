import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useCustomerSignup } from '../src/composables/useCustomerSignup'
import { useTrainerSignup } from '../src/composables/useTrainerSignup'

test('signup modules preserve registration contracts, validation and confirmation lifecycle', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const timers = new Map<number, { fn: () => void; at: number }>()
  let timerId = 0
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: { hostname: 'fitpeso.com.br', search: '', href: 'https://fitpeso.com.br/' },
      setTimeout(fn: () => void, ms: number) {
        timers.set(++timerId, { fn, at: now + ms })
        return timerId
      },
      clearTimeout(id: number) {
        timers.delete(id)
      },
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      getElementById() {
        return null
      },
    },
  })
  const calls: { url: string; init?: RequestInit }[] = []
  let reply: unknown = {}
  let status = 200
  let blocked: Promise<void> | undefined
  let failNetwork = false
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.test' } } })
    calls.push({ url: String(url), init })
    if (blocked) await blocked
    if (failNetwork) throw new Error('Offline')
    // Ignore abort in the mock to check that late responses cannot update a closed screen.
    return Response.json(reply, { status })
  }
  const scopes: ReturnType<typeof effectScope>[] = []
  const customer = (
    onClose = (_confirmed: boolean) => {},
    onAuthenticated?: Parameters<typeof useCustomerSignup>[0]['onAuthenticated'],
  ) => {
    const scope = effectScope()
    scopes.push(scope)
    return { value: scope.run(() => useCustomerSignup({ onClose, onAuthenticated }))!, scope }
  }
  const trainer = () => {
    const scope = effectScope()
    scopes.push(scope)
    return { value: scope.run(() => useTrainerSignup({ onClose() {} }))!, scope }
  }
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  function validTrainer() {
    return {
      name: '  José   da Silva ',
      sex: 'masculino' as const,
      slug: 'jose-silva',
      phone: '(21) 99999-9999',
      email: '',
      dateOfBirth: '',
      cities: ['Mesquita'],
      academias: ['Academia Teste'],
      instagram: 'https://www.instagram.com/jose.silva/',
      cref: '',
    }
  }
  try {
    await t.test('customer signup verifies WhatsApp before showing editable details', async () => {
      let loggedIn = false
      const { value: c, scope } = customer(() => {}, () => { loggedIn = true })
      c.signupContact.value = 'ana@example.test'
      await c.continueSignupContact()
      assert.equal(c.signupStep.value, 1)
      c.signupContact.value = '(21) 99999-9999'
      status = 201
      reply = { started: true, verificationCode: 'A'.repeat(22), expiresAt: Math.floor(now / 1000) + 900 }
      await c.continueSignupContact()
      assert.equal(c.signupStep.value, 1)
      const before = calls.length
      await c.sendCustomerSignup()
      assert.equal(calls.length, before)
      status = 200
      reply = { verified: false }
      await c.pollCustomerVerification()
      assert.equal(c.signupStep.value, 1)
      reply = { verified: true, whatsapp: '+5521999999999', name: 'Ana Silva' }
      await c.pollCustomerVerification()
      assert.equal(c.signupStep.value, 2)
      assert.equal(c.customerForm.name, 'Ana Silva')
      c.customerForm.name = 'Ana Maria Silva'
      c.customerForm.sex = 'feminino'
      reply = { registered: true, authenticated: true, whatsapp: '+5521999999999' }
      await c.sendCustomerSignup()
      assert.equal(loggedIn, true)
      assert.equal(JSON.parse(String(calls.at(-1)!.init?.body)).name, 'Ana Maria Silva')
      scope.stop()
    })
    await t.test('expired customer confirmation does not unlock the form', async () => {
      const { value: c, scope } = customer()
      c.signupContact.value = '(21) 99999-9999'
      status = 201
      reply = { started: true, verificationCode: 'A'.repeat(22), expiresAt: Math.floor(now / 1000) + 900 }
      await c.continueSignupContact()
      status = 200
      reply = { verified: false, expired: true }
      await c.pollCustomerVerification()
      assert.equal(c.customerPhoneVerified.value, false)
      assert.equal(c.signupStep.value, 1)
      scope.stop()
    })

    async function confirmTrainer(p: ReturnType<typeof useTrainerSignup>, displayName = 'José da Silva') {
      p.trainerForm.phone = '(21) 99999-9999'
      status = 201
      reply = { started: true, verificationCode: 'A'.repeat(22), expiresAt: Math.floor(now / 1000) + 900 }
      await p.continueTrainerPhone()
      const body = JSON.parse(String(calls.at(-1)!.init?.body))
      assert.equal(body.role, 'trainer')
      assert.match(calls.at(-1)!.url, /\/api\/signup\/start-phone$/)
      assert.equal(new URL(p.trainerVerificationLink.value).searchParams.get('text'), '/personal ' + 'A'.repeat(22))
      assert.ok(!p.trainerVerificationLink.value.includes(body.sessionToken))
      status = 200
      reply = { verified: false }
      await p.pollTrainerVerification()
      assert.equal(p.betaTrainerSignupToken.value, '')
      reply = { verified: true, whatsapp: '+5521999999999', name: displayName }
      await p.pollTrainerVerification()
      assert.equal(p.betaTrainerSignupToken.value, body.sessionToken)
      assert.equal(p.trainerVerificationLink.value, '')
      assert.equal(p.trainerForm.name, displayName)
      return body.sessionToken
    }

    await t.test('personal cannot submit before phone verification; completes without another code', async () => {
      const scope = effectScope()
      scopes.push(scope)
      let loggedIn = ''
      const p = scope.run(() => useTrainerSignup({ onClose() {}, onAuthenticated: token => { loggedIn = token } }))!
      Object.assign(p.trainerForm, validTrainer())
      const before = calls.length
      await p.sendTrainerSignup()
      assert.equal(calls.length, before)
      assert.match(p.trainerStatus.value, /Confirme seu WhatsApp/)
      const proof = await confirmTrainer(p)
      p.trainerForm.name = 'José Maria Silva'
      p.referralCode.value = 'FP' + 'A'.repeat(32)
      status = 201
      reply = { registered: true, sessionToken: 'B'.repeat(43), slug: 'jose-maria-silva' }
      await p.sendTrainerSignup()
      assert.match(calls.at(-1)!.url, /\/api\/auth\/beta-trainer-signup\/complete$/)
      const body = JSON.parse(String(calls.at(-1)!.init?.body))
      assert.equal(body.onboardingSessionToken, proof)
      assert.equal(body.name, 'José Maria Silva')
      assert.equal(body.referralCode, p.referralCode.value)
      assert.equal(body.slug, undefined)
      assert.deepEqual(body.cities, ['Mesquita'])
      assert.deepEqual(body.academias, ['Academia Teste'])
      assert.equal(loggedIn, 'B'.repeat(43))
      assert.equal(p.trainerVerificationLink.value, '')
      scope.stop()
    })

    await t.test('personal may finish with city only and optional data empty', async () => {
      const { value: p, scope } = trainer()
      Object.assign(p.trainerForm, validTrainer(), { sex: '', instagram: '', academias: [] })
      await confirmTrainer(p)
      status = 201
      reply = { registered: true, sessionToken: 'B'.repeat(43) }
      await p.sendTrainerSignup()
      const payload = JSON.parse(String(calls.at(-1)!.init?.body))
      assert.equal(payload.sex, '')
      assert.equal(payload.instagram, '')
      assert.deepEqual(payload.academias, [])
      assert.deepEqual(payload.cities, ['Mesquita'])
      scope.stop()
    })

    await t.test('personal validates details after phone verification and invalidates proof on phone change', async () => {
      const { value: p, scope } = trainer()
      Object.assign(p.trainerForm, validTrainer())
      await confirmTrainer(p)
      const before = calls.length
      for (const [field, value, expected] of [
        ['dateOfBirth', '2020-02-30', /nascimento/],
        ['cities', [], /cidades/],
        ['cities', ['A', 'B', 'C'], /cidades/],
        ['instagram', 'https://evil.test/jose', /Instagram/],
        ['email', 'inválido', /e-mail/],
      ] as const) {
        Object.assign(p.trainerForm, validTrainer(), { [field]: value })
        await p.sendTrainerSignup()
        assert.match(p.trainerStatus.value, expected)
      }
      assert.equal(calls.length, before)
      p.changeTrainerPhone()
      assert.equal(p.betaTrainerSignupToken.value, '')
      scope.stop()
    })

    await t.test('existing professional account and expired proof do not unlock form', async () => {
      const { value: p, scope } = trainer()
      p.trainerForm.phone = '(21) 99999-9999'
      status = 409
      reply = { error: 'WhatsApp já cadastrado' }
      await p.continueTrainerPhone()
      assert.equal(p.trainerStatus.value, 'WhatsApp já cadastrado')
      assert.equal(p.trainerVerificationLink.value, '')
      status = 201
      reply = { started: true, verificationCode: 'A'.repeat(22), expiresAt: Math.floor(now / 1000) + 900 }
      await p.continueTrainerPhone()
      status = 200
      reply = { expired: true, verified: false }
      await p.pollTrainerVerification()
      assert.equal(p.betaTrainerSignupToken.value, '')
      assert.equal(p.trainerVerificationLink.value, '')
      scope.stop()
    })

    await t.test('linked Google account keeps credential when professional phone is verified', async () => {
      const scope = effectScope()
      scopes.push(scope)
      const active = ref(true)
      const p = scope.run(() => useTrainerSignup({
        onClose() {}, active,
        linkedAccount: () => ({
          name: 'Ana Cliente', email: 'ana@example.test', sex: 'feminino',
          dateOfBirth: '1986-01-20', whatsapp: '', googleCredential: 'signed-google-id-token',
        }),
      }))!
      await confirmTrainer(p, 'Ana Cliente')
      p.trainerForm.cities = ['Mesquita']
      status = 201
      reply = { registered: true, sessionToken: 'B'.repeat(43) }
      await p.sendTrainerSignup()
      const body = JSON.parse(String(calls.at(-1)!.init?.body))
      assert.equal(body.googleCredential, 'signed-google-id-token')
      assert.equal(body.email, 'ana@example.test')
      scope.stop()
    })

    await t.test('duplicate start clicks and unmount discard late confirmation', async () => {
      const { value: p, scope } = trainer()
      p.trainerForm.phone = '(21) 99999-9999'
      status = 201
      reply = { started: true, verificationCode: 'A'.repeat(22), expiresAt: Math.floor(now / 1000) + 900 }
      let release!: () => void
      blocked = new Promise<void>(resolve => { release = resolve })
      const before = calls.length
      const saving = p.continueTrainerPhone()
      await flush()
      await p.continueTrainerPhone()
      assert.equal(calls.length, before + 1)
      scope.stop()
      release()
      await saving
      blocked = undefined
      assert.equal(p.trainerVerificationLink.value, '')
      assert.equal(p.trainerSubmitting.value, false)
    })
  } finally {
    for (const scope of scopes) scope.stop()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
