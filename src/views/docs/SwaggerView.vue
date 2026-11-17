<script setup lang="ts">
import { onMounted, ref } from 'vue'

type SwaggerBundle = {
  (options: Record<string, unknown>): unknown
  presets: { apis: unknown }
}

const swaggerContainer = ref<HTMLElement | null>(null)
const loadError = ref('')

function loadSwaggerBundle(): Promise<SwaggerBundle> {
  const existing = (window as Window & { SwaggerUIBundle?: SwaggerBundle }).SwaggerUIBundle
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js'
    script.onload = () => {
      const bundle = (window as Window & { SwaggerUIBundle?: SwaggerBundle }).SwaggerUIBundle
      if (bundle) resolve(bundle)
      else reject(new Error('O Swagger UI não foi carregado.'))
    }
    script.onerror = () => reject(new Error('Não foi possível carregar a interface Swagger UI.'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  document.title = 'Swagger UI | FitPeso API'

  if (!document.querySelector('link[data-fitpeso-swagger]')) {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css'
    css.setAttribute('data-fitpeso-swagger', '')
    document.head.appendChild(css)
  }

  try {
    const bundle = await loadSwaggerBundle()
    if (!swaggerContainer.value) return
    bundle({
      url: '/openapi.json',
      domNode: swaggerContainer.value,
      deepLinking: true,
      displayRequestDuration: true,
      presets: [bundle.presets.apis],
      layout: 'BaseLayout',
    })
  } catch {
    loadError.value = 'Não foi possível carregar a interface da documentação.'
  }
})
</script>

<template>
  <main class="swagger-page">
    <div v-if="loadError" class="swagger-error">
      <p>{{ loadError }}</p>
      <a href="https://main.d3w24y6suih6n1.amplifyapp.com/swagger/index.html">
        Abrir o Swagger no domínio AWS Amplify
      </a>
    </div>
    <div ref="swaggerContainer" />
  </main>
</template>

<style scoped>
.swagger-page {
  min-height: 100vh;
  background: #fafafa;
  color: #3b4151;
}
.swagger-page :deep(.topbar) { display: none; }
.swagger-error { padding: 2rem; text-align: center; }
.swagger-error a { color: #16794b; }
</style>
