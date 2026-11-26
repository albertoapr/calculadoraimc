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
  async function advance(ms: number) {
    now += ms
    for (const [id, timer] of [...timers])
      if (timer.at <= now) {
        timers.delete(id)
        timer.fn()
      }
    await flush()
  }
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

    await t.test(
      'personal cities, slug and normalized payload keep the current API fields',
      async () => {
        const { value: p, scope } = trainer()
        p.trainerForm.name = 'José da Silva'
        p.suggestTrainerSlug()
        assert.equal(p.trainerForm.slug, 'jose-da-silva')
        p.toggleTrainerCity('Mesquita')
        p.toggleTrainerCity('Nilópolis')
        p.toggleTrainerCity('Rio de Janeiro')
        assert.deepEqual(p.trainerForm.cities, ['Mesquita', 'Nilópolis'])
        p.toggleTrainerCity('Nilópolis')
        Object.assign(p.trainerForm, validTrainer())
        p.suggestTrainerSlug()
        assert.equal(p.trainerForm.slug, 'jose-silva')
        reply = { registered: true, verificationCode: 'trainer-code', slug: 'canonical-slug' }
        await p.sendTrainerSignup()
        assert.match(calls.at(-1)!.url, /\/api\/trainers\/register$/)
        assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), {
          name: 'José da Silva',
          sex: 'masculino',
          whatsapp: '+5521999999999',
          cities: ['Mesquita'],
          academias: ['Academia Teste'],
          instagram: '@jose.silva',
        })
        assert.equal(
          new URL(p.trainerVerificationLink.value).searchParams.get('text'),
          '/personal trainer-code',
        )
        assert.match(p.trainerStatus.value, /fitpeso.com.br\/personal\/canonical-slug/)
        assert.equal(timers.size, 0)
        scope.stop()
      },
    )

    await t.test('personal signup checks confirmation using a separate browser token', async () => {
      const scope = effectScope()
      scopes.push(scope)
      let authenticated = ''
      const p = scope.run(() => useTrainerSignup({ onClose() {}, onAuthenticated: token => { authenticated = token } }))!
      Object.assign(p.trainerForm, validTrainer())
      const code = 'A'.repeat(22), token = 'B'.repeat(43)
      status = 201
      reply = { registered: true, verificationCode: code, browserToken: token, expiresAt: Math.floor(now / 1000) + 900, slug: 'jose-silva' }
      await p.sendTrainerSignup()
      assert.equal(p.trainerVerificationPending.value, true)
      assert.ok(!p.trainerVerificationLink.value.includes(token))
      status = 200
      reply = { authenticated: false }
      await p.pollTrainerVerification()
      assert.equal(authenticated, '')
      assert.match(calls.at(-1)!.url, /\/api\/trainers\/verification-status$/)
      assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), { code, browserToken: token })
      reply = { authenticated: true }
      await p.pollTrainerVerification()
      assert.equal(authenticated, token)
      assert.equal(p.trainerVerificationPending.value, false)
      assert.equal(p.trainerVerificationLink.value, '')
      scope.stop()
    })

    await t.test('personal can register with city and no academy, sex or Instagram', async () => {
      const { value: p, scope } = trainer()
      Object.assign(p.trainerForm, validTrainer(), { sex: '', instagram: '', academias: [] })
      reply = { registered: true, verificationCode: 'minimal-trainer', slug: 'jose-silva' }
      await p.sendTrainerSignup()
      assert.match(calls.at(-1)!.url, /\/api\/trainers\/register$/)
      const payload = JSON.parse(String(calls.at(-1)!.init?.body))
      assert.equal(payload.slug, undefined)
      assert.equal(payload.sex, '')
      assert.equal(payload.instagram, '')
      assert.deepEqual(payload.academias, [])
      assert.deepEqual(payload.cities, ['Mesquita'])
      assert.match(p.trainerVerificationLink.value, /wa.me/)
      scope.stop()
    })

    await t.test(
      'personal validation rejects reserved slugs, invalid contacts, dates and city counts',
      async () => {
        const { value: p, scope } = trainer()
        const before = calls.length
        for (const [field, value, expected] of [
          ['phone', '123', /WhatsApp/],
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
        scope.stop()
      },
    )

    await t.test(
      'backend rejections and missing confirmation codes are shown without success links',
      async () => {
        const { value: c, scope: cs } = customer()
        c.customerForm.name = 'Cliente Teste'
        c.customerForm.whatsapp = '+5521999999999'
        status = 409
        reply = { error: 'WhatsApp já cadastrado' }
        c.signupContact.value = '+5521999999999'
        await c.continueSignupContact()
        assert.equal(c.customerStatus.value, 'WhatsApp já cadastrado')
        assert.equal(c.customerVerificationLink.value, '')
        const { value: p, scope: ps } = trainer()
        Object.assign(p.trainerForm, validTrainer())
        await p.sendTrainerSignup()
        assert.equal(p.trainerStatus.value, 'WhatsApp já cadastrado')
        status = 200
        reply = { registered: true }
        await p.sendTrainerSignup()
        assert.match(p.trainerStatus.value, /gerar o código/)
        assert.equal(p.trainerVerificationLink.value, '')
        cs.stop()
        ps.stop()
      },
    )

    await t.test('perfil profissional reutiliza conta Google sem duplicar dados pessoais', async () => {
      const scope = effectScope()
      scopes.push(scope)
      const active = ref(true)
      const p = scope.run(() => useTrainerSignup({
        onClose() {},
        active,
        linkedAccount: () => ({
          name: 'Ana Cliente', email: 'ana@example.test',
          sex: 'feminino', dateOfBirth: '1986-01-20',
          whatsapp: '', googleCredential: 'signed-google-id-token',
        }),
      }))!
      assert.equal(p.linkedAccount.value?.name, 'Ana Cliente')
      assert.equal(p.trainerForm.name, 'Ana Cliente')
      assert.equal(p.trainerForm.email, 'ana@example.test')
      assert.equal(p.trainerForm.sex, 'feminino')
      assert.equal(p.trainerForm.dateOfBirth, '1986-01-20')
      assert.equal(p.trainerForm.phone, '')
      assert.equal(p.trainerForm.slug, 'ana-cliente')
      p.trainerForm.phone = '(21) 99999-9999'
      p.trainerForm.cities = ['Mesquita']
      p.trainerForm.instagram = '@ana.cliente'
      status = 201
      reply = { registered: true, verificationCode: 'verified-code', slug: 'ana-cliente' }
      const before = calls.length
      await p.sendTrainerSignup()
      assert.equal(calls.length, before + 1)
      const body = JSON.parse(String(calls.at(-1)?.init?.body ?? '{}'))
      assert.equal(body.name, 'Ana Cliente')
      assert.equal(body.email, 'ana@example.test')
      assert.equal(body.googleCredential, 'signed-google-id-token')
      scope.stop()
    })

    await t.test(
      'personal duplicate clicks and unmount do not create a late confirmation link',
      async () => {
        const { value: p, scope } = trainer()
        Object.assign(p.trainerForm, validTrainer())
        reply = { registered: true, verificationCode: 'late-trainer' }
        let release!: () => void
        blocked = new Promise<void>((resolve) => {
          release = resolve
        })
        const before = calls.length
        const saving = p.sendTrainerSignup()
        await flush()
        await p.sendTrainerSignup()
        assert.equal(calls.length, before + 1)
        scope.stop()
        release()
        await saving
        blocked = undefined
        assert.equal(p.trainerVerificationLink.value, '')
        assert.equal(p.trainerSubmitting.value, false)
      },
    )
  } finally {
    for (const scope of scopes) scope.stop()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
