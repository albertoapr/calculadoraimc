<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
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

type Theme = 'light' | 'dark'
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem('beta-imc-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
const theme = ref<Theme>(readStoredTheme())
watch(theme, value => {
  document.documentElement.dataset.theme = value
  try {
    localStorage.setItem('beta-imc-theme', value)
  } catch {
    // Keep the in-memory selection if browser storage is unavailable.
  }
}, { immediate: true })

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

function getTrainerIdFromPath() {
  const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/)
  if (!match) return ''
  try {
    const id = decodeURIComponent(match[1]).trim()
    return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : ''
  } catch {
    return ''
  }
}

function getTrainerSlugFromHost() {
  const hostname = window.location.hostname.toLowerCase()
  const suffix = '.fitpeso.com.br'
  if (!hostname.endsWith(suffix)) return ''
  const slug = hostname.slice(0, -suffix.length)
  if (slug.includes('.') || ['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda'].includes(slug)) return ''
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? slug : ''
}

const trainerIdFromPath = getTrainerIdFromPath()
const trainerSlugFromHost = getTrainerSlugFromHost()
const personalName = ref('Beta Personal Trainer')
const trainerWhatsApp = ref('')
const trainerProfileFailed = ref(false)
const availableCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
const viewMode = ref<'home' | 'assessment' | 'contact'>('home')
const showRequestForm = ref(false)
const requestSent = ref(false)
const showTrainerSignup = ref(window.location.hash === '#cadastro-personal')
const trainerForm = reactive({
  name: '',
  slug: '',
  phone: '',
  email: '',
  cities: [] as string[],
  instagram: '',
  cref: '',
})
const trainerStatus = ref('')
const trainerVerificationLink = ref('')
const trainerSubmitting = ref(false)
const googleProfileTarget = ref<'client' | 'trainer'>('client')
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
  shareContactConsent: false,
  provideAvailability: false,
  name: '',
  phone: '',
  email: '',
  objective: 'Emagrecimento',
  sex: 'feminino' as Sex,
  age: '',
  city: 'Mesquita',
  trainingDays: [] as string[],
  trainingShifts: [] as string[],
})

