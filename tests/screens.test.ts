import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// Mount the actual SFCs with the same compiler as Vite, without an HTTP server.
test('extracted screens preserve login, request age between steps and theme changes', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' })
  for (const name of [
    'history',
    'window',
    'document',
    'localStorage',
    'sessionStorage',
    'navigator',
    'Element',
    'HTMLElement',
    'HTMLDivElement',
    'SVGElement',
    'Node',
    'Event',
    'MouseEvent',
  ]) {
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
  }
  dom.window.scrollTo = () => {}
  localStorage.setItem('fitpeso:preferred-city:v1', 'Mesquita')
  let allowCustomerProfile = false
  const requestCalls: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requestCalls.push(url)
    if (url.endsWith('/api/auth/beta-onboarding-share')) {
      return Response.json({
        shareText: 'Quero me inscrever em fitpeso.com.br como cliente para encontrar um personal trainer e solicitar acompanhamento de treino.\\nHash: ' + 'a'.repeat(64),
      })
    }
    if (url.endsWith('/api/customers/profile') && allowCustomerProfile) {
      return Response.json({
        authenticated: true,
        profile: {
          name: 'Cliente Teste',
          whatsapp: '+5521999999999',
          email: 'cliente@example.test',
        },
      })
    }
    return new Response(
      JSON.stringify(
        url === '/amplify_outputs.json'
          ? { custom: { imcApi: { endpoint: 'http://localhost/mock' } } }
          : url.endsWith('/api/trainers/by-slug/vinicius')
            ? { trainer: { name: 'Vinícius Alves' } }
            : {
                trainers: [
                  {
                    trainerId: 'p1',
                    name: 'Personal Teste',
                    slug: 'teste',
                    academias: ['Academia Teste'],
                  },
                ],
                count: 1,
              },
      ),
      { headers: { 'content-type': 'application/json' } },
    )
  }
  const bundle = await build({
    stdin: {
      contents: `import {createApp,nextTick} from 'vue'; import {createPinia} from 'pinia'; import {createRouter,createMemoryHistory} from 'vue-router'; import {screenRoutes} from './src/router/screens'; import App from './src/App.vue'; import {useAccountSession} from './src/stores/accountSession'; export {nextTick}; export function setProfiles(profiles){useAccountSession().availableProfiles=profiles;} export async function mount(path='/'){const router=createRouter({history:createMemoryHistory(),routes:[...screenRoutes.map(route=>({path:route.path,component:App})),{path:'/personal/:slug',component:App},{path:'/p/:id',component:App}]}); await router.push(path); const app=createApp(App);app.use(createPinia());app.use(router);app.mount('#app');await nextTick();await new Promise(resolve=>setTimeout(resolve,0));await nextTick();return Object.assign(app,{testRouter:router})}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    loader: { '.jpg': 'dataurl', '.svg': 'dataurl' },
    plugins: [
      {
        name: 'vue-sfc',
        setup(builder) {
          builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
            const { descriptor } = parse(await readFile(path, 'utf8'), { filename: path })
            if (!descriptor.script && !descriptor.scriptSetup) {
              const template = compileTemplate({
                source: descriptor.template?.content ?? '',
                filename: path,
                id: path,
              })
              if (template.errors.length) throw new Error(String(template.errors[0]))
              return {
                contents: template.code + '\nexport default { render }',
                loader: 'ts',
              }
            }
            return {
              contents: compileScript(descriptor, { id: path, inlineTemplate: true }).content,
              loader: 'ts',
            }
          })
        },
      },
    ],
  })
  const module = { exports: {} as any }
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
    module,
    module.exports,
    createRequire(import.meta.url),
  )
  const { mount, nextTick, setProfiles } = module.exports
  let app = await mount()
  const click = async (label: RegExp) => {
    const button = [...document.querySelectorAll('button,a')].find((el) =>
      label.test(el.textContent?.trim() || ''),
    ) as HTMLElement
    assert.ok(button, `Missing action ${label}`)
    button.click()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
  try {
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    const shareButton = document.querySelector('[aria-label="Compartilhar FitPeso com um amigo"]')
    assert.ok(shareButton, 'O rodapé deve oferecer compartilhamento da FitPeso')
    const citySelector = document.querySelector('#home-city')
    assert.ok(citySelector)
    assert.ok(citySelector.closest('.fitpeso-home-topbar'))
    assert.match((citySelector as HTMLSelectElement).options[1]?.text ?? '', /, RJ$/)
    assert.equal(document.querySelector('.home-gym-title'), null)
    assert.equal(document.querySelector('.home-academy-title')?.textContent?.trim(), 'Selecione uma academia')
    const changeAcademy = document.querySelector('.home-academy-change-button') as HTMLButtonElement
    assert.ok(changeAcademy)
    assert.match(changeAcademy.getAttribute('aria-label') ?? '', /^Alterar academia/)
    assert.equal(changeAcademy.getAttribute('aria-haspopup'), 'dialog')
    assert.equal(changeAcademy.querySelector('svg path')?.getAttribute('d'), 'm6 9 6 6 6-6')
    assert.match(
      document.querySelector('.home-training-title')?.textContent ?? '',
      /Personal.*Trainer/s,
    )
    assert.equal(document.querySelector('.home-training-title .brand-fit')?.textContent, 'Trainer')
    assert.equal(document.querySelector('.home-training-photo .root-home-tagline-subtitle'), null)
    await click(/^Entrar$/)
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    assert.match(document.querySelector('.fitpeso-home-topbar')?.textContent ?? '', /FitPeso/)
    const identifier = document.querySelector('#login-identifier') as HTMLInputElement
    identifier.value = '21999999999'
    identifier.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    document
      .querySelector('form')!
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    assert.match(document.body.textContent!, /Confirmar pelo WhatsApp/)
    await click(/^Alterar$/)
    assert.equal(
      (document.querySelector('#login-identifier') as HTMLInputElement).value,
      '+5521999999999',
    )
    ;(document.querySelector('[aria-label="Voltar"]') as HTMLElement).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.equal(app.testRouter.currentRoute.value.path, '/')
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    await click(/^Treinar com Personal$/)
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    assert.ok(document.querySelector('.request-accordion-form'))
    await click(/Meu perfil/)
    const age = document.querySelector('#accordion-age') as HTMLInputElement
    age.value = '45'
    age.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await click(/Objetivo/)
    assert.equal(document.querySelector('#accordion-age'), null)
    await click(/Meu perfil/)
    assert.equal((document.querySelector('#accordion-age') as HTMLInputElement).value, '45')
    ;(document.querySelector('[role="switch"]') as HTMLElement).click()
    await nextTick()
    assert.equal(document.documentElement.dataset.theme, 'light')
    assert.equal(localStorage.getItem('beta-imc-theme'), 'light')
    assert.ok(!requestCalls.some((url) => /verify|start-email|\/api\/requests$/.test(url)))

    app.unmount()
    app = await mount('/profissionais')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.ok(document.querySelector('.public-directory'))
    assert.doesNotMatch(document.body.textContent!, /Solicitar Proposta/)

    app.unmount()
    app = await mount('/personal/vinicius')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.ok(requestCalls.some((url) => url.endsWith('/api/trainers/by-slug/vinicius')))
    assert.match(document.body.textContent!, /Vinícius\s*Personal Trainer/)
    ;(document.querySelector('.fitpeso-home-brand') as HTMLElement).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.ok(document.querySelector('.root-home-photo'))
    assert.doesNotMatch(document.body.textContent!, /Vinícius\s*Personal Trainer/)

    await click(/^Cadastre-se$/)
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    const signupContact = document.querySelector('#signup-contact') as HTMLInputElement
    assert.ok(signupContact)
    signupContact.value = 'cliente@example.test'
    signupContact.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    document
      .querySelector('form')!
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    assert.ok(document.querySelector('#customer-name'))
    await click(/^Cadastrar-me como personal$/)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
    const trainerName = document.querySelector('#trainer-name') as HTMLInputElement
    assert.ok(trainerName)
    trainerName.value = 'João da Silva'
    trainerName.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    trainerName.dispatchEvent(new dom.window.Event('blur'))
    await nextTick()
    assert.equal(
      (document.querySelector('#trainer-slug') as HTMLInputElement).value,
      'joao-da-silva',
    )
    await click(/^Início$/)
    assert.ok(document.querySelector('.root-home-photo'))

    app.unmount()
    app = await mount('/solicitar-treinamento')
    assert.equal(app.testRouter.currentRoute.value.path, '/solicitar-treinamento')
    assert.ok(document.querySelector('.request-accordion-form'))
    await click(/Meu perfil/)
    assert.equal((document.querySelector('#accordion-age') as HTMLInputElement).value, '45')

    app.unmount()
    app = await mount('/meu-cadastro')
    assert.equal(app.testRouter.currentRoute.value.path, '/entrar')
    assert.equal(app.testRouter.currentRoute.value.query.redirect, '/meu-cadastro')
    assert.ok(document.querySelector('#login-identifier'))

    app.unmount()
    allowCustomerProfile = true
    sessionStorage.setItem('fitpeso-customer-session', 'profile-fixture')
    app = await mount('/meu-cadastro')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.equal(app.testRouter.currentRoute.value.path, '/meu-cadastro')
    assert.equal(
      (document.querySelector('#profile-name') as HTMLInputElement).value,
      'Cliente Teste',
    )
    const identity = document.querySelector('.signed-in-account-identity')
    assert.ok(identity, 'Signed-in account identity is visible')
    assert.match(identity.querySelector('.account-greeting')?.textContent ?? '', /Olá,\s*Cliente/)
    assert.equal(identity.querySelector('.account-role-badge')?.textContent?.trim(), 'Cliente')
    assert.equal(identity.querySelector('button.account-role-button'), null)

    // Profile label becomes the accessible dialog trigger when more than one role exists.
    setProfiles([
      { usuarioId: 'user-c', tipoUsuarioId: 1, tipo: 'CLIENTE', clienteId: 'customer-1' },
      { usuarioId: 'user-p', tipoUsuarioId: 2, tipo: 'PERSONAL', personalId: 'trainer-1' },
    ])
    await nextTick()
    const roleButton = identity.querySelector('button.account-role-button') as HTMLButtonElement
    assert.ok(roleButton)
    assert.equal(roleButton.getAttribute('aria-haspopup'), 'dialog')
    assert.match(roleButton.getAttribute('aria-label') ?? '', /Alterar perfil/)
    roleButton.click()
    await nextTick()
    assert.equal(document.querySelector('.profile-select-dialog')?.getAttribute('role'), 'dialog')
    assert.match(document.querySelector('.profile-select-dialog')?.textContent ?? '', /Escolha seu perfil/)
  } finally {
    app.unmount()
    dom.window.close()
  }
})
