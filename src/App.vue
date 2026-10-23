<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

declare const __IMC_API_URL__: string

type Sex = 'feminino' | 'masculino' | 'outro'

type ImcResult = {
  weight: number
  heightCm: number
  imc: number
}

type ImcSubmission = ImcResult & {
  clientName: string
  whatsapp: string
  city: string
  age: number
  sex: Sex
  consent: true
  requestId: string
}

const apiUrl = __IMC_API_URL__

const form = reactive({
  weight: '70',
  height: '170',
  contactConsent: false,
  name: '',
  sex: '' as Sex | '',
  age: '',
  whatsapp: '',
  city: '',
})

const result = ref<ImcResult | null>(null)
const evaluating = ref(false)
const evaluationProgress = ref(0)
const status = ref('')
const sending = ref(false)
const contactAge = computed(() => {
  if (!form.contactConsent || form.age === '') return undefined
  const age = Number(String(form.age))
  return Number.isInteger(age) ? age : undefined
})

function category(imc: number) {
  if (imc < 18.5) return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
  if (imc < 25) return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
  if (imc < 30) return ['Sobrepeso', 'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.']
  return ['Obesidade', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const gaugeSegments = [
  { from: 12, to: 18.5, color: '#60a5fa' },
  { from: 18.5, to: 25, color: '#34d399' },
  { from: 25, to: 30, color: '#fbbf24' },
  { from: 30, to: 40, color: '#f87171' },
]
function gaugePoint(value: number, radius: number) {
  const clamped = Math.max(12, Math.min(40, value))
  const angle = Math.PI - ((clamped - 12) / 28) * Math.PI
  return { x: 100 + radius * Math.cos(angle), y: 100 - radius * Math.sin(angle) }
}
const gaugePaths = gaugeSegments.map(segment => {
  const start = gaugePoint(segment.from, 78)
  const end = gaugePoint(segment.to, 78)
  return { color: segment.color, d: `M ${start.x} ${start.y} A 78 78 0 0 1 ${end.x} ${end.y}` }
})
const gaugeNeedle = computed(() => result.value ? gaugePoint(result.value.imc, 58) : gaugePoint(12, 58))
const weightToLose = computed(() => {
  if (!result.value || (contactAge.value !== undefined && contactAge.value < 18)) return null
  const adultReferenceWeight = 24.9 * ((result.value.heightCm / 100) ** 2)
  return Number(Math.max(0, result.value.weight - adultReferenceWeight).toFixed(1))
})
const weightGoalMessage = computed(() => {
  if (!result.value) return ''
  if (contactAge.value !== undefined && contactAge.value < 18) {
    return 'Não calculamos meta de perda de peso para menores de 18 anos. A avaliação deve considerar idade e sexo em curvas de crescimento.'
  }
  if (result.value.imc < 18.5) {
    return 'Seu IMC está abaixo da faixa de referência adulta; não é indicado perder peso com base neste cálculo.'
  }
  if (result.value.imc < 25) return 'Pela faixa de referência para adultos, você não precisa perder peso.'
  return 'Estimativa para chegar ao limite superior da faixa de referência do IMC adulto (24,9).'
})
function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`
  return ''
}

function clearContactDetails() {
  form.contactConsent = false
  form.name = ''
  form.sex = ''
  form.age = ''
  form.whatsapp = ''
  form.city = ''
}

function handleContactConsentChange() {
  if (!form.contactConsent) {
    clearContactDetails()
    status.value = ''
  }
}

function adjustMeasurement(field: 'weight' | 'height', amount: number) {
  const minimum = field === 'weight' ? 20 : 80
  const maximum = 200
  const nextValue = Math.max(minimum, Math.min(maximum, Number(form[field]) + amount))
  form[field] = String(nextValue)
}

function calculateImc() {
  if (sending.value || evaluating.value) return
  status.value = ''

  clearContactDetails()

  const weight = Number(form.weight)
  const heightCm = Number(form.height)
  if (!Number.isInteger(weight) || weight < 20 || weight > 200 ||
      !Number.isInteger(heightCm) || heightCm < 80 || heightCm > 200) {
    status.value = 'Confira o peso e a altura informados.'
    return
  }

  const imc = Number((weight / ((heightCm / 100) ** 2)).toFixed(1))
  const nextResult = { weight, heightCm, imc }
  evaluating.value = true
  evaluationProgress.value = 0
  const startedAt = performance.now()
  const duration = 3000

  function animate(now: number) {
    evaluationProgress.value = Math.min(100, Math.round(((now - startedAt) / duration) * 100))
    if (evaluationProgress.value < 100) {
      requestAnimationFrame(animate)
    } else {
      result.value = nextResult
      evaluating.value = false
    }
  }

  requestAnimationFrame(animate)
}

function editMeasurement() {
  result.value = null
  clearContactDetails()
  status.value = ''
}

async function sendResult() {
  if (!result.value || !form.contactConsent || sending.value) return
  status.value = ''

  const clientName = form.name.trim().replace(/\s+/g, ' ')
  const city = form.city.trim().replace(/\s+/g, ' ')
  const whatsapp = normalizeWhatsapp(form.whatsapp)
  const age = Number(String(form.age))
  const validName = clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
  const validCity = city.length >= 2 && city.length <= 80 && /^[\p{L}\p{M}\p{N} .'-]+$/u.test(city)
  const validAge = Number.isInteger(age) && age >= 1 && age <= 120
  const validSex = ['feminino', 'masculino', 'outro'].includes(form.sex)

  if (!validName || !validCity || !whatsapp || !validAge || !validSex) {
    status.value = 'Confira nome, sexo, idade, WhatsApp com DDD e cidade.'
    return
  }

  if (!apiUrl) {
    status.value = 'A avaliação foi calculada, mas o envio ainda não está configurado nesta versão.'
    return
  }

  const payload: ImcSubmission = {
    clientName,
    whatsapp,
    city,
    age,
    sex: form.sex as Sex,
    weight: result.value.weight,
    heightCm: result.value.heightCm,
    imc: result.value.imc,
    consent: true,
    requestId: crypto.randomUUID(),
  }

  sending.value = true
  status.value = 'Enviando…'
  try {
    const apiBase = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`
    const response = await fetch(new URL('api/imc', apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('request failed')
    status.value = 'Dados enviados. O personal poderá entrar em contato pelo WhatsApp informado.'
    clearContactDetails()
  } catch {
    status.value = 'Não foi possível enviar os dados agora. Tente novamente.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="calculator" aria-labelledby="page-title">
      <header class="hero">
        <span class="brand"><span class="brand-mark">β</span> BETA</span>
        <h1 id="page-title">Avalie seu peso</h1>
        <p class="intro">{{ result ? 'Veja o resultado da sua avaliação.' : 'Informe seu peso e sua altura para calcular uma estimativa.' }}</p>
      </header>

      <form v-if="!result" class="form" @submit.prevent="calculateImc">
        <label class="field slider-field" for="weight"><span class="slider-heading"><span class="field-label">Peso <span>kg</span></span><output for="weight">{{ Number(form.weight).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} kg</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir peso" :disabled="Number(form.weight) <= 20" @click="adjustMeasurement('weight', -1)">−</button>
            <input id="weight" v-model="form.weight" class="range-input" name="weight" type="range" min="20" max="200" step="1" aria-label="Peso em quilogramas">
            <button class="slider-adjust" type="button" aria-label="Aumentar peso" :disabled="Number(form.weight) >= 200" @click="adjustMeasurement('weight', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>20 kg</span><span>200 kg</span></span>
        </label>

        <label class="field slider-field" for="height"><span class="slider-heading"><span class="field-label">Altura <span>cm</span></span><output for="height">{{ Number(form.height).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} cm</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir altura" :disabled="Number(form.height) <= 80" @click="adjustMeasurement('height', -1)">−</button>
            <input id="height" v-model="form.height" class="range-input" name="height" type="range" min="80" max="200" step="1" aria-label="Altura em centímetros">
            <button class="slider-adjust" type="button" aria-label="Aumentar altura" :disabled="Number(form.height) >= 200" @click="adjustMeasurement('height', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>80 cm</span><span>200 cm</span></span>
        </label>

        <button class="primary-button field-wide" type="submit" :disabled="sending">{{ sending ? 'Avaliando…' : 'Avaliar' }} <span aria-hidden="true">→</span></button>
      </form>

      <section v-else id="result" class="result-card" aria-live="polite">
        <div class="weight-goal">
          <p class="eyebrow">QUANTO PESO PERDER</p>
          <strong v-if="weightToLose !== null">{{ weightToLose.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong>
          <strong v-else>—</strong>
          <p>{{ weightGoalMessage }}</p>
        </div>

        <div class="bmi-gauge" role="img" :aria-label="`Odômetro do IMC: ${result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}, faixa ${classification}`">
          <svg viewBox="0 0 200 116" aria-hidden="true" class="gauge-svg">
            <path v-for="(segment, index) in gaugePaths" :key="index" :d="segment.d" :stroke="segment.color" class="gauge-arc" />
            <line x1="100" y1="100" :x2="gaugeNeedle.x" :y2="gaugeNeedle.y" class="gauge-needle" />
            <circle cx="100" cy="100" r="6" class="gauge-hub" />
          </svg>
          <div class="gauge-reading"><strong>{{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}</strong><span>IMC</span></div>
          <div class="gauge-labels">
            <span><b>&lt; 18,5</b>Baixo peso</span><span><b>18,5–24,9</b>Adequado</span>
            <span><b>25–29,9</b>Sobrepeso</span><span><b>≥ 30</b>Obesidade</span>
          </div>
        </div>

        <div class="result-heading">
          <div><p class="eyebrow">SEU RESULTADO</p><h2>{{ classification }}</h2></div>
        </div>
        <label class="contact-opt-in" for="contact-consent">
          <input id="contact-consent" v-model="form.contactConsent" name="contactConsent" type="checkbox" aria-controls="contact-fields" :aria-expanded="form.contactConsent" @change="handleContactConsentChange">
          <span>Quero receber contato do personal</span>
        </label>

        <form v-if="form.contactConsent" id="contact-fields" class="form contact-fields" @submit.prevent="sendResult">
          <label class="field field-wide" for="name"><span class="field-label">Nome</span>
            <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome" required>
          </label>

          <label class="field" for="sex"><span class="field-label">Sexo</span>
            <select id="sex" v-model="form.sex" name="sex" required>
              <option disabled value="">Selecione</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro / prefiro não informar</option>
            </select>
          </label>

          <label class="field" for="age"><span class="field-label">Idade <span>anos</span></span>
            <input id="age" v-model="form.age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Ex.: 35" required>
          </label>

          <label class="field field-wide" for="whatsapp"><span class="field-label">WhatsApp</span>
            <input id="whatsapp" v-model="form.whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="(21) 99999-9999" required>
          </label>

          <label class="field field-wide" for="city"><span class="field-label">Cidade</span>
            <input id="city" v-model="form.city" name="city" type="text" autocomplete="address-level2" minlength="2" maxlength="80" placeholder="Ex.: Rio de Janeiro" required>
          </label>

          <button class="primary-button field-wide" type="submit" :disabled="sending">{{ sending ? 'Enviando…' : 'Enviar dados para o personal' }} <span aria-hidden="true">→</span></button>
        </form>

        <button class="back-button" type="button" @click="editMeasurement">Alterar peso e altura</button>
      </section>

      <div v-if="evaluating" class="evaluation-overlay" role="status" aria-live="polite" :aria-label="`Avaliando: ${evaluationProgress}%`">
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <p class="disclaimer">O IMC é uma referência para adultos e não substitui a avaliação de um profissional de saúde.</p>
    </section>
    <footer>Uma referência para você cuidar melhor de si.</footer>
  </main>
</template>
