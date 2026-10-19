import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

function readImcApiUrl() {
  try {
    const outputs = JSON.parse(readFileSync(new URL('./amplify_outputs.json', import.meta.url), 'utf8'))
    return outputs.custom?.imcApi?.endpoint ?? ''
  } catch {
    return process.env.VITE_IMC_API_URL ?? ''
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __IMC_API_URL__: JSON.stringify(readImcApiUrl()),
  },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
