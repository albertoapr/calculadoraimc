<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import silhouetteScaleImage from './assets/female-bmi-silhouette-scale.jpg'
import maleSilhouetteScaleImage from './assets/male-bmi-silhouette-scale.jpg'
import foxMark from './assets/fox-mark.svg'

type Sex = 'feminino' | 'masculino' | 'outro'
type GoogleCredentialResponse = { credential: string }
type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
    }
  }
}

declare global {
  interface Window { google?: GoogleIdentityApi }
}

// OAuth client IDs are public in browser apps; restrict this one to the app origin in Google Cloud.
const googleClientId = '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com'

type ImcResult = {
  weight: number
  heightCm: number
  imc: number
  waistCm?: number
  bodyFatPercent?: number
  bodyFatClassification?: string
  bodyFatSex?: 'feminino' | 'masculino'
  bodyFatAge?: number
}

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
  const formattedName = words.map((word, index) => {
    const lower = word.toLocaleLowerCase('pt-BR')
    if (index > 0 && lowercaseParticles.has(lower)) return lower
    return `${word.charAt(0).toLocaleUpperCase('pt-BR')}${word.slice(1).toLocaleLowerCase('pt-BR')}`
  }).join(' ')
  return `${formattedName} Personal Trainer`
}

const personalName = getPersonalNameFromPath()
const trainingDayOptions = [
  { label: 'Seg', value: 'Segunda-feira' },
  { label: 'Ter', value: 'Terça-feira' },
  { label: 'Qua', value: 'Quarta-feira' },
  { label: 'Qui', value: 'Quinta-feira' },
  { label: 'Sex', value: 'Sexta-feira' },
  { label: 'Sáb', value: 'Sábado' },
  { label: 'Dom', value: 'Domingo' },
]
const trainingShiftOptions = ['Manhã', 'Tarde', 'Noite']

const form = reactive({
  weight: '70',
  height: '170',
  waist: '85',
  calculateBodyFat: false,
  bodyFatAge: '',
  contactConsent: false,
  name: '',
  email: '',
  sex: 'feminino' as Sex,
  age: '',
  whatsapp: '',
  city: 'Mesquita',
  trainingDays: [] as string[],
  trainingShifts: [] as string[],
})

const result = ref<ImcResult | null>(null)
const evaluating = ref(false)
const evaluationProgress = ref(0)
const status = ref('')
const googleButtonContainer = ref<HTMLDivElement | null>(null)
const googleProfileStatus = ref('')
let googleIdentityScriptPromise: Promise<void> | null = null
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

