<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import silhouetteScaleImage from './assets/female-bmi-silhouette-scale.jpg'
import maleSilhouetteScaleImage from './assets/male-bmi-silhouette-scale.png'
import foxMark from './assets/fox-mark.svg'

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

function getPersonalNameFromPath() {
  const encodedName = window.location.pathname.split('/').filter(Boolean)[0]
  if (!encodedName) return 'Beta Personal Trainer'

  let name = encodedName
  try {
    name = decodeURIComponent(encodedName)
  } catch {
    return 'Beta Personal Trainer'
  }

  const words = name
    .replace(/[-_]+/g, ' ')
    .replace(/[^\p{L}\p{M}\s'.’]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'Beta Personal Trainer'

  const lowercaseParticles = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])
  return words.map((word, index) => {
    const lower = word.toLocaleLowerCase('pt-BR')
    if (index > 0 && lowercaseParticles.has(lower)) return lower
    return `${word.charAt(0).toLocaleUpperCase('pt-BR')}${word.slice(1).toLocaleLowerCase('pt-BR')}`
  }).join(' ')
}

const personalName = getPersonalNameFromPath()

const form = reactive({
  weight: '70',
  height: '170',
  contactConsent: false,
  name: '',
  sex: 'feminino' as Sex,
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
  if (imc < 35) return ['Obesidade I', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
  if (imc < 40) return ['Obesidade II', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
  return ['Obesidade mórbida', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const silhouetteImage = computed(() => form.sex === 'masculino' ? maleSilhouetteScaleImage : silhouetteScaleImage)
const silhouettePositions = computed(() => form.sex === 'masculino'
  ? ['0%', '33.333%', '66.667%', '100%']
  : ['0%', '25%', '50%', '75%'])
const silhouetteGenderLabel = computed(() => form.sex === 'masculino' ? 'MASCULINAS' : 'FEMININAS')
const bmiScale = [
  { label: 'Magreza', range: '<18,5', from: 12, to: 18.5, color: '#60a5fa' },
  { label: 'Peso adequado', range: '18,5–24,9', from: 18.5, to: 25, color: '#34d399' },
  { label: 'Sobrepeso', range: '25–29,9', from: 25, to: 30, color: '#fbbf24' },
  { label: 'Obesidade I', range: '30–34,9', from: 30, to: 35, color: '#fb923c' },
]
const scalePosition = computed(() => result.value ? `${Math.max(0, Math.min(100, ((result.value.imc - 12) / 23) * 100))}%` : '0%')
const bmiSilhouettes = [
  { label: 'Magreza', range: 'IMC < 18,5', position: 0 },
  { label: 'Peso adequado', range: 'IMC 18,5–24,9', position: 25 },
  { label: 'Sobrepeso', range: 'IMC 25–29,9', position: 50 },
  { label: 'Obesidade I', range: 'IMC 30–34,9', position: 75 },
]
const activeSilhouette = computed(() => {
  if (!result.value) return -1
  if (result.value.imc < 18.5) return 0
  if (result.value.imc < 25) return 1
  if (result.value.imc < 30) return 2
  return 3
})
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
  const duration = 2000

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
  const validSex = ['feminino', 'masculino'].includes(form.sex)

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
        <div class="brand" :aria-label="personalName"><img class="fox-mark" :src="foxMark" alt=""><span>{{ personalName }}</span></div>
        <h1 id="page-title">
          <svg class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="4" width="28" height="32" rx="6" />
            <rect x="12" y="9" width="16" height="8" rx="2" />
            <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
          </svg>
          <span>{{ result ? 'Resultado da avaliação' : 'Avalie seu peso' }}</span>
        </h1>
        <p v-if="!result" class="intro">Quanto falta pra você chegar ao peso ideal?</p>
      </header>

      <form v-if="!result" class="form" @submit.prevent="calculateImc">
        <div class="gender-tabs field-wide" role="tablist" aria-label="Selecione uma escala corporal">
          <button id="tab-woman" class="gender-tab" :class="{ active: form.sex === 'feminino' }" type="button" role="tab" :aria-selected="form.sex === 'feminino'" aria-controls="measurement-panel" @click="form.sex = 'feminino'">Mulher</button>
          <button id="tab-man" class="gender-tab" :class="{ active: form.sex === 'masculino' }" type="button" role="tab" :aria-selected="form.sex === 'masculino'" aria-controls="measurement-panel" @click="form.sex = 'masculino'">Homem</button>
        </div>
        <div id="measurement-panel" class="measurement-fields field-wide" role="tabpanel" :aria-labelledby="form.sex === 'feminino' ? 'tab-woman' : 'tab-man'">
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
        </div>
      </form>

      <section v-else id="result" class="result-card" aria-live="polite">
        <label class="contact-opt-in" for="contact-consent">
          <input id="contact-consent" v-model="form.contactConsent" name="contactConsent" type="checkbox" aria-controls="contact-fields" :aria-expanded="form.contactConsent" @change="handleContactConsentChange">
          <span>Receber ajuda de um personal</span>
        </label>

        <form v-if="form.contactConsent" id="contact-fields" class="form contact-fields" @submit.prevent="sendResult">
          <label class="field field-wide" for="name"><span class="field-label">Nome</span>
            <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome" required>
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

        <div class="weight-goal">
          <p class="eyebrow">QUANTO PESO PERDER</p>
          <strong v-if="weightToLose !== null">{{ weightToLose.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong>
          <strong v-else>—</strong>
          <p>{{ weightGoalMessage }}</p>
        </div>

        <div class="bmi-scale-wrap" role="img" :aria-label="`Escala de IMC de magreza até obesidade grau I: ${result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}, classificação ${classification}`">
          <div class="scale-marker" :style="{ left: scalePosition }"><strong>{{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}</strong><span aria-hidden="true">▼</span></div>
          <div class="bmi-scale-bar"><span v-for="segment in bmiScale" :key="segment.label" :style="{ backgroundColor: segment.color, flexGrow: segment.to - segment.from }"></span></div>
          <div class="scale-labels"><span v-for="segment in bmiScale" :key="segment.label"><b>{{ segment.range }}</b>{{ segment.label }}</span></div>
        </div>

        <div class="silhouette-section" :class="{ 'male-silhouettes': form.sex === 'masculino' }" :aria-label="`Escala ilustrativa de silhuetas ${silhouetteGenderLabel.toLowerCase()} por classificação de IMC`">
          <p class="eyebrow">SILHUETAS {{ silhouetteGenderLabel }} · REFERÊNCIA ADULTA</p>
          <div class="silhouette-list">
            <div v-for="(person, index) in bmiSilhouettes" :key="person.label" class="silhouette-item" :class="{ active: activeSilhouette === index }" :aria-current="activeSilhouette === index ? 'true' : undefined">
              <div class="silhouette-image-window" :style="{ backgroundImage: `url(${silhouetteImage})`, backgroundPositionX: silhouettePositions[index] }" role="img" :aria-label="`Silhueta ${person.label}`"></div>
              <b>{{ person.label }}</b><span>{{ person.range }}</span>
            </div>
          </div>
          <p class="silhouette-note">Referência visual ilustrativa para adultos; não substitui avaliação profissional.</p>
          <p v-if="result.imc >= 35" class="silhouette-note severe-obesity-note">O gráfico e a escala visual terminam em obesidade grau I; seu IMC está acima da faixa exibida.</p>
        </div>

        <div class="result-heading">
          <div><p class="eyebrow">SEU RESULTADO</p><h2>{{ classification }}</h2></div>
        </div>
        <button class="back-button" type="button" @click="editMeasurement">Nova avaliação</button>
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
