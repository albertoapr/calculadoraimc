<script setup lang="ts">
import { ref } from 'vue'
import { suggestCity, type City } from '../services/citiesService'
const emit = defineEmits<{ available: [city: City] }>()
const open = ref(false)
const name = ref('')
const state = ref('')
const busy = ref(false)
const message = ref('')
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
async function send() {
  if (busy.value) return
  if (name.value.trim().length < 2 || !state.value) { message.value = 'Informe o município e a UF.'; return }
  busy.value = true
  message.value = ''
  try {
    const result = await suggestCity(name.value, state.value)
    if (result.status === 'AVAILABLE' && result.city) {
      emit('available', result.city)
      message.value = 'A cidade já está disponível. Confira a lista.'
    } else if (result.status === 'REJECTED' || result.status === 'UNAVAILABLE') {
      message.value = 'Cidade não disponível no momento. Fale com o suporte.'
    } else {
      message.value = 'Solicitação registrada. A cidade aparecerá na lista após aprovação. Use Verificar disponibilidade para consultar novamente. Se atende em outra cidade disponível, pode continuar o cadastro por ela.'
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Não foi possível solicitar a cidade.'
  } finally { busy.value = false }
}
</script>
<template>
  <div class="field-wide city-request">
    <button type="button" class="secondary-button" :aria-expanded="open" @click="open = !open">Minha cidade não está na lista</button>
    <div v-if="open" class="city-request-fields">
      <label class="field"><span class="field-label">Município</span><input v-model="name" maxlength="80" autocomplete="address-level2" @keydown.enter.prevent="send" /></label>
      <label class="field"><span class="field-label">UF</span><select v-model="state"><option value="">Selecione a UF</option><option v-for="uf in states" :key="uf" :value="uf">{{ uf }}</option></select></label>
      <small>A solicitação registra somente o nome da cidade e a UF.</small>
      <button type="button" class="primary-button" :disabled="busy" @click="send">{{ busy ? 'Consultando…' : 'Solicitar inclusão / Verificar disponibilidade' }}</button>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
  </div>
</template>
<style scoped>
.city-request, .city-request-fields { display: grid; gap: 8px; }
.city-request-fields { border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.city-request-fields p { margin: 0; }
</style>
