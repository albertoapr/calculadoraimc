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
  const customer = (onClose = (_confirmed: boolean) => {}) => {
    const scope = effectScope()
    scopes.push(scope)
    return { value: scope.run(() => useCustomerSignup({ onClose }))!, scope }
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
    await t.test(
      'email contact advances to details and customer confirmation keeps the Beta contract',
      async () => {
        let closed: boolean | undefined
        const { value: c, scope } = customer((confirmed) => {
          closed = confirmed
        })
        c.signupContact.value = ' ANA@EXAMPLE.TEST '
        await c.continueSignupContact()
        assert.equal(c.signupStep.value, 2)
        assert.equal(c.customerForm.email, 'ana@example.test')
        Object.assign(c.customerForm, { name: ' Ana   Silva ', whatsapp: '+5521999999999' })
        reply = { registered: true, verificationCode: 'customer-code' }
        await c.sendCustomerSignup()
        const registration = calls.at(-1)!
        assert.match(registration.url, /\/api\/customers\/register$/)
        assert.equal(registration.init?.method, 'POST')
        assert.deepEqual(JSON.parse(String(registration.init?.body)), {
          name: 'Ana Silva',
          whatsapp: '+5521999999999',
          email: 'ana@example.test',
        })
        assert.equal(
          new URL(c.customerVerificationLink.value).searchParams.get('text'),
          'Confirmar cadastro FitPeso customer-code\nWhatsApp: +5521999999999\nNome: Ana Silva',
        )
        reply = { verified: true, name: ' Ana Silva ' }
        await advance(1000)
        assert.equal(c.customerVerificationComplete.value, true)
        assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), {
          code: 'customer-code',
          whatsapp: '+5521999999999',
        })
        c.closeCustomerSignup()
        assert.equal(closed, true)
        assert.equal(c.customerVerificationComplete.value, false)
        assert.equal(c.customerVerificationLink.value, '')
        assert.equal(timers.size, 0)
        scope.stop()
      },
    )

    await t.test(
      'WhatsApp-only signup clears old details and retries transient verification failures',
      async () => {
        const { value: c, scope } = customer()
        Object.assign(c.customerForm, { name: 'Anterior', email: 'anterior@example.test' })
        c.signupContact.value = '21999999999'
        reply = { registered: true, verificationCode: 'phone-code' }
        await c.continueSignupContact()
        assert.equal(c.signupStep.value, 1)
        assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), {
          name: '',
          whatsapp: '+5521999999999',
          email: '',
        })
        failNetwork = true
        await advance(1000)
        assert.equal(c.customerVerificationComplete.value, false)
        assert.equal(timers.size, 1)
        failNetwork = false
        reply = { verified: true, name: 'Joana Lima' }
        await advance(10000)
        assert.equal(c.customerForm.name, 'Joana Lima')
        assert.match(c.customerStatus.value, /Joana/)
        assert.equal(c.customerVerificationComplete.value, true)
        assert.equal(timers.size, 0)
        scope.stop()
      },
    )

    await t.test('invalid customer details never reach the API', async () => {
      const { value: c, scope } = customer()
      const before = calls.length
      c.signupContact.value = 'inválido'
      await c.continueSignupContact()
      assert.match(c.customerStatus.value, /WhatsApp/)
      c.signupContact.value = 'inválido@'
      await c.continueSignupContact()
      assert.match(c.customerStatus.value, /e-mail/)
      Object.assign(c.customerForm, { name: 'Nome 123', whatsapp: '+5521999999999' })
      await c.sendCustomerSignup()
      assert.match(c.customerStatus.value, /nome válido/)
      c.customerForm.name = 'Nome Válido'
      c.customerForm.email = 'inválido'
      await c.sendCustomerSignup()
      assert.match(c.customerStatus.value, /e-mail/)
      assert.equal(calls.length, before)
      scope.stop()
    })

    await t.test('double registration is blocked and closing discards late results', async () => {
      const { value: c, scope } = customer()
      c.customerForm.whatsapp = '+5521999999999'
      reply = { registered: true, verificationCode: 'late-code' }
      let release!: () => void
      blocked = new Promise<void>((resolve) => {
        release = resolve
      })
      const before = calls.length
      const sending = c.sendCustomerSignup()
      await flush()
      await c.sendCustomerSignup()
      assert.equal(calls.length, before + 1)
      c.closeCustomerSignup()
      assert.equal(calls.at(-1)!.init?.signal?.aborted, true)
      release()
      await sending
      blocked = undefined
      assert.equal(c.customerVerificationLink.value, '')
      assert.equal(c.customerSubmitting.value, false)
      assert.equal(timers.size, 0)
      scope.stop()
    })

    await t.test(
      'manual and automatic verification share one request and disposal prevents late confirmation',
      async () => {
        const { value: c, scope } = customer()
        c.customerForm.whatsapp = '+5521999999999'
        reply = { registered: true, verificationCode: 'poll-code' }
        await c.sendCustomerSignup()
        let release!: () => void
        blocked = new Promise<void>((resolve) => {
          release = resolve
        })
        const before = calls.length
        const checking = c.pollCustomerVerification()
        await flush()
        await c.pollCustomerVerification()
        assert.equal(calls.length, before + 1)
        scope.stop()
        reply = { verified: true, name: 'Resposta tardia' }
        release()
        await checking
        blocked = undefined
        assert.equal(c.customerVerificationComplete.value, false)
        assert.equal(c.customerForm.name, '')
        assert.equal(timers.size, 0)
      },
    )

    await t.test('server expiry and the fifteen-minute timeout stop verification', async () => {
      const { value: c, scope } = customer()
      c.customerForm.whatsapp = '+5521999999999'
      reply = { registered: true, verificationCode: 'expiry-code' }
      await c.sendCustomerSignup()
      reply = { expired: true }
      await advance(1000)
      assert.match(c.customerStatus.value, /expirou/)
      assert.equal(c.customerVerificationLink.value, '')
      reply = { registered: true, verificationCode: 'new-code' }
      await c.sendCustomerSignup()
      reply = { verified: false }
      await advance(900001)
      assert.match(c.customerStatus.value, /prazo de confirmação terminou/)
      assert.equal(timers.size, 0)
      scope.stop()
    })

    await t.test(
      'leaving the signup screen cancels scheduled verification while the application stays mounted',
      async () => {
        const active = ref(true)
        const scope = effectScope()
        scopes.push(scope)
        const c = scope.run(() => useCustomerSignup({ active, onClose() {} }))!
        c.customerForm.whatsapp = '+5521999999999'
        reply = { registered: true, verificationCode: 'navigation-code' }
        await c.sendCustomerSignup()
        assert.equal(timers.size, 1)
        active.value = false
        assert.equal(timers.size, 0)
        const before = calls.length
        await advance(30000)
        assert.equal(calls.length, before)
        assert.equal(c.customerVerificationComplete.value, false)
        scope.stop()
      },
    )

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
          slug: 'jose-silva',
          whatsapp: '+5521999999999',
          cities: ['Mesquita'],
          academias: ['Academia Teste'],
          instagram: '@jose.silva',
        })
        assert.equal(
          new URL(p.trainerVerificationLink.value).searchParams.get('text'),
          'Confirmar personal Fitpeso trainer-code\nWhatsApp: +5521999999999\nNome: José da Silva',
        )
        assert.match(p.trainerStatus.value, /fitpeso.com.br\/personal\/canonical-slug/)
        assert.equal(timers.size, 0)
        scope.stop()
      },
    )

    await t.test(
      'personal validation rejects reserved slugs, invalid contacts, dates and city counts',
      async () => {
        const { value: p, scope } = trainer()
        const before = calls.length
        for (const [field, value, expected] of [
          ['slug', 'develop', /endereço do perfil/],
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
        c.customerForm.whatsapp = '+5521999999999'
        status = 409
        reply = { error: 'WhatsApp já cadastrado' }
        await c.sendCustomerSignup()
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