function classifyBodyFat(percent: number, sex: Sex, age: number) {
  // Faixas gerais de referência por sexo e idade, para adultos de 20 a 79 anos.
  const referenceBands = sex === 'masculino'
    ? [
        { from: 20, to: 40, minimum: 8, maximum: 20 },
        { from: 40, to: 60, minimum: 11, maximum: 22 },
        { from: 60, to: 80, minimum: 13, maximum: 25 },
      ]
    : [
        { from: 20, to: 40, minimum: 21, maximum: 33 },
        { from: 40, to: 60, minimum: 23, maximum: 34 },
        { from: 60, to: 80, minimum: 24, maximum: 36 },
      ]
  const reference = referenceBands.find(band => age >= band.from && age < band.to)

  if (!reference) return 'Faixa de referência indisponível para esta idade'
  if (percent < reference.minimum) return 'Baixo'
  if (percent <= reference.maximum) return 'Adequado'
  if (percent <= reference.maximum + 5) return 'Alto'
  return 'Muito alto'
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const classificationEmoji = computed(() => result.value && result.value.imc >= 18.5 && result.value.imc < 25 ? '😎' : '😕')
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
const bodyFatReference = computed(() => {
  const current = result.value
  if (current?.bodyFatPercent === undefined || current.bodyFatAge === undefined || !current.bodyFatSex) return null
  const bands = current.bodyFatSex === 'masculino'
    ? [
        { from: 20, to: 40, minimum: 8, maximum: 20 },
        { from: 40, to: 60, minimum: 11, maximum: 22 },
        { from: 60, to: 80, minimum: 13, maximum: 25 },
      ]
    : [
        { from: 20, to: 40, minimum: 21, maximum: 33 },
        { from: 40, to: 60, minimum: 23, maximum: 34 },
        { from: 60, to: 80, minimum: 24, maximum: 36 },
      ]
  const band = bands.find(item => current.bodyFatAge! >= item.from && current.bodyFatAge! < item.to)
  if (!band) return null
  const domain = 70
  const highLimit = Math.min(domain, band.maximum + 5)
  return {
    ...band,
    domain,
    highLimit,
    sexLabel: current.bodyFatSex === 'masculino' ? 'homens' : 'mulheres',
    ageLabel: `${band.from}–${band.to - 1} anos`,
    marker: `${Math.max(0, Math.min(domain, current.bodyFatPercent)) / domain * 100}%`,
    widths: [
      band.minimum / domain * 100,
      (band.maximum - band.minimum) / domain * 100,
      (highLimit - band.maximum) / domain * 100,
      (domain - highLimit) / domain * 100,
    ],
  }
})
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
const weightGoalAmount = computed(() => {
  if (!result.value || (contactAge.value !== undefined && contactAge.value < 18)) return null
  const heightMetersSquared = (result.value.heightCm / 100) ** 2
  if (result.value.imc < 18.5) {
    return Number(Math.max(0, 18.5 * heightMetersSquared - result.value.weight).toFixed(1))
  }
  if (result.value.imc >= 25) {
    const adultReferenceWeight = 24.9 * heightMetersSquared
    return Number(Math.max(0, result.value.weight - adultReferenceWeight).toFixed(1))
  }
  return null
})
const referenceWeightRange = computed(() => {
  if (!result.value) return null
  const heightMetersSquared = (result.value.heightCm / 100) ** 2
  return {
    minimum: Number((18.5 * heightMetersSquared).toFixed(1)),
    maximum: Number((24.9 * heightMetersSquared).toFixed(1)),
  }
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
  form.email = ''
  form.age = ''
  form.whatsapp = ''
  form.city = 'Mesquita'
  form.trainingDays = []
  form.trainingShifts = []
  googleProfileStatus.value = ''
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts.id) return Promise.resolve()
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise
  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Não foi possível carregar o Google.'))
    document.head.appendChild(script)
  })
  return googleIdentityScriptPromise
}

function fillFromGoogle(response: GoogleCredentialResponse) {
  try {
    const payloadPart = response.credential.split('.')[1]
    if (!payloadPart) throw new Error('Credencial Google inválida.')
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const profile = JSON.parse(new TextDecoder().decode(bytes)) as { name?: string; email?: string }
    if (!profile.name && !profile.email) throw new Error('O Google não retornou nome ou e-mail.')
    if (profile.name) form.name = profile.name.trim()
    if (profile.email) form.email = profile.email.trim().toLowerCase()
    googleProfileStatus.value = 'Nome e e-mail preenchidos. Confira os dados e complete o restante do formulário.'
  } catch {
    googleProfileStatus.value = 'Não consegui ler os dados da conta Google. Tente novamente ou preencha manualmente.'
  }
}

async function renderGoogleButton() {
  const container = googleButtonContainer.value
  if (!container) return
  try {
    await loadGoogleIdentityScript()
    if (!window.google) throw new Error('Google Identity Services indisponível.')
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: fillFromGoogle })
    window.google.accounts.id.renderButton(container, {
      type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
      shape: 'rectangular', logo_alignment: 'left',
      width: Math.max(200, Math.min(400, Math.round(container.getBoundingClientRect().width))),
    })
  } catch {
    googleProfileStatus.value = 'O preenchimento com Google está indisponível. Você pode preencher os dados manualmente.'
  }
}

