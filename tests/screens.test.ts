import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
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
  const requestCalls: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requestCalls.push(url)
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
      contents: `import {createApp,nextTick} from 'vue'; import {createPinia} from 'pinia'; import {createRouter,createMemoryHistory} from 'vue-router'; import App from './src/App.vue'; export {nextTick}; export async function mount(path='/'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:App}]}); await router.push(path); const app=createApp(App);app.use(createPinia());app.use(router);app.mount('#app');return app}`,
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
  const { mount, nextTick } = module.exports
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
    const citySelector = document.querySelector('#home-city')
    assert.ok(citySelector)
    assert.equal(citySelector.closest('.fitpeso-home-topbar'), null)
    assert.ok(document.querySelector('.home-header-divider + .home-city-selector'))
    assert.match(
      document.querySelector('.home-training-title')?.textContent ?? '',
      /Treine.*personal/s,
    )
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
    await nextTick()
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    await click(/Buscar Personal/)
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    await click(/Solicitar treinamento com personal/)
    assert.equal(document.querySelectorAll('.fitpeso-home-topbar').length, 1)
    assert.ok(document.querySelector('.request-accordion-form'))
    const age = document.querySelector('#accordion-age') as HTMLInputElement
    age.value = '45'
    age.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await click(/Objetivo/)
    assert.equal(document.querySelector('#accordion-age'), null)
    await click(/Perfil/)
    assert.equal((document.querySelector('#accordion-age') as HTMLInputElement).value, '45')
    ;(document.querySelector('[role="switch"]') as HTMLElement).click()
    await nextTick()
    assert.equal(document.documentElement.dataset.theme, 'light')
    assert.equal(localStorage.getItem('beta-imc-theme'), 'light')
    assert.ok(!requestCalls.some((url) => /verify|start-email|\/api\/requests$/.test(url)))

    app.unmount()
    app = await mount('/profissionais')
    assert.ok(document.querySelector('.public-directory'))
    ;(document.querySelector('[aria-label="Voltar"]') as HTMLElement).click()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    assert.ok(document.querySelector('.root-home-photo'))
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
    await click(/^Início$/)
    await click(/^Sou personal trainer$/)
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
  } finally {
    app.unmount()
    dom.window.close()
  }
})
