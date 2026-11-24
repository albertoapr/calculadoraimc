<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { requestApi, apiError } from '../../services/http/apiClient'

const props = defineProps<{ whatsapp: string; verified: boolean }>()
const emit = defineEmits<{ verified: [] }>()
const number = ref(props.whatsapp)
const busy = ref(false)
const message = ref('')
const link = ref('')
const code = ref('')
const expiresAt = ref(0)
const storageKey = 'fitpeso-google-phone-challenge'
let timer: number | undefined

watch(() => props.whatsapp, value => { if (!code.value) number.value = value })

async function check() {
  if (!code.value || busy.value || Date.now() / 1000 >= expiresAt.value) {
    if (code.value && Date.now() / 1000 >= expiresAt.value) {
      code.value = ''
      link.value = ''
      sessionStorage.removeItem(storageKey)
      message.value = 'A verificação expirou. Solicite um novo código.'
    }
    return
  }
  const token = sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) return
  try {
    const response = await requestApi<{ verified?: boolean; expired?: boolean; error?: string }>(
      '/api/customers/phone-verification-status',
      { method: 'POST', token, body: { code: code.value } },
    )
    if (response.body.verified) {
      code.value = ''
      link.value = ''
      sessionStorage.removeItem(storageKey)
      message.value = 'WhatsApp confirmado com sucesso.'
      emit('verified')
    } else if (response.body.expired) {
      code.value = ''
      link.value = ''
      sessionStorage.removeItem(storageKey)
      message.value = 'A verificação expirou. Solicite um novo código.'
    }
  } catch { /* A verificação pode ser consultada novamente após voltar do WhatsApp. */ }
}

async function startVerification() {
  if (busy.value || props.verified) return
  const token = sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) {
    message.value = 'Entre novamente com o Google para confirmar seu WhatsApp.'
    return
  }
  busy.value = true
  message.value = ''
  try {
    const response = await requestApi<{
      started?: boolean; code?: string; expiresAt?: number; verificationUrl?: string; error?: string
    }>('/api/customers/start-phone-verification', {
      method: 'POST', token, body: { whatsapp: number.value },
    })
    if (!response.ok || !response.body.started || !response.body.code ||
        !response.body.expiresAt || !response.body.verificationUrl)
      throw apiError(response, 'Não foi possível iniciar a confirmação.')
    code.value = response.body.code
    expiresAt.value = response.body.expiresAt
    link.value = response.body.verificationUrl
    sessionStorage.setItem(storageKey, JSON.stringify({
      code: code.value, expiresAt: expiresAt.value,
      link: link.value, whatsapp: number.value,
    }))
    message.value = 'Envie a mensagem para a Beta usando o botão abaixo. A confirmação será automática.'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Não foi possível iniciar a confirmação.'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  try {
    const pending = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as {
      code?: string; expiresAt?: number; link?: string; whatsapp?: string
    } | null
    if (pending?.code && pending.expiresAt && pending.expiresAt * 1000 > Date.now() &&
        pending.link?.startsWith('https://wa.me/')) {
      code.value = pending.code
      expiresAt.value = pending.expiresAt
      link.value = pending.link
      number.value = pending.whatsapp ?? props.whatsapp
      message.value = 'Aguardando confirmação pela Beta.'
    }
  } catch { /* Sessão temporária indisponível. */ }
  timer = window.setInterval(() => { if (!document.hidden) void check() }, 2000)
  void check()
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <div class="field field-wide">
    <label class="field-label" for="profile-whatsapp">{{ verified ? 'WhatsApp confirmado' : 'WhatsApp' }}</label>
    <input id="profile-whatsapp" v-model="number" type="tel" inputmode="tel"
      autocomplete="tel" :readonly="verified || !!code" :aria-readonly="verified || !!code" />
    <small v-if="verified">✓ Número confirmado pela Beta.</small>
    <template v-else>
      <button v-if="!code" type="button" class="secondary-button" :disabled="busy"
        @click="startVerification">{{ busy ? 'Preparando verificação…' : 'Verificar WhatsApp' }}</button>
      <a v-if="link" class="secondary-button" :href="link" target="_blank" rel="noopener noreferrer"
        @click="message = 'Aguardando a mensagem enviada à Beta…'">Enviar confirmação pelo WhatsApp</a>
      <button v-if="code" type="button" class="secondary-button" @click="check">Consultar confirmação</button>
      <small v-if="message" role="status" aria-live="polite">{{ message }}</small>
    </template>
  </div>
</template>