const result = ref<ImcResult | null>(null)
const evaluating = ref(false)
const evaluationProgress = ref(0)
const status = ref('')
const submittingRequest = ref(false)
const googleButtonContainer = ref<HTMLDivElement | null>(null)
const googleProfileStatus = ref('')
let googleIdentityScriptPromise: Promise<void> | null = null
const contactAge = computed(() => {
  if (!showRequestForm.value || form.age === '') return undefined
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
function clearContactDetails() {
  showRequestForm.value = false
  form.shareContactConsent = false
  form.name = ''
  form.phone = ''
  form.email = ''
  form.objective = 'Emagrecimento'
  form.age = ''
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
    const target = googleProfileTarget.value === 'trainer' ? trainerForm : form
    if (profile.name) target.name = profile.name.trim()
    if (profile.email) target.email = profile.email.trim().toLowerCase()
  } catch {
    googleProfileStatus.value = 'Não consegui ler os dados da conta Google. Tente novamente ou preencha manualmente.'
  }
}

async function renderGoogleButton(target: 'client' | 'trainer' = 'client') {
  const container = googleButtonContainer.value
  if (!container) return
  try {
    googleProfileTarget.value = target
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

watch(showRequestForm, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton('client')
})

watch(showTrainerSignup, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton('trainer')
}, { immediate: true })

window.addEventListener('hashchange', () => {
  showTrainerSignup.value = window.location.hash === '#cadastro-personal'
})

function closeTrainerSignup() {
  showTrainerSignup.value = false
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  trainerStatus.value = ''
}

function toggleTrainerCity(city: string) {
  const index = trainerForm.cities.indexOf(city)
  if (index >= 0) {
    trainerForm.cities.splice(index, 1)
  } else if (trainerForm.cities.length < 2) {
    trainerForm.cities.push(city)
  }
}

function normalizeBrazilianPhone(value: string) {
  let digits = value.replace(/\D/g, '').replace(/^0/, '')
  if (!digits.startsWith('55')) digits = `55${digits}`
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? `+${digits}` : ''
}

function normalizeInstagramHandle(value: string) {
  let handle = value.trim()
  if (!handle) return ''
  if (/^(?:www\.)?instagram\.com\//i.test(handle)) handle = `https://${handle}`
  if (/^https?:\/\//i.test(handle)) {
    try {
      const profileUrl = new URL(handle)
      if (!['instagram.com', 'www.instagram.com'].includes(profileUrl.hostname.toLowerCase())) return ''
      handle = profileUrl.pathname.replace(/^\/+|\/+$/g, '')
    } catch {
      return ''
    }
  }
  handle = handle.replace(/^@/, '')
  return /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : ''
}

function suggestTrainerSlug() {
  if (trainerForm.slug.trim()) return
  trainerForm.slug = trainerForm.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

async function sendTrainerSignup() {
  if (trainerSubmitting.value) return
  trainerStatus.value = ''
  trainerVerificationLink.value = ''
  const name = trainerForm.name.trim().replace(/\s+/g, ' ')
  const slug = trainerForm.slug.trim().toLowerCase()
  const phone = normalizeBrazilianPhone(trainerForm.phone)
  const email = trainerForm.email.trim().toLowerCase()
  const instagram = normalizeInstagramHandle(trainerForm.instagram)
  const cref = trainerForm.cref.trim()
  const reservedSlugs = ['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda']
  let validationError = ''
  if (!name) validationError = 'Informe seu nome completo.'
  else if (!phone) validationError = 'Informe um WhatsApp válido com DDD.'
  else if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) || reservedSlugs.includes(slug)) {
    validationError = 'O subdomínio deve ter de 3 a 40 caracteres, usando letras minúsculas, números ou hífen.'
  } else if (trainerForm.cities.length < 1 || trainerForm.cities.length > 2) {
    validationError = 'Escolha uma ou duas cidades de atuação.'
  } else if (!instagram) {
    validationError = 'Informe um Instagram válido: @usuario, usuario ou instagram.com/usuario.'
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    validationError = 'Confira o endereço de e-mail ou deixe o campo vazio.'
  } else if (cref && !/^[\p{L}\p{M}0-9 .\/-]{1,40}$/u.test(cref)) {
    validationError = 'Confira o CREF ou deixe o campo vazio.'
  }
  if (validationError) {
    trainerStatus.value = validationError
    return
  }

  trainerSubmitting.value = true
  trainerStatus.value = 'Salvando seu cadastro…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/trainers/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, slug, whatsapp: phone, ...(email ? { email } : {}), cities: trainerForm.cities, instagram, ...(cref ? { cref } : {}) }),
    })
    const body = await response.json() as { registered?: boolean; error?: string; slug?: string; verificationCode?: string }
    if (!response.ok || body.registered !== true) {
      throw new Error(body.error || 'Não foi possível registrar seu cadastro agora.')
    }
    if (!body.verificationCode) throw new Error('Cadastro recebido, mas não foi possível gerar o código de confirmação. Tente novamente.')
    const message = `Confirmar personal Fitpeso ${body.verificationCode}`
    trainerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
    trainerStatus.value = `Cadastro salvo. Envie a confirmação pelo WhatsApp em até 15 minutos. Após confirmar, seu perfil será ativado em https://${body.slug || slug}.fitpeso.com.br.`
  } catch (error) {
    trainerStatus.value = error instanceof Error ? error.message : 'Não foi possível registrar seu cadastro agora.'
  } finally {
    trainerSubmitting.value = false
  }
}

function adjustMeasurement(field: 'weight' | 'height' | 'waist', amount: number) {
  const minimum = field === 'weight' ? 50 : field === 'height' ? 140 : 40
  const maximum = field === 'weight' ? 150 : field === 'height' ? 190 : 160
  const nextValue = Math.max(minimum, Math.min(maximum, Number(form[field]) + amount))
  form[field] = String(nextValue)
}

