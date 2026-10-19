<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

declare const __IMC_API_URL__: string

type ImcPayload = {
  clientName: string
  whatsapp: string
  age: number
  sex: 'feminino' | 'masculino' | 'outro'
  weight: number
  heightCm: number
  imc: number
  consent: true
  requestId: string
}

const apiUrl = __IMC_API_URL__

const form = reactive({
  name: '',
  whatsapp: '',
  sex: '',
  age: '',
  weight: '',
  height: '',
  consent: false,
})
const result = ref<ImcPayload | null>(null)
const status = ref('')
const sending = ref(false)
const canSend = computed(() => Boolean(result.value && form.consent && !sending.value))

function category(imc: number) {
  if (imc < 18.5) return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
  if (imc < 25) return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
  if (imc < 30) return ['Sobrepeso', 'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.']
  return ['Obesidade', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const resultMessage = computed(() => {
  if (!result.value) return ''
  if (result.value.age < 18) return 'Para menores de 18 anos, a interpretação deve considerar idade e sexo em curvas de crescimento. Procure um profissional de saúde.'
  return category(result.value.imc)[1]
})

function calculate() {
  status.value = ''
  const name = form.name.trim().replace(/\s+/g, ' ')
  const digits = form.whatsapp.replace(/\D/g, '')
  const whatsapp = digits.length === 10 || digits.length === 11
    ? `+55${digits}`
    : digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? `+${digits}` : ''
  const age = Number(form.age)
  // Vue automatically converts <input type="number"> v-model values to numbers.
  // String() keeps this safe whether the browser/Vue supplied a number or text.
  const weight = Number(String(form.weight).replace(',', '.'))
  const heightCm = Number(String(form.height).replace(',', '.'))
  const nameIsValid = name.length >= 2 && name.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(name)
  const valuesAreValid = Number.isInteger(age) && age >= 1 && age <= 120 &&
    ['feminino', 'masculino', 'outro'].includes(form.sex) &&
    Number.isFinite(weight) && weight >= 20 && weight <= 400 &&
    Number.isFinite(heightCm) && heightCm >= 80 && heightCm <= 250

  if (!nameIsValid || !whatsapp || !valuesAreValid) {
    status.value = 'Confira os campos. Informe nome, WhatsApp brasileiro com DDD e valores dentro dos limites indicados.'
    return
  }

  const imc = Number((weight / ((heightCm / 100) ** 2)).toFixed(1))
  result.value = {
    clientName: name,
    whatsapp,
    age,
    sex: form.sex as ImcPayload['sex'],
    weight,
    heightCm,
    imc,
    consent: true,
    requestId: crypto.randomUUID(),
  }
  form.consent = false
  status.value = ''
  document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function sendResult() {
  if (!result.value || !form.consent || sending.value) return
  if (!apiUrl) {
    status.value = 'A API ainda não foi configurada no deploy do Amplify. Verifique o backend da aplicação.'
    return
  }
  sending.value = true
  status.value = 'Enviando…'
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}api/imc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.value),
    })
    if (!response.ok) throw new Error('request failed')
    status.value = 'Solicitação recebida. A Beta encaminhará o resultado ao personal trainer.'
    form.consent = false
  } catch {
    status.value = 'Não foi possível enviar agora. Tente novamente mais tarde.'
  } finally {
    sending.value = false
  }
}

function reset() {
  result.value = null
  form.consent = false
  status.value = ''
}
</script>

<template>
  <main class="page-shell">
    <section class="calculator" aria-labelledby="page-title">
      <header class="hero">
        <span class="brand"><span class="brand-mark">β</span> BETA</span>
        <p class="eyebrow">CUIDADO QUE COMEÇA COM INFORMAÇÃO</p>
        <h1 id="page-title">Calculadora de IMC</h1>
        <p class="intro">Preencha seus dados para calcular seu Índice de Massa Corporal.</p>
      </header>

      <form class="form" @submit.prevent="calculate">
        <label class="field field-wide" for="name">Nome
          <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Como podemos chamar você?" required>
        </label>

        <label class="field field-wide" for="whatsapp">WhatsApp
          <input id="whatsapp" v-model="form.whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="(21) 99999-9999" required>
        </label>

        <label class="field" for="age">Idade <span>anos</span>
          <input id="age" v-model="form.age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Ex.: 35" required>
        </label>

        <label class="field" for="sex">Sexo
          <select id="sex" v-model="form.sex" name="sex" required>
            <option disabled value="">Selecione</option>
            <option value="feminino">Feminino</option>
            <option value="masculino">Masculino</option>
            <option value="outro">Outro / prefiro não informar</option>
          </select>
        </label>

        <label class="field" for="weight">Peso <span>kg</span>
          <input id="weight" v-model="form.weight" name="weight" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="Ex.: 78,5" required>
        </label>

        <label class="field" for="height">Altura <span>cm</span>
          <input id="height" v-model="form.height" name="height" type="number" inputmode="decimal" min="80" max="250" step="0.1" placeholder="Ex.: 175" required>
        </label>

        <button class="primary-button field-wide" type="submit">Calcular meu IMC <span aria-hidden="true">→</span></button>
      </form>

      <section v-if="result" id="result" class="result-card" aria-live="polite">
        <div class="result-heading"><div><p class="eyebrow">SEU RESULTADO</p><h2>{{ classification }}</h2></div>
          <div class="score"><strong>{{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}</strong><span>IMC</span></div>
        </div>
        <p class="result-message">{{ resultMessage }}</p>
        <div class="scale" aria-label="Faixas de IMC para adultos">
          <span><b>&lt; 18,5</b>Baixo peso</span><span><b>18,5–24,9</b>Adequado</span>
          <span><b>25–29,9</b>Sobrepeso</span><span><b>≥ 30</b>Obesidade</span>
        </div>
        <label class="consent"><input v-model="form.consent" type="checkbox">
          <span>Autorizo o envio do meu nome, WhatsApp, idade, sexo, peso, altura e IMC à Beta, para compartilhamento com o personal trainer pelo WhatsApp (final 4326).</span>
        </label>
        <button class="primary-button send-button" type="button" :disabled="!canSend" @click="sendResult">
          {{ sending ? 'Enviando…' : 'Enviar resultado para a Beta' }}
        </button>
        <button class="text-button" type="button" @click="reset">Corrigir meus dados</button>
      </section>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <p class="disclaimer">O IMC é uma referência para adultos e não substitui a avaliação de um profissional de saúde.</p>
    </section>
    <footer>Uma referência para você cuidar melhor de si.</footer>
  </main>
</template>