watch(() => form.contactConsent, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton()
})

function handleContactConsentChange() {
  if (form.contactConsent) {
    if (form.calculateBodyFat && form.bodyFatAge) form.age = form.bodyFatAge
    return
  }
  clearContactDetails()
  status.value = ''
}

function adjustMeasurement(field: 'weight' | 'height' | 'waist', amount: number) {
  const minimum = field === 'weight' ? 20 : field === 'height' ? 80 : 40
  const maximum = field === 'waist' ? 160 : 200
  const nextValue = Math.max(minimum, Math.min(maximum, Number(form[field]) + amount))
  form[field] = String(nextValue)
}

function calculateImc() {
  if (evaluating.value) return
  status.value = ''

  clearContactDetails()

  const weight = Number(form.weight)
  const heightCm = Number(form.height)
  if (!Number.isInteger(weight) || weight < 20 || weight > 200 ||
      !Number.isInteger(heightCm) || heightCm < 80 || heightCm > 200) {
    status.value = 'Confira o peso e a altura informados.'
    return
  }

  const nextResult: ImcResult = {
    weight,
    heightCm,
    imc: Number((weight / ((heightCm / 100) ** 2)).toFixed(1)),
  }
  if (form.calculateBodyFat) {
    const waistCm = Number(form.waist)
    const age = Number(form.bodyFatAge)
    if (!Number.isInteger(waistCm) || waistCm < 40 || waistCm > 160 ||
        !Number.isInteger(age) || age < 20 || age > 120) {
      status.value = 'Para calcular a gordura corporal, confira a cintura e informe a idade (mínimo de 20 anos).'
      return
    }
    const bodyFatPercent = Number(((form.sex === 'masculino' ? 64 : 76) - 20 * (heightCm / waistCm)).toFixed(1))
    if (bodyFatPercent < 0 || bodyFatPercent > 70) {
      status.value = 'Confira as medidas de altura e cintura informadas.'
      return
    }
    nextResult.waistCm = waistCm
    nextResult.bodyFatPercent = bodyFatPercent
    nextResult.bodyFatClassification = classifyBodyFat(bodyFatPercent, form.sex, age)
    nextResult.bodyFatSex = form.sex === 'masculino' ? 'masculino' : 'feminino'
    nextResult.bodyFatAge = age
  }

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

function sendResult() {
  if (!result.value || !form.contactConsent) return
  status.value = ''

  const clientName = form.name.trim().replace(/\s+/g, ' ')
  const email = form.email.trim().toLowerCase()
  const city = form.city.trim().replace(/\s+/g, ' ')
  const whatsapp = normalizeWhatsapp(form.whatsapp)
  const age = Number(String(form.age))
  const validName = clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
  const validCity = ['Mesquita', 'Nilópolis', 'Nova Iguaçu'].includes(city)
  const validAge = Number.isInteger(age) && age >= 1 && age <= 120
  const validSex = ['feminino', 'masculino'].includes(form.sex)
  const validAvailability = form.trainingDays.length > 0 && form.trainingShifts.length > 0

  if (!validName || !validCity || !whatsapp || !validAge || !validSex || !validAvailability) {
    status.value = 'Confira os dados de contato e selecione ao menos um dia e um turno para treinar.'
    return
  }

  const sexLabel = form.sex === 'masculino' ? 'Homem' : 'Mulher'
  const message = [
    'Olá! Gostaria de receber ajuda de um personal trainer.',
    '',
    '*Dados da avaliação*',
    `Nome: ${clientName}`,
    ...(email ? [`E-mail: ${email}`] : []),
    `Sexo: ${sexLabel}`,
    `Idade: ${age} anos`,
    `Peso: ${result.value.weight} kg`,
    `Altura: ${result.value.heightCm} cm`,
    `IMC: ${result.value.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}`,
    ...(result.value.waistCm !== undefined && result.value.bodyFatPercent !== undefined
      ? [
          `Cintura: ${result.value.waistCm} cm`,
          `Gordura corporal estimada (RFM): ${result.value.bodyFatPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`,
          `Classificação da gordura corporal: ${result.value.bodyFatClassification}`,
        ]
      : []),
    `Cidade: ${city}`,
    `Dias disponíveis para treinar: ${form.trainingDays.join(', ')}`,
    `Turnos disponíveis: ${form.trainingShifts.join(', ')}`,
    `WhatsApp para contato: ${whatsapp}`,
  ].join('\n')
  const whatsappUrl = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
  const whatsappWindow = window.open(whatsappUrl, '_blank')
  if (whatsappWindow) {
    whatsappWindow.opener = null
    status.value = 'WhatsApp aberto com os dados preenchidos. Revise e escolha para quem enviar.'
  } else {
    window.location.assign(whatsappUrl)
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="calculator" aria-labelledby="page-title">
      <header class="hero">
        <div class="brand" :aria-label="personalName">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
            <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
          </svg>
          <span>{{ personalName }}</span>
        </div>
        <hr class="personal-divider">
        <h1 id="page-title">
          <svg class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="4" width="28" height="32" rx="6" />
            <rect x="12" y="9" width="16" height="8" rx="2" />
            <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
          </svg>
          <span>{{ result ? 'Resultado da avaliação' : form.calculateBodyFat ? 'IMC e gordura corporal' : 'Controle de peso' }}</span>
        </h1>
        <p v-if="!result" class="intro"><span>Descubra seu peso adequado.</span><span>Informe seu peso e altura; a gordura corporal é opcional.</span></p>
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

        <label class="body-fat-toggle field-wide" for="calculate-body-fat">
          <input id="calculate-body-fat" v-model="form.calculateBodyFat" type="checkbox" aria-controls="body-fat-fields" :aria-expanded="form.calculateBodyFat">
          <span>Calcular percentual de gordura corporal</span>
        </label>

        <div v-if="form.calculateBodyFat" id="body-fat-fields" class="body-fat-fields field-wide">
          <label class="field slider-field" for="waist"><span class="slider-heading"><span class="field-label">Cintura <span>cm</span></span><output for="waist">{{ Number(form.waist).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} cm</output></span>
            <div class="slider-control-row">
              <button class="slider-adjust" type="button" aria-label="Diminuir cintura" :disabled="Number(form.waist) <= 40" @click="adjustMeasurement('waist', -1)">−</button>
              <input id="waist" v-model="form.waist" class="range-input" name="waist" type="range" min="40" max="160" step="1" aria-label="Medida da cintura em centímetros">
              <button class="slider-adjust" type="button" aria-label="Aumentar cintura" :disabled="Number(form.waist) >= 160" @click="adjustMeasurement('waist', 1)">+</button>
            </div>
            <span class="range-limits" aria-hidden="true"><span>40 cm</span><span>160 cm</span></span>
          </label>
          <label class="field field-wide" for="body-fat-age"><span class="field-label">Idade <span>anos</span></span>
            <input id="body-fat-age" v-model="form.bodyFatAge" name="bodyFatAge" type="number" inputmode="numeric" min="20" max="120" step="1" placeholder="Necessária para classificar" required>
            <small class="body-fat-help">A idade é usada para selecionar a faixa de referência.</small>
          </label>
        </div>

        <button class="primary-button field-wide" type="submit">Avaliar <span aria-hidden="true">→</span></button>
        </div>
      </form>

      <section v-else id="result" class="result-card" aria-live="polite">
        <div class="result-heading">
          <h2>
            {{ classification }} {{ classificationEmoji }}<template v-if="weightGoalAmount !== null">: {{ weightGoalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg {{ result.imc < 18.5 ? 'a ganhar' : 'a perder' }}</template>
          </h2>
        </div>

        <label class="contact-opt-in" for="contact-consent">
          <input id="contact-consent" v-model="form.contactConsent" name="contactConsent" type="checkbox" aria-controls="contact-fields" :aria-expanded="form.contactConsent" @change="handleContactConsentChange">
          <span>Receber ajuda de um personal</span>
        </label>

        <form v-if="form.contactConsent" id="contact-fields" class="form contact-fields" @submit.prevent="sendResult">
          <div class="google-fill field-wide">
            <p>Preencha nome e e-mail com sua conta Google</p>
            <div ref="googleButtonContainer" class="google-button-container"></div>
            <small v-if="googleProfileStatus" role="status" aria-live="polite">{{ googleProfileStatus }}</small>
          </div>

          <label class="field field-wide" for="name"><span class="field-label">Nome</span>
            <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome" required>
          </label>

          <label class="field field-wide" for="email"><span class="field-label">E-mail <span>opcional</span></span>
            <input id="email" v-model="form.email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com">
          </label>

          <label class="field" for="age"><span class="field-label">Idade <span>anos</span></span>
            <input id="age" v-model="form.age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Ex.: 35" required>
          </label>

          <label class="field field-wide" for="whatsapp"><span class="field-label">WhatsApp</span>
            <input id="whatsapp" v-model="form.whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="(21) 99999-9999" required>
          </label>

          <label class="field field-wide" for="city"><span class="field-label">Cidade</span>
            <select id="city" v-model="form.city" name="city" autocomplete="address-level2" required>
              <option value="" disabled>Selecione sua cidade</option>
              <option value="Mesquita">Mesquita</option>
              <option value="Nilópolis">Nilópolis</option>
              <option value="Nova Iguaçu">Nova Iguaçu</option>
            </select>
          </label>

          <fieldset class="availability-group field-wide">
            <legend>Disponibilidade para treinar — dias da semana</legend>
            <div class="availability-options">
              <label v-for="day in trainingDayOptions" :key="day.value" class="availability-option">
                <input v-model="form.trainingDays" type="checkbox" name="trainingDays" :value="day.value">
                <span>{{ day.label }}</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="availability-group field-wide">
            <legend>Turno</legend>
            <div class="availability-options">
              <label v-for="shift in trainingShiftOptions" :key="shift" class="availability-option">
                <input v-model="form.trainingShifts" type="checkbox" name="trainingShifts" :value="shift">
                <span>{{ shift }}</span>
              </label>
            </div>
          </fieldset>

          <button class="primary-button field-wide" type="submit">Abrir WhatsApp para enviar <span aria-hidden="true">→</span></button>
        </form>

        <div class="bmi-summary">
          <p v-if="referenceWeightRange" class="weight-range-note">
            Peso ideal <strong>{{ referenceWeightRange.minimum.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong> a
            <strong>{{ referenceWeightRange.maximum.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong>
          </p>
          <p class="bmi-value">IMC {{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} <span class="bmi-unit">kg/m²</span></p>
        </div>

        <div class="bmi-scale-wrap" role="img" :aria-label="`Escala de IMC: ${result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} quilogramas por metro quadrado, classificação ${classification}`">
          <div class="bmi-scale-bar">
            <div class="bmi-scale-segments"><span v-for="segment in bmiScale" :key="segment.label" :style="{ backgroundColor: segment.color, flexGrow: segment.to - segment.from }"></span></div>
            <div class="scale-marker" :style="{ left: scalePosition }" aria-hidden="true"></div>
          </div>
          <div class="scale-labels"><span v-for="segment in bmiScale" :key="segment.label"><b>{{ segment.range }}</b>{{ segment.label }}</span></div>
        </div>

        <div v-if="result.bodyFatPercent !== undefined" class="body-fat-summary" aria-label="Estimativa de gordura corporal pela fórmula RFM">
          <p>Gordura corporal estimada <span>(RFM)</span></p>
          <strong>{{ result.bodyFatPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}%</strong>
          <p class="body-fat-classification">{{ result.bodyFatClassification }}</p>
          <small>Estimativa com referência geral para adultos por sexo e idade; não é medição direta.</small>
        </div>
        <div v-if="result.bodyFatPercent !== undefined" class="body-fat-scale-wrap">
          <template v-if="bodyFatReference">
            <p class="body-fat-scale-title">Referência para {{ bodyFatReference.sexLabel }}, {{ bodyFatReference.ageLabel }}</p>
            <div class="body-fat-scale-bar" role="img" :aria-label="`Gordura corporal ${result.bodyFatPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%. Classificações: baixo abaixo de ${bodyFatReference.minimum}%, adequado até ${bodyFatReference.maximum}%, alto até ${bodyFatReference.highLimit}%, muito alto acima disso.`">
              <div class="body-fat-scale-segments">
                <span class="body-fat-low" :style="{ width: `${bodyFatReference.widths[0]}%` }"></span>
                <span class="body-fat-healthy" :style="{ width: `${bodyFatReference.widths[1]}%` }"></span>
                <span class="body-fat-high" :style="{ width: `${bodyFatReference.widths[2]}%` }"></span>
                <span class="body-fat-very-high" :style="{ width: `${bodyFatReference.widths[3]}%` }"></span>
              </div>
              <div class="body-fat-scale-marker" :style="{ left: bodyFatReference.marker }" aria-hidden="true"></div>
            </div>
            <div class="body-fat-scale-labels" :style="{ gridTemplateColumns: bodyFatReference.widths.map(width => `${width}fr`).join(' ') }">
              <span><b>Baixo</b>&lt;{{ bodyFatReference.minimum }}%</span>
              <span><b>Adequado</b>{{ bodyFatReference.minimum }}–{{ bodyFatReference.maximum }}%</span>
              <span><b>Alto</b>&gt;{{ bodyFatReference.maximum }}–{{ bodyFatReference.highLimit }}%</span>
              <span><b>Muito alto</b>&gt;{{ bodyFatReference.highLimit }}%</span>
            </div>
          </template>
          <p v-else class="body-fat-reference-unavailable">Faixa de referência indisponível para esta idade.</p>
        </div>
        <div class="silhouette-section" :class="{ 'male-silhouettes': form.sex === 'masculino' }" :aria-label="`Escala ilustrativa de silhuetas ${silhouetteGenderLabel.toLowerCase()} por classificação de IMC`">
          <div class="silhouette-list">
            <div v-for="(person, index) in bmiSilhouettes" :key="person.label" class="silhouette-item" :class="{ active: activeSilhouette === index }" :aria-current="activeSilhouette === index ? 'true' : undefined">
              <div class="silhouette-image-window" :style="{ backgroundImage: `url(${silhouetteImage})`, backgroundPositionX: silhouettePositions[index] }" role="img" :aria-label="`Silhueta ${person.label}`"></div>
              <b>{{ person.label }}</b><span>{{ person.range }}</span>
            </div>
          </div>
          <p v-if="result.imc >= 35" class="silhouette-note severe-obesity-note">O gráfico e a escala visual terminam em obesidade grau I; seu IMC está acima da faixa exibida.</p>
        </div>

        <button class="back-button" type="button" @click="editMeasurement">Nova avaliação</button>
      </section>

      <div v-if="evaluating" class="evaluation-overlay" role="status" aria-live="polite" :aria-label="`Avaliando: ${evaluationProgress}%`">
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
    </section>
    <footer><img :src="foxMark" alt=""><a href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20sou%20personal.%20Me%20interessei%20pelo%20fitpeso%2C%20como%20funciona%20%3F" target="_blank" rel="noopener noreferrer">Beta Soluções IA</a></footer>
  </main>
</template>