function calculateImc() {
  if (evaluating.value) return
  status.value = ''

  clearContactDetails()

  const weight = Number(form.weight)
  const heightCm = Number(form.height)
  if (!Number.isInteger(weight) || weight < 50 || weight > 150 ||
      !Number.isInteger(heightCm) || heightCm < 140 || heightCm > 190) {
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
  viewMode.value = 'assessment'
}

type AmplifyRuntimeOutputs = { custom?: { imcApi?: { endpoint?: string } } }

async function getRequestApiEndpoint() {
  const outputResponse = await fetch('/amplify_outputs.json', { cache: 'no-store' })
  if (!outputResponse.ok) throw new Error('A validação ainda não está disponível. Tente novamente mais tarde.')
  const outputs = await outputResponse.json() as AmplifyRuntimeOutputs
  const endpoint = outputs.custom?.imcApi?.endpoint?.trim()
  if (!endpoint) throw new Error('A validação ainda não está disponível. Tente novamente mais tarde.')
  return endpoint.replace(/\/+$/, '')
}

async function loadTrainerProfile() {
  if (!trainerIdFromPath && !trainerSlugFromHost) return
  try {
    const endpoint = await getRequestApiEndpoint()
    const profilePath = trainerSlugFromHost
      ? `/api/trainers/by-slug/${encodeURIComponent(trainerSlugFromHost)}`
      : `/api/trainers/${encodeURIComponent(trainerIdFromPath)}`
    const response = await fetch(`${endpoint}${profilePath}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Trainer profile unavailable')
    const body = await response.json() as { trainer?: { name?: unknown; whatsapp?: unknown } }
    const name = typeof body.trainer?.name === 'string' ? body.trainer.name.trim() : ''
    const whatsapp = typeof body.trainer?.whatsapp === 'string' ? body.trainer.whatsapp.replace(/\D/g, '') : ''
    if (!name || !/^55[1-9]{2}9?\d{8}$/.test(whatsapp)) throw new Error('Invalid trainer profile')
    const firstName = name.split(/\s+/)[0]
    personalName.value = `${firstName} Personal Trainer`
    trainerWhatsApp.value = whatsapp
  } catch {
    trainerProfileFailed.value = true
  }
}

function trainerWhatsAppLink() {
  if (!trainerWhatsApp.value) return ''
  const firstName = personalName.value.replace(/\s+Personal Trainer$/, '')
  const text = `Olá, ${firstName}! Encontrei sua calculadora de IMC.`
  return `https://wa.me/${trainerWhatsApp.value}?text=${encodeURIComponent(text)}`
}

async function openRequestForm() {
  status.value = ''
  showRequestForm.value = true
  viewMode.value = 'contact'
  await nextTick()
  document.getElementById('contact-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => { void loadTrainerProfile() })

async function createRequestCode(request: Record<string, unknown>) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/imc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  const body = await response.json() as {
    sent?: boolean
    error?: string
    eligibleProfessionals?: number
    notifiedProfessionals?: number
    professionalLookupFailed?: boolean
  }
  if (!response.ok || body.sent !== true) {
    throw new Error(body.error || 'Não foi possível preparar a solicitação agora. Tente novamente.')
  }
  return {
    eligibleProfessionals: body.eligibleProfessionals ?? 0,
    notifiedProfessionals: body.notifiedProfessionals ?? 0,
    professionalLookupFailed: body.professionalLookupFailed ?? false,
  }
}

async function sendResult() {
  if (!form.shareContactConsent || submittingRequest.value) return
  status.value = ''

  const clientName = form.name.trim().replace(/\s+/g, ' ')
  const phone = form.phone.trim()
  const phoneDigits = phone.replace(/\D/g, '').replace(/^0/, '')
  const email = form.email.trim().toLowerCase()
  const city = form.city.trim().replace(/\s+/g, ' ')
  const ageInput = String(form.age).trim()
  const age = ageInput ? Number(ageInput) : undefined
  const validName = clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
  const validCity = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'].includes(city)
  const validAge = age === undefined || (Number.isInteger(age) && age >= 1 && age <= 120)
  const normalizedPhoneDigits = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`
  const validPhone = /^55[1-9]{2}9?\d{8}$/.test(normalizedPhoneDigits)

  if (!validName || !validCity || !validAge || !validPhone) {
    status.value = 'Confira o nome, o WhatsApp com DDD e a cidade. Se informar a idade, use um valor entre 1 e 120 anos.'
    return
  }

  const trainingDays = form.provideAvailability ? form.trainingDays : []
  const trainingShifts = form.provideAvailability ? form.trainingShifts : []

  submittingRequest.value = true
  status.value = 'Enviando sua solicitação para a Beta…'

  try {
    await createRequestCode({
      clientName,
      clientPhone: `+${normalizedPhoneDigits}`,
      ...(email ? { email } : {}),
      ...(age !== undefined ? { age } : {}),
      city,
      objective: form.objective,
      trainingDays,
      trainingShifts,
      consent: form.shareContactConsent,
    })
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível preparar a solicitação agora.'
    submittingRequest.value = false
    return
  }

  status.value = ''
  requestSent.value = true
  submittingRequest.value = false
}
</script>

<template>
  <main class="page-shell">
    <section v-if="showTrainerSignup" class="calculator" aria-labelledby="page-title">
      <div class="theme-switch" role="group" aria-label="Aparência do aplicativo">
        <button type="button" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">☀ Claro</button>
        <button type="button" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">☾ Escuro</button>
      </div>
      <header class="hero">
        <div class="brand" :aria-label="personalName">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" /><path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" /></svg>
          <span>{{ personalName }}</span>
        </div>
        <hr class="personal-divider">
        <h1 id="page-title">Cadastro de personal</h1>
        <p class="intro">Preencha seus dados para receber solicitações de usuários. Confirme o WhatsApp informado para ativar seu perfil.</p>
      </header>

      <form class="form contact-fields trainer-signup-form" @submit.prevent="sendTrainerSignup">
        <div class="google-fill field-wide trainer-contact-reminder">
          <p>Antes de enviar o cadastro, baixe e salve o cartão de contato da Beta para receber o retorno.</p>
          <a class="trainer-contact-card" href="https://drive.usercontent.google.com/download?id=1itlX4W0doax1jYpc7GkGa-hM2v8rZ98l&amp;export=download" download="Beta.vcf">Baixar cartão de contato da Beta</a>
          <small>WhatsApp: +55 21 97111-8383</small>
        </div>
        <div class="google-fill field-wide">
          <p>Complete nome e e-mail com sua conta Google</p>
          <div ref="googleButtonContainer" class="google-button-container"></div>
          <small v-if="googleProfileStatus" role="status" aria-live="polite">{{ googleProfileStatus }}</small>
        </div>
        <label class="field field-wide" for="trainer-name"><span class="field-label">Nome completo</span>
          <input id="trainer-name" v-model="trainerForm.name" name="trainerName" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome completo" @blur="suggestTrainerSlug" required>
        </label>
        <label class="field field-wide" for="trainer-slug"><span class="field-label">Endereço do seu perfil</span>
          <input id="trainer-slug" v-model="trainerForm.slug" name="trainerSlug" type="text" autocapitalize="none" maxlength="40" pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])" placeholder="joao-silva" required>
          <small>Seu perfil será ativado em https://{{ trainerForm.slug || 'seu-identificador' }}.fitpeso.com.br após a confirmação do WhatsApp.</small>
        </label>
        <label class="field field-wide" for="trainer-phone"><span class="field-label">Telefone</span>
          <input id="trainer-phone" v-model="trainerForm.phone" name="trainerPhone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(21) 99999-9999" required>
        </label>
        <label class="field field-wide" for="trainer-email"><span class="field-label">E-mail <span>opcional</span></span>
          <input id="trainer-email" v-model="trainerForm.email" name="trainerEmail" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com">
        </label>
        <fieldset class="availability-group field-wide trainer-city-group">
          <legend>Cidades de atuação <span>(escolha de 1 a 2)</span></legend>
          <div class="availability-options">
            <label v-for="city in availableCities" :key="city" class="availability-option">
              <input type="checkbox" :checked="trainerForm.cities.includes(city)" :disabled="!trainerForm.cities.includes(city) && trainerForm.cities.length >= 2" @change="toggleTrainerCity(city)">
              <span>{{ city }}</span>
            </label>
          </div>
        </fieldset>
        <label class="field field-wide" for="trainer-instagram"><span class="field-label">Perfil do Instagram</span>
          <input id="trainer-instagram" v-model="trainerForm.instagram" name="instagram" type="text" autocomplete="url" maxlength="100" placeholder="@seuperfil ou instagram.com/seuperfil" required>
        </label>
        <label class="field field-wide" for="trainer-cref"><span class="field-label">Registro do conselho de Educação Física <span>opcional</span></span>
          <input id="trainer-cref" v-model="trainerForm.cref" name="cref" type="text" maxlength="40" placeholder="Ex.: CREF 000000-G/RJ">
        </label>
        <button class="primary-button field-wide" type="submit" :disabled="trainerSubmitting">
          {{ trainerSubmitting ? 'Salvando cadastro…' : 'Enviar cadastro' }} <span aria-hidden="true">→</span>
        </button>
        <p v-if="trainerStatus" class="status field-wide" role="status" aria-live="polite">{{ trainerStatus }}</p>
        <a v-if="trainerVerificationLink" class="primary-button field-wide" :href="trainerVerificationLink" target="_blank" rel="noopener noreferrer">Confirmar WhatsApp com a Beta <span aria-hidden="true">→</span></a>
      </form>
      <button class="back-button" type="button" @click="closeTrainerSignup">Voltar à calculadora</button>
    </section>

    <section v-else class="calculator" aria-labelledby="page-title">
      <div class="theme-switch" role="group" aria-label="Aparência do aplicativo">
        <button type="button" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">☀ Claro</button>
        <button type="button" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">☾ Escuro</button>
      </div>
      <header class="hero">
        <div class="brand" :aria-label="personalName">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
            <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
          </svg>
          <span>{{ personalName }}</span>
          <a
            v-if="trainerWhatsApp"
            class="trainer-whatsapp-link"
            :href="trainerWhatsAppLink()"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Falar com ${personalName} pelo WhatsApp`"
            title="Falar no WhatsApp"
          >
            <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15"/><path d="M23.3 20.7c-.4-.2-2.2-1.1-2.5-1.2-.3-.1-.6-.2-.8.2-.2.4-1 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.6.1-.2 0-.5 0-.6-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.5-.3.4-1.2 1.2-1.2 3s1.3 3.5 1.5 3.8c.2.2 2.5 3.9 6.1 5.4.9.4 1.6.6 2.1.7.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.7.3-.8.3-1.5.2-1.7-.1-.1-.4-.3-.8-.5z"/></svg>
          </a>
        </div>
        <p v-if="(trainerIdFromPath || trainerSlugFromHost) && trainerProfileFailed" class="trainer-profile-status" role="status">Não foi possível localizar o personal.</p>
        <hr class="personal-divider">
        <h1 id="page-title">
          <svg class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="4" width="28" height="32" rx="6" />
            <rect x="12" y="9" width="16" height="8" rx="2" />
            <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
          </svg>
          <span>{{ result ? 'Resultado da avaliação' : viewMode === 'home' ? 'Como podemos ajudar?' : viewMode === 'contact' ? 'Encontrar personal' : form.calculateBodyFat ? 'IMC e gordura corporal' : 'Avaliar meu peso' }}</span>
        </h1>
        <p v-if="viewMode === 'contact'" class="intro">Preencha seus dados para solicitar contato de um personal.</p>
        <p v-else-if="viewMode === 'home'" class="intro">Escolha uma opção para continuar.</p>
        <p v-else-if="!result" class="intro">Informe suas medidas para fazer uma avaliação.</p>
      </header>

      <div v-if="viewMode === 'home' && !result" class="home-actions">
        <div class="home-action">
          <p>Descubra quanto falta pra chegar no peso adequado.</p>
          <button class="primary-button" type="button" @click="viewMode = 'assessment'">Avaliar meu peso <span aria-hidden="true">→</span></button>
        </div>
        <div class="home-action">
          <button class="secondary-button" type="button" @click="openRequestForm">Encontrar profissionais disponíveis <span aria-hidden="true">→</span></button>
        </div>
      </div>

      <form v-if="viewMode === 'assessment' && !result" class="form" @submit.prevent="calculateImc">
        <div class="gender-tabs field-wide" role="tablist" aria-label="Selecione uma escala corporal">
          <button id="tab-woman" class="gender-tab" :class="{ active: form.sex === 'feminino' }" type="button" role="tab" :aria-selected="form.sex === 'feminino'" aria-controls="measurement-panel" @click="form.sex = 'feminino'">Mulher</button>
          <button id="tab-man" class="gender-tab" :class="{ active: form.sex === 'masculino' }" type="button" role="tab" :aria-selected="form.sex === 'masculino'" aria-controls="measurement-panel" @click="form.sex = 'masculino'">Homem</button>
        </div>
        <div id="measurement-panel" class="measurement-fields field-wide" role="tabpanel" :aria-labelledby="form.sex === 'feminino' ? 'tab-woman' : 'tab-man'">
        <label class="field slider-field" for="weight"><span class="slider-heading"><span class="field-label">Peso <span>kg</span></span><output for="weight">{{ Number(form.weight).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} kg</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir peso" :disabled="Number(form.weight) <= 50" @click="adjustMeasurement('weight', -1)">−</button>
            <input id="weight" v-model="form.weight" class="range-input" name="weight" type="range" min="50" max="150" step="1" aria-label="Peso em quilogramas">
            <button class="slider-adjust" type="button" aria-label="Aumentar peso" :disabled="Number(form.weight) >= 150" @click="adjustMeasurement('weight', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>50 kg</span><span>150 kg</span></span>
        </label>

        <label class="field slider-field" for="height"><span class="slider-heading"><span class="field-label">Altura <span>cm</span></span><output for="height">{{ Number(form.height).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} cm</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir altura" :disabled="Number(form.height) <= 140" @click="adjustMeasurement('height', -1)">−</button>
            <input id="height" v-model="form.height" class="range-input" name="height" type="range" min="140" max="190" step="1" aria-label="Altura em centímetros">
            <button class="slider-adjust" type="button" aria-label="Aumentar altura" :disabled="Number(form.height) >= 190" @click="adjustMeasurement('height', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>140 cm</span><span>190 cm</span></span>
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
        <button class="back-button field-wide" type="button" @click="viewMode = 'home'; status = ''">Voltar</button>
        </div>
      </form>

      <section v-else-if="viewMode === 'assessment' && result" id="result" class="result-card" aria-live="polite">
        <div class="result-heading">
          <h2>
            {{ classification }} {{ classificationEmoji }}<template v-if="weightGoalAmount !== null">: {{ weightGoalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg {{ result.imc < 18.5 ? 'a ganhar' : 'a perder' }}</template>
          </h2>
        </div>

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

        <button class="primary-button field-wide" type="button" @click="openRequestForm">Encontrar personal <span aria-hidden="true">→</span></button>
        <button class="back-button" type="button" @click="editMeasurement">Nova avaliação</button>
      </section>

      <form v-if="viewMode === 'contact' && showRequestForm" id="contact-fields" class="form contact-fields request-form" @submit.prevent="sendResult">
        <h2 class="field-wide request-form-title">Solicitar contato de um personal</h2>
        <div class="google-fill field-wide">
          <p>Preencha nome e e-mail com sua conta Google</p>
          <div ref="googleButtonContainer" class="google-button-container"></div>
          <small v-if="googleProfileStatus" role="status" aria-live="polite">{{ googleProfileStatus }}</small>
        </div>
        <label class="field field-wide" for="name"><span class="field-label">Nome</span>
          <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome" required>
        </label>

        <label class="field field-wide" for="phone"><span class="field-label">WhatsApp com DDD</span>
          <input id="phone" v-model="form.phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(21) 99999-9999" required>
        </label>

        <label class="field field-wide" for="email"><span class="field-label">E-mail <span>opcional</span></span>
          <input id="email" v-model="form.email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com">
        </label>

        <label class="field" for="age"><span class="field-label">Idade <span>anos</span></span>
          <input id="age" v-model="form.age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Ex.: 35">
        </label>

        <label class="field field-wide" for="city"><span class="field-label">Cidade</span>
          <select id="city" v-model="form.city" name="city" autocomplete="address-level2" required>
            <option value="" disabled>Selecione sua cidade</option>
            <option value="Mesquita">Mesquita</option>
            <option value="Nilópolis">Nilópolis</option>
            <option value="Nova Iguaçu">Nova Iguaçu</option>
            <option value="Rio de Janeiro">Rio de Janeiro</option>
          </select>
        </label>

        <label class="field field-wide" for="objective"><span class="field-label">Objetivo <span>opcional</span></span>
          <select id="objective" v-model="form.objective" name="objective">
            <option value="">Selecione seu objetivo</option>
            <option value="Emagrecimento">Emagrecimento</option>
            <option value="Musculação">Musculação</option>
            <option value="Outros">Outros</option>
          </select>
        </label>

        <label class="contact-opt-in field-wide availability-toggle" for="provide-availability">
          <input id="provide-availability" v-model="form.provideAvailability" name="provideAvailability" type="checkbox">
          <span>Informar disponibilidade para treino</span>
        </label>

        <fieldset v-if="form.provideAvailability" class="availability-group field-wide">
          <legend>Disponibilidade para treinar — dias da semana</legend>
          <div class="availability-options">
            <label v-for="day in trainingDayOptions" :key="day.value" class="availability-option">
              <input v-model="form.trainingDays" type="checkbox" name="trainingDays" :value="day.value">
              <span>{{ day.label }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset v-if="form.provideAvailability" class="availability-group field-wide">
          <legend>Turno</legend>
          <div class="availability-options">
            <label v-for="shift in trainingShiftOptions" :key="shift" class="availability-option">
              <input v-model="form.trainingShifts" type="checkbox" name="trainingShifts" :value="shift">
              <span>{{ shift }}</span>
            </label>
          </div>
        </fieldset>

        <label class="contact-opt-in field-wide availability-toggle" for="share-contact-consent">
          <input id="share-contact-consent" v-model="form.shareContactConsent" name="shareContactConsent" type="checkbox" required>
          <span>Autorizo o compartilhamento do meu contato.</span>
        </label>

        <button class="primary-button field-wide" type="submit" :disabled="submittingRequest">
          {{ submittingRequest ? 'Enviando solicitação…' : 'Enviar solicitação' }} <span aria-hidden="true">→</span>
        </button>
        <button class="back-button field-wide" type="button" @click="showRequestForm = false; viewMode = 'home'; status = ''">Voltar</button>
      </form>

      <div v-if="evaluating" class="evaluation-overlay" role="status" aria-live="polite" :aria-label="`Avaliando: ${evaluationProgress}%`">
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <div v-if="requestSent" class="success-overlay" role="presentation" @click.self="requestSent = false; status = ''">
        <section class="success-dialog" role="dialog" aria-modal="true" aria-labelledby="request-sent-title">
          <div class="success-mark" aria-hidden="true">✓</div>
          <h2 id="request-sent-title">Solicitação enviada!</h2>
          <p>Aguarde o contato da equipe Fitpeso.</p>
          <button class="primary-button" type="button" @click="requestSent = false; status = ''; showRequestForm = false; viewMode = 'home'">Entendi</button>
        </section>
      </div>
    </section>
    <footer><img :src="foxMark" alt=""><a href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20sou%20personal.%20Me%20interessei%20pelo%20fitpeso%2C%20como%20funciona%20%3F" target="_blank" rel="noopener noreferrer">Beta Soluções IA</a></footer>
    <a
      v-if="!showTrainerSignup && viewMode === 'home'"
      class="trainer-signup-link"
      href="#cadastro-personal"
      @click="showTrainerSignup = true"
    >Sou personal. Quero me cadastrar</a>
  </main>
</template>
