<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import silhouetteScaleImage from './assets/female-bmi-silhouette-scale.jpg'
import maleSilhouetteScaleImage from './assets/male-bmi-silhouette-scale.jpg'
import rootHomePersonalImage from './assets/root-home-personal.jpg'

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
    return localStorage.getItem('beta-imc-theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
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
  if (slug.includes('.') || ['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda', 'develop', 'test', 'homologacao'].includes(slug)) return ''
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? slug : ''
}

type TrainerRequestDetails = {
  clientName: string
  age?: number
  city: string
  objective?: string
  desiredDuration?: string
  attendsGym: boolean
  gymName?: string
  trainingDays: string[]
  trainingShifts: string[]
  validUntil: number
  proposalAlreadySent?: boolean
}

type EligibleTrainer = { trainerId: string; name: string; slug: string; instagram?: string }
type CustomerProposal = { trainerId: string; name: string; whatsapp: string; instagram?: string; monthlyPrice: number; message: string; status: string; validUntil: number; expired: boolean }
type TrainerReceivedRequest = { requestId: string; clientName: string; city: string; objective?: string; createdAt: string; validUntil: number; lifecycle: string; token: string }
type EditableProfile = { name: string; whatsapp: string; email: string; dateOfBirth: string; instagram: string; cref: string; slug: string }
type TrainerAccountProfile = { trainerId: string; name: string; whatsapp: string; email?: string; dateOfBirth?: string; instagram?: string; cref?: string; sex?: string; slug?: string }
type CustomerRequest = { requestId: string; city: string; objective?: string; lifecycle: string; proposalCount: number; validUntil: number; requestExpired?: boolean; acceptedAt?: string; proposals: CustomerProposal[] }

const trainerRequestToken = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
const trainerIdFromPath = getTrainerIdFromPath()
const trainerSlugFromHost = getTrainerSlugFromHost()
const isRootHome = window.location.pathname === '/' && !trainerIdFromPath && !trainerSlugFromHost
const personalName = ref('FitPeso')
const personalBrandFirstName = computed(() => personalName.value.endsWith(' Personal Trainer') ? personalName.value.slice(0, -' Personal Trainer'.length) : '')
const showHomeTopbar = computed(() => viewMode.value === 'home' && !result.value && (isRootHome || Boolean(trainerSlugFromHost)))
const trainerProfileFailed = ref(false)
const availableCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
const viewMode = ref<'home' | 'assessment' | 'contact' | 'trainer-request' | 'customer-requests' | 'trainer-requests' | 'my-profile'>(trainerRequestToken ? 'trainer-request' : 'home')
const trainerRequest = ref<TrainerRequestDetails | null>(null)
const trainerProposalPrice = ref('')
const trainerProposalMessage = ref('')
const trainerProposalSubmitting = ref(false)
const trainerRequestStatus = ref(trainerRequestToken ? 'Carregando solicitação…' : '')
const showRequestForm = ref(false)
const requestSent = ref(false)
const requestStep = ref(1)
const eligibleTrainers = ref<EligibleTrainer[]>([])
const selectedTrainerIds = ref<string[]>([])
const checkingTrainers = ref(false)
const customerRequests = ref<CustomerRequest[]>([])
const customerRequestsStatus = ref('')
const requestVerificationLink = ref('')
const showTrainerSignup = ref(window.location.hash === '#cadastro-personal')
const showCustomerSignup = ref(window.location.hash === '#cadastro-cliente')
const showCustomerLogin = ref(false)
const loginAsTrainer = ref(false)
const customerForm = reactive({ name: '', whatsapp: '', email: '', dateOfBirth: '' })
const signupContact = ref('')
const signupStep = ref<1 | 2>(1)
const requestBirthDate = ref('')
const customerStatus = ref('')
const customerVerificationLink = ref('')
const customerVerificationCode = ref('')
const customerVerificationComplete = ref(false)
const customerSubmitting = ref(false)
let customerVerificationPollTimer: number | undefined
let customerVerificationPollStartedAt = 0
const trainerForm = reactive({
  name: '',
  sex: '' as '' | 'masculino' | 'feminino',
  slug: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  cities: [] as string[],
  instagram: '',
  cref: '',
})
const trainerStatus = ref('')
const trainerVerificationLink = ref('')
const trainerSubmitting = ref(false)
const googleProfileTarget = ref<'client' | 'trainer' | 'customer'>('client')
const customerLoginStatus = ref('')
const customerLoginError = ref('')
const customerLoginMethod = ref<'google' | 'whatsapp'>('google')
const loginIdentifier = ref('')
const loginStep = ref<1 | 2>(1)
const loginIdentifierKind = ref<'whatsapp' | 'email'>('whatsapp')
const emailLoginPending = ref(false)
const emailLoginSubmitting = ref(false)
const emailLoginError = ref('')
const emailLoginSessionToken = ref('')
let emailLoginPollTimer: number | undefined
let emailLoginStartedAt = 0
const customerLoginWhatsApp = ref('')
const customerLoginCode = ref('')
const customerLoginSessionToken = ref('')
const customerLoginVerificationLink = ref('')
const showCustomerLoginDialog = ref(false)
const customerLoginSubmitting = ref(false)
let customerLoginPollTimer: number | undefined
let customerLoginPollStartedAt = 0
const customerSignedInName = ref('')
const trainerSignedInName = ref('')
const trainerSignedInId = ref('')
const editingProfile = reactive<EditableProfile>({ name: '', whatsapp: '', email: '', dateOfBirth: '', instagram: '', cref: '', slug: '' })
const editingProfileType = ref<'customer' | 'trainer'>('customer')
const editingProfileStatus = ref('')
const editingProfileLoading = ref(false)
const editingProfileSaving = ref(false)
const trainerLoginCode = ref('')
const trainerLoginToken = ref('')
const trainerLoginStatus = ref('')
const trainerLoginError = ref('')
const trainerLoginLink = ref('')
const trainerLoginDialog = ref(false)
const trainerLoginSubmitting = ref(false)
const trainerReceivedRequests = ref<TrainerReceivedRequest[]>([])
const trainerRequestsStatus = ref('')
let trainerLoginPollTimer: number | undefined
let trainerLoginStartedAt = 0
let sessionGeneration = 0
const requestLoginReturn = ref(false)
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
  city: '',
  trainerGenderPreference: 'indiferente' as 'indiferente' | 'feminino' | 'masculino',
  desiredDuration: '',
  attendsGym: false,
  gymName: '',
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
  form.city = ''
  form.trainingDays = []
  form.trainingShifts = []
  googleProfileStatus.value = ''
}

function applyCustomerProfile(profile: { name: string; whatsapp: string; email: string; dateOfBirth?: string }) {
  form.name = profile.name
  form.phone = profile.whatsapp
  form.email = profile.email
  if (profile.dateOfBirth) {
    const birth = new Date(`${profile.dateOfBirth}T00:00:00`)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
    form.age = String(age)
  }
  customerForm.name = profile.name
  customerForm.whatsapp = profile.whatsapp
  customerForm.email = profile.email
  customerForm.dateOfBirth = profile.dateOfBirth ?? ''
  if (profile.dateOfBirth) requestBirthDate.value = profile.dateOfBirth
  customerSignedInName.value = profile.name
  trainerSignedInName.value = ''
  trainerSignedInId.value = ''
  try { sessionStorage.removeItem('fitpeso-trainer-session') } catch { /* armazenamento indisponível */ }
}

async function loadCustomerProfile(token: string) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/customers/profile`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const body = await response.json() as {
    authenticated?: boolean
    profile?: { name: string; whatsapp: string; email: string; dateOfBirth?: string }
    error?: string
  }
  if (!response.ok || body.authenticated !== true || !body.profile) {
    throw new Error(body.error || 'Não foi possível carregar seu cadastro.')
  }
  return body.profile
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

async function fillFromGoogle(response: GoogleCredentialResponse) {
  if (googleProfileTarget.value === 'client') {
    customerLoginStatus.value = 'Validando sua conta e buscando seu cadastro…'
    googleProfileStatus.value = ''
    try {
      const profile = await loadCustomerProfile(response.credential)
      sessionStorage.setItem('fitpeso-google-session', response.credential)
      applyCustomerProfile(profile)
      customerLoginStatus.value = `Conectado como ${profile.email}. Seus dados foram preenchidos.`
      googleProfileStatus.value = 'Cadastro carregado. Confira a disponibilidade e os dados antes de enviar.'
      showCustomerLogin.value = false
      await returnToRequestFormAfterLogin()
    } catch (error) {
      customerLoginStatus.value = error instanceof Error ? error.message : 'Não foi possível entrar com o Google.'
      googleProfileStatus.value = customerLoginStatus.value
      try { sessionStorage.removeItem('fitpeso-google-session') } catch { /* Storage pode estar desativado. */ }
    }
    return
  }
  try {
    const payloadPart = response.credential.split('.')[1]
    if (!payloadPart) throw new Error('Credencial Google inválida.')
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const profile = JSON.parse(new TextDecoder().decode(bytes)) as { name?: string; email?: string }
    if (!profile.name && !profile.email) throw new Error('O Google não retornou nome ou e-mail.')
    const target = googleProfileTarget.value === 'trainer' ? trainerForm : googleProfileTarget.value === 'customer' ? customerForm : form
    if (profile.name) target.name = profile.name.trim()
    if (profile.email) {
      target.email = profile.email.trim().toLowerCase()
    }
  } catch {
    googleProfileStatus.value = 'Não consegui ler os dados da conta Google. Tente novamente ou preencha manualmente.'
  }
}

async function renderGoogleButton(target: 'client' | 'trainer' | 'customer' = 'client') {
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

watch(showCustomerLogin, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton('client')
})

watch(showTrainerSignup, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton('trainer')
}, { immediate: true })

watch(showCustomerSignup, async enabled => {
  if (!enabled) return
  await nextTick()
  await renderGoogleButton('customer')
}, { immediate: true })

window.addEventListener('hashchange', () => {
  showTrainerSignup.value = window.location.hash === '#cadastro-personal'
  showCustomerSignup.value = window.location.hash === '#cadastro-cliente'
})

function logout() {
  sessionGeneration += 1 // Invalida respostas de restauração de sessão ainda pendentes.
  // Remove todas as sessões locais, inclusive quando cliente e personal compartilham o WhatsApp.
  try {
    sessionStorage.removeItem('fitpeso-customer-session')
    sessionStorage.removeItem('fitpeso-google-session')
    sessionStorage.removeItem('fitpeso-trainer-session')
  } catch {
    // Ainda encerra a sessão em memória quando o armazenamento não estiver disponível.
  }

  customerSignedInName.value = ''
  trainerSignedInId.value = ''
  trainerSignedInName.value = ''
  loginAsTrainer.value = false
  customerLoginMethod.value = 'google'
  loginStep.value = 1
  loginIdentifier.value = ''
  emailLoginPending.value = false
  emailLoginError.value = ''
  emailLoginSessionToken.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
  customerLoginWhatsApp.value = ''
  customerLoginCode.value = ''
  customerLoginSessionToken.value = ''
  customerLoginVerificationLink.value = ''
  customerLoginStatus.value = ''
  customerLoginError.value = ''
  trainerLoginCode.value = ''
  trainerLoginToken.value = ''
  trainerLoginLink.value = ''
  trainerLoginStatus.value = ''
  trainerLoginError.value = ''
  customerRequests.value = []
  customerRequestsStatus.value = ''
  trainerReceivedRequests.value = []
  trainerRequestsStatus.value = ''
  editingProfileStatus.value = ''
  editingProfileLoading.value = false
  editingProfileSaving.value = false
  editingProfile.name = ''
  editingProfile.whatsapp = ''
  editingProfile.email = ''
  editingProfile.dateOfBirth = ''
  editingProfile.instagram = ''
  editingProfile.cref = ''
  editingProfile.slug = ''
  customerForm.name = ''
  customerForm.whatsapp = ''
  customerForm.email = ''
  customerForm.dateOfBirth = ''
  signupStep.value = 1
  signupContact.value = ''
  requestBirthDate.value = ''
  clearContactDetails()
  goHome()
}

function goHome() {
  showTrainerSignup.value = false
  showCustomerSignup.value = false
  showCustomerLogin.value = false
  loginStep.value = 1
  emailLoginPending.value = false
  emailLoginError.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
  if (trainerLoginPollTimer !== undefined) window.clearTimeout(trainerLoginPollTimer)
  trainerLoginPollTimer = undefined
  trainerLoginDialog.value = false
  showRequestForm.value = false
  viewMode.value = 'home'
  requestSent.value = false
  requestVerificationLink.value = ''
  requestLoginReturn.value = false
  result.value = null
  status.value = ''
  customerLoginStatus.value = ''
  googleProfileStatus.value = ''
  if (customerVerificationPollTimer !== undefined) window.clearTimeout(customerVerificationPollTimer)
  customerVerificationPollTimer = undefined
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginPollTimer = undefined
  showCustomerLoginDialog.value = false
  history.replaceState(null, '', window.location.pathname)
  void nextTick(() => window.scrollTo(0, 0))
}

function closeCustomerSignup() {
  if (customerVerificationPollTimer !== undefined) window.clearTimeout(customerVerificationPollTimer)
  customerVerificationPollTimer = undefined
  customerStatus.value = ''
  customerVerificationLink.value = ''
  customerVerificationCode.value = ''
  if (requestLoginReturn.value && customerVerificationComplete.value) {
    customerVerificationComplete.value = false
    showCustomerSignup.value = false
    showCustomerLogin.value = true
    showRequestForm.value = true
    viewMode.value = 'contact'
    requestStep.value = 4
    customerLoginMethod.value = 'whatsapp'
    customerLoginStatus.value = 'Cadastro confirmado. Entre para retornar à revisão da solicitação.'
    history.replaceState(null, '', window.location.pathname)
    void nextTick(() => window.scrollTo(0, 0))
    return
  }
  customerVerificationComplete.value = false
  goHome()
}

function scheduleCustomerVerificationPoll(delayMs = 10_000) {
  if (customerVerificationPollTimer !== undefined) window.clearTimeout(customerVerificationPollTimer)
  customerVerificationPollTimer = window.setTimeout(() => void pollCustomerVerification(), delayMs)
}

async function pollCustomerVerification() {
  if (!customerVerificationCode.value || !customerForm.whatsapp || customerVerificationComplete.value) return
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/verification-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: customerVerificationCode.value, whatsapp: customerForm.whatsapp }),
    })
    const body = await response.json() as { verified?: boolean; expired?: boolean; name?: string; error?: string }
    if (response.ok && body.verified === true) {
      customerVerificationComplete.value = true
      if (body.name?.trim()) customerForm.name = body.name.trim()
      customerStatus.value = `WhatsApp confirmado! ${body.name?.trim() ? `Bem-vindo(a), ${body.name.trim().split(/\s+/)[0]}!` : 'Cadastro ativo.'}`
      return
    }
    if (response.ok && body.expired) {
      customerStatus.value = 'O link de confirmação expirou. Volte ao formulário e inicie o cadastro novamente.'
      customerVerificationLink.value = ''
      return
    }
  } catch {
    // Falhas momentâneas de rede não interrompem a verificação automática.
  }
  if (Date.now() - customerVerificationPollStartedAt >= 15 * 60 * 1000) {
    customerStatus.value = 'O prazo de confirmação terminou. Confira seus dados e envie um novo cadastro para gerar outro link.'
    customerVerificationLink.value = ''
    return
  }
  scheduleCustomerVerificationPoll()
}

async function continueSignupContact() {
  customerStatus.value = ''
  const contact = signupContact.value.trim()
  if (contact.includes('@')) {
    const email = contact.toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      customerStatus.value = 'Informe um e-mail válido.'
      return
    }
    customerForm.email = email
  } else {
    const phone = normalizeBrazilianPhone(contact)
    if (!phone) {
      customerStatus.value = 'Informe um WhatsApp com DDD ou um e-mail válido.'
      return
    }
    customerForm.whatsapp = phone
    customerForm.name = ''
    customerForm.email = ''
    // O nome vem da confirmação realizada pela Beta.
    await sendCustomerSignup()
    return
  }
  signupStep.value = 2
  void nextTick(() => document.getElementById('customer-name')?.focus())
}

async function sendCustomerSignup() {
  if (customerSubmitting.value) return
  customerStatus.value = ''
  customerVerificationLink.value = ''
  customerVerificationCode.value = ''
  customerVerificationComplete.value = false
  customerVerificationPollStartedAt = 0
  if (customerVerificationPollTimer !== undefined) window.clearTimeout(customerVerificationPollTimer)
  const name = customerForm.name.trim().replace(/\s+/g, ' ')
  const whatsapp = normalizeBrazilianPhone(customerForm.whatsapp)
  const email = customerForm.email.trim().toLowerCase()
  if (name && (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name))) {
    customerStatus.value = 'Informe um nome válido.'
    return
  }
  if (!whatsapp) {
    customerStatus.value = 'Informe um WhatsApp válido com DDD.'
    return
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    customerStatus.value = 'Informe um e-mail válido.'
    return
  }

  customerSubmitting.value = true
  customerStatus.value = 'Registrando seu cadastro…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, whatsapp, email }),
    })
    const body = await response.json() as { registered?: boolean; verificationCode?: string; error?: string }
    if (!response.ok || body.registered !== true || !body.verificationCode) {
      throw new Error(body.error || 'Não foi possível registrar o cadastro agora.')
    }
    const message = `Confirmar cadastro FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}${name ? `\nNome: ${name}` : ''}`
    customerVerificationCode.value = body.verificationCode
    customerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
    customerStatus.value = name ? 'Envie a mensagem para a Beta e volte a esta tela para confirmar seu cadastro.' : 'Envie a mensagem para a Beta. Ela identificará o nome exibido no seu WhatsApp e o encaminhará com o número e o código para concluir o cadastro.'
    customerVerificationPollStartedAt = Date.now()
    scheduleCustomerVerificationPoll(1_000)
  } catch (error) {
    customerStatus.value = error instanceof Error ? error.message : 'Não foi possível registrar o cadastro agora.'
  } finally {
    customerSubmitting.value = false
  }
}

function closeTrainerSignup() {
  trainerStatus.value = ''
  goHome()
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
  const sex = trainerForm.sex
  const slug = trainerForm.slug.trim().toLowerCase()
  const phone = normalizeBrazilianPhone(trainerForm.phone)
  const email = trainerForm.email.trim().toLowerCase()
  const dateOfBirth = trainerForm.dateOfBirth
  const instagram = normalizeInstagramHandle(trainerForm.instagram)
  const cref = trainerForm.cref.trim()
  const reservedSlugs = ['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda', 'develop', 'test', 'homologacao']
  let validationError = ''
  if (!name) validationError = 'Informe seu nome completo.'
  else if (sex !== 'masculino' && sex !== 'feminino') validationError = 'Selecione Masculino ou Feminino.'
  else if (!phone) validationError = 'Informe um WhatsApp válido com DDD.'
  else if (dateOfBirth && !isValidLoginBirthDate(dateOfBirth)) validationError = 'Informe uma data de nascimento válida ou deixe em branco.'
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
      body: JSON.stringify({ name, sex, slug, whatsapp: phone, ...(dateOfBirth ? { dateOfBirth } : {}), ...(email ? { email } : {}), cities: trainerForm.cities, instagram, ...(cref ? { cref } : {}) }),
    })
    const body = await response.json() as { registered?: boolean; error?: string; slug?: string; verificationCode?: string }
    if (!response.ok || body.registered !== true) {
      throw new Error(body.error || 'Não foi possível registrar seu cadastro agora.')
    }
    if (!body.verificationCode) throw new Error('Cadastro recebido, mas não foi possível gerar o código de confirmação. Tente novamente.')
    const message = `Confirmar personal Fitpeso ${body.verificationCode}\nWhatsApp: ${phone}\nNome: ${name}`
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
    const body = await response.json() as { trainer?: { name?: unknown } }
    const name = typeof body.trainer?.name === 'string' ? body.trainer.name.trim() : ''
    if (!name) throw new Error('Invalid trainer profile')
    const firstName = name.split(/\s+/)[0]
    personalName.value = `${firstName} Personal Trainer`
  } catch {
    trainerProfileFailed.value = true
  }
}

async function loadTrainerRequest() {
  if (!trainerRequestToken) return
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/requests/trainer-view?token=${encodeURIComponent(trainerRequestToken)}`, { cache: 'no-store' })
    const body = await response.json() as { request?: TrainerRequestDetails; expired?: boolean; error?: string }
    if (response.status === 410 || body.expired) {
      trainerRequestStatus.value = 'Esta solicitação expirou e não pode mais ser visualizada.'
      return
    }
    if (!response.ok || !body.request) throw new Error(body.error || 'Solicitação indisponível.')
    trainerRequest.value = body.request
    trainerRequestStatus.value = ''
  } catch (error) {
    trainerRequestStatus.value = error instanceof Error ? error.message : 'Não foi possível carregar esta solicitação.'
  }
}

async function submitTrainerProposal() {
  if (!trainerRequestToken || !trainerProposalPrice.value || trainerProposalSubmitting.value) return
  trainerProposalSubmitting.value = true
  trainerRequestStatus.value = 'Enviando proposta…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/requests/proposals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: trainerRequestToken, monthlyPrice: Number(trainerProposalPrice.value), message: trainerProposalMessage.value }) })
    const body = await response.json() as { submitted?: boolean; error?: string }
    if (!response.ok || body.submitted !== true) throw new Error(body.error || 'Não foi possível enviar a proposta.')
    if (trainerRequest.value) trainerRequest.value.proposalAlreadySent = true
    trainerRequestStatus.value = 'Proposta enviada. O usuário poderá conversar com os profissionais e escolher uma proposta pelo painel.'
  } catch (error) { trainerRequestStatus.value = error instanceof Error ? error.message : 'Não foi possível enviar a proposta agora.' }
  finally { trainerProposalSubmitting.value = false }
}

async function openRequestForm() {
  status.value = ''
  showRequestForm.value = true
  requestStep.value = 1
  form.city = ''
  form.trainerGenderPreference = 'indiferente'
  eligibleTrainers.value = []
  selectedTrainerIds.value = []
  viewMode.value = 'contact'
  await nextTick()
  document.getElementById('contact-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function openCustomerLogin(fromRequest = false, method: 'google' | 'whatsapp' = 'google') {
  requestLoginReturn.value = fromRequest
  loginAsTrainer.value = false
  changeLoginProfile()
  customerLoginStatus.value = ''
  customerLoginError.value = ''
  googleProfileStatus.value = ''
  customerLoginMethod.value = method
  loginStep.value = 1
  loginIdentifier.value = ''
  emailLoginPending.value = false
  emailLoginError.value = ''
  if (fromRequest) showRequestForm.value = false
  showCustomerLogin.value = true
  await nextTick()
  await renderGoogleButton('client')
}

async function returnToRequestFormAfterLogin() {
  if (!requestLoginReturn.value) return
  requestLoginReturn.value = false
  viewMode.value = 'contact'
  showRequestForm.value = true
  requestStep.value = 4
  showCustomerLogin.value = false
  await nextTick()
  window.requestAnimationFrame(() => {
    document.getElementById('contact-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

async function searchEligibleTrainers() {
  status.value = ''
  selectedTrainerIds.value = []
  if (!form.city) { status.value = 'Selecione sua cidade para buscar profissionais.'; return }
  if (checkingTrainers.value) return
  checkingTrainers.value = true
  status.value = 'Consultando profissionais ativos…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const query = new URLSearchParams({ city: form.city, gender: form.trainerGenderPreference })
    const response = await fetch(`${endpoint}/api/trainers/eligible?${query}`, { cache: 'no-store' })
    const body = await response.json() as { trainers?: EligibleTrainer[]; error?: string }
    if (!response.ok || !Array.isArray(body.trainers)) throw new Error(body.error || 'Não foi possível consultar os profissionais.')
    eligibleTrainers.value = body.trainers
    if (!eligibleTrainers.value.length) {
      status.value = 'Não encontramos profissionais ativos para esses critérios. Altere a cidade ou a preferência de gênero e tente novamente.'
      return
    }
    status.value = ''
    requestStep.value = 2
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível consultar os profissionais agora.'
  } finally { checkingTrainers.value = false }
}

function continueToTrainerSelection() {
  if (!form.shareContactConsent) { status.value = 'Autorize o compartilhamento dos dados para continuar.'; return }
  requestStep.value = 3
  status.value = ''
}

function reviewRequest() {
  if (!selectedTrainerIds.value.length) { status.value = 'Selecione ao menos um profissional.'; return }
  requestStep.value = 4
  status.value = ''
}

async function confirmServiceRequest() {
  if (!isValidLoginBirthDate(requestBirthDate.value)) { status.value = 'Informe sua data de nascimento antes de continuar.'; return }
  if (!customerSignedInName.value) {
    await openCustomerLogin(true, 'whatsapp')
    return
  }
  await sendResult()
}

async function openCustomerRequests() {
  viewMode.value = 'customer-requests'
  customerRequestsStatus.value = 'Carregando suas solicitações…'
  await nextTick()
  window.scrollTo(0, 0)
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) { customerRequestsStatus.value = 'Entre na sua conta para consultar suas propostas.'; return }
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/requests`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
    const body = await response.json() as { requests?: CustomerRequest[]; error?: string }
    if (!response.ok || !Array.isArray(body.requests)) throw new Error(body.error || 'Não foi possível carregar suas solicitações.')
    customerRequests.value = body.requests
    customerRequestsStatus.value = body.requests.length ? '' : 'Você ainda não tem solicitações.'
  } catch (error) { customerRequestsStatus.value = error instanceof Error ? error.message : 'Não foi possível carregar suas solicitações.' }
}

async function acceptProposal(request: CustomerRequest, proposal: CustomerProposal) {
  if (proposal.expired || proposal.status !== 'OPEN') return
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/requests/${encodeURIComponent(request.requestId)}/accept`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ trainerId: proposal.trainerId }) })
    const body = await response.json() as { accepted?: boolean; error?: string }
    if (!response.ok || body.accepted !== true) throw new Error(body.error || 'Não foi possível aceitar esta proposta.')
    await openCustomerRequests()
    status.value = `Proposta de ${proposal.name} aceita. O profissional será avisado.`
  } catch (error) { status.value = error instanceof Error ? error.message : 'Não foi possível aceitar a proposta.' }
}


async function loadTrainerSession(token: string): Promise<TrainerAccountProfile> {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(endpoint + '/api/trainers/profile', {
    method: 'POST', headers: { authorization: 'Bearer ' + token }, cache: 'no-store',
  })
  const body = await response.json() as { authenticated?: boolean; profile?: TrainerAccountProfile; error?: string }
  if (!response.ok || body.authenticated !== true || !body.profile?.trainerId) throw new Error(body.error || 'Sessão inválida.')
  return body.profile
}

function applyTrainerSession(profile: TrainerAccountProfile) {
  trainerSignedInId.value = profile.trainerId
  trainerSignedInName.value = profile.name
  customerSignedInName.value = ''
  try {
    sessionStorage.removeItem('fitpeso-customer-session')
    sessionStorage.removeItem('fitpeso-google-session')
  } catch { /* armazenamento indisponível */ }
}


function applyProfileForEditing(profile: { name: string; whatsapp: string; email?: string; dateOfBirth?: string; instagram?: string; cref?: string; slug?: string }) {
  editingProfile.name = profile.name ?? ''
  editingProfile.whatsapp = profile.whatsapp ?? ''
  editingProfile.email = profile.email ?? ''
  editingProfile.dateOfBirth = profile.dateOfBirth ?? ''
  editingProfile.instagram = profile.instagram ?? ''
  editingProfile.cref = profile.cref ?? ''
  editingProfile.slug = profile.slug ?? ''
}

async function openMyProfile() {
  const trainer = Boolean(trainerSignedInId.value)
  editingProfileType.value = trainer ? 'trainer' : 'customer'
  editingProfileStatus.value = ''
  editingProfileLoading.value = true
  viewMode.value = 'my-profile'
  await nextTick()
  window.scrollTo(0, 0)
  const generation = sessionGeneration
  try {
    const token = trainer
      ? sessionStorage.getItem('fitpeso-trainer-session')
      : sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session')
    if (!token) throw new Error('Entre na sua conta para consultar o cadastro.')
    const profile = trainer ? await loadTrainerSession(token) : await loadCustomerProfile(token)
    if (sessionGeneration !== generation || viewMode.value !== 'my-profile') return
    applyProfileForEditing(profile)
    editingProfileStatus.value = ''
  } catch (error) {
    if (sessionGeneration === generation) {
      editingProfileStatus.value = error instanceof Error ? error.message : 'Não foi possível carregar seu cadastro.'
    }
  } finally {
    if (sessionGeneration === generation) editingProfileLoading.value = false
  }
}

async function saveMyProfile() {
  if (editingProfileSaving.value || editingProfileLoading.value) return
  const name = editingProfile.name.trim().replace(/\s+/g, ' ')
  const birth = editingProfile.dateOfBirth
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) {
    editingProfileStatus.value = 'Informe um nome válido.'
    return
  }
  if (birth && !isValidLoginBirthDate(birth)) {
    editingProfileStatus.value = 'Informe uma data de nascimento válida ou deixe em branco até solicitar atendimento.'
    return
  }
  const trainer = editingProfileType.value === 'trainer'
  const cref = editingProfile.cref.trim().toUpperCase()
  const instagram = editingProfile.instagram.trim()
  if (trainer && cref && !/^[0-9]{1,10}-[GP]\/[A-Z]{2}$/.test(cref)) {
    editingProfileStatus.value = 'Informe um CREF no formato 072573-G/RJ ou deixe em branco.'
    return
  }
  if (trainer && instagram && (!/^@[A-Za-z0-9._]{1,30}$/.test(instagram) || instagram.includes('..') || instagram.endsWith('.'))) {
    editingProfileStatus.value = 'Informe o Instagram no formato @usuario.'
    return
  }
  editingProfileSaving.value = true
  editingProfileStatus.value = 'Salvando alterações…'
  const generation = sessionGeneration
  try {
    const token = trainer
      ? sessionStorage.getItem('fitpeso-trainer-session')
      : sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session')
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
    const endpoint = await getRequestApiEndpoint()
    const resource = trainer ? 'trainers' : 'customers'
    const response = await fetch(endpoint + '/api/' + resource + '/update-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      cache: 'no-store',
      body: JSON.stringify(trainer ? { name, dateOfBirth: birth, instagram, cref } : { name, ...(birth ? { dateOfBirth: birth } : {}) }),
    })
    const body = await response.json() as {
      authenticated?: boolean
      profile?: TrainerAccountProfile & { dateOfBirth?: string; email?: string }
      error?: string
    }
    if (!response.ok || !body.authenticated || !body.profile) throw new Error(body.error || 'Não foi possível salvar o cadastro.')
    if (sessionGeneration !== generation || viewMode.value !== 'my-profile') return
    applyProfileForEditing(body.profile)
    if (trainer) applyTrainerSession(body.profile)
    else applyCustomerProfile({ name: body.profile.name, whatsapp: body.profile.whatsapp, email: body.profile.email ?? '', dateOfBirth: body.profile.dateOfBirth })
    editingProfileStatus.value = 'Cadastro atualizado com sucesso.'
  } catch (error) {
    if (sessionGeneration === generation) editingProfileStatus.value = error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'
  } finally {
    if (sessionGeneration === generation) editingProfileSaving.value = false
  }
}

function changeLoginProfile() {
  loginStep.value = 1
  emailLoginPending.value = false
  emailLoginError.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
  // A escolha é explícita: nunca inferir o papel apenas pelo número de WhatsApp.
  customerLoginMethod.value = 'whatsapp'
  customerLoginError.value = ''
  customerLoginStatus.value = ''
  trainerLoginError.value = ''
  trainerLoginStatus.value = ''
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginPollTimer = undefined
  if (trainerLoginPollTimer !== undefined) window.clearTimeout(trainerLoginPollTimer)
  trainerLoginPollTimer = undefined
  showCustomerLoginDialog.value = false
  trainerLoginDialog.value = false
  customerLoginCode.value = ''
  trainerLoginCode.value = ''
}

function isValidLoginBirthDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date + 'T00:00:00.000Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
    date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10)
}

async function startTrainerWhatsAppLogin() {
  if (trainerLoginSubmitting.value) return
  const whatsapp = normalizeBrazilianPhone(customerLoginWhatsApp.value)
  if (!whatsapp) { trainerLoginError.value = 'Informe um WhatsApp válido com DDD.'; return }
  if (trainerLoginPollTimer !== undefined) window.clearTimeout(trainerLoginPollTimer)
  trainerLoginSubmitting.value = true
  trainerLoginError.value = ''
  trainerLoginStatus.value = 'Preparando acesso…'
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/trainers/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp, sessionToken: token }),
    })
    const body = await response.json() as { started?: boolean; verificationCode?: string; error?: string }
    if (!response.ok || !body.started || !body.verificationCode) throw new Error(body.error || 'Não foi possível iniciar o login.')
    trainerLoginCode.value = body.verificationCode
    trainerLoginToken.value = token
    trainerLoginLink.value = 'https://wa.me/5521971118383?text=' + encodeURIComponent('Confirmar login FitPeso ' + body.verificationCode + '\nWhatsApp: ' + whatsapp)
    trainerLoginDialog.value = true
    trainerLoginStartedAt = Date.now()
    trainerLoginStatus.value = 'Toque no botão da janela para enviar a mensagem à Beta pelo WhatsApp. Depois, aguarde a confirmação automática.'
    trainerLoginPollTimer = window.setTimeout(() => void pollTrainerWhatsAppLogin(), 1000)
  } catch (error) {
    trainerLoginError.value = error instanceof Error ? error.message : 'Não foi possível iniciar o login.'
    trainerLoginStatus.value = ''
  } finally {
    trainerLoginSubmitting.value = false
  }
}

async function pollTrainerWhatsAppLogin() {
  if (!showCustomerLogin.value || !loginAsTrainer.value || !trainerLoginCode.value || !trainerLoginToken.value) return
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/trainers/login-status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp: customerLoginWhatsApp.value, code: trainerLoginCode.value, sessionToken: trainerLoginToken.value }),
    })
    const body = await response.json() as { authenticated?: boolean; expired?: boolean; error?: string }
    if (response.ok && body.authenticated) {
      const profile = await loadTrainerSession(trainerLoginToken.value)
      sessionStorage.setItem('fitpeso-trainer-session', trainerLoginToken.value)
      applyTrainerSession(profile)
      trainerLoginDialog.value = false
      showCustomerLogin.value = false
      if (trainerLoginPollTimer !== undefined) window.clearTimeout(trainerLoginPollTimer)
      trainerLoginPollTimer = undefined
      trainerLoginCode.value = ''
      goHome()
      return
    }
    if (body.expired) {
      trainerLoginError.value = 'O código expirou. Inicie o login novamente.'
      trainerLoginDialog.value = false
      trainerLoginCode.value = ''
      return
    }
  } catch {
    // Uma falha de rede transitória não interrompe a confirmação.
  }
  if (Date.now() - trainerLoginStartedAt >= 15 * 60 * 1000) {
    trainerLoginError.value = 'O código expirou. Inicie o login novamente.'
    trainerLoginDialog.value = false
    trainerLoginCode.value = ''
    return
  }
  trainerLoginPollTimer = window.setTimeout(() => void pollTrainerWhatsAppLogin(), 3000)
}

async function openTrainerReceivedRequests() {
  viewMode.value = 'trainer-requests'
  trainerRequestsStatus.value = 'Carregando solicitações recebidas…'
  trainerReceivedRequests.value = []
  await nextTick()
  window.scrollTo(0, 0)
  try {
    const token = sessionStorage.getItem('fitpeso-trainer-session') ?? ''
    if (!token) throw new Error('Entre como personal para consultar suas solicitações.')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/trainers/received-requests', {
      headers: { authorization: 'Bearer ' + token }, cache: 'no-store',
    })
    const body = await response.json() as { requests?: TrainerReceivedRequest[]; error?: string }
    if (!response.ok || !Array.isArray(body.requests)) throw new Error(body.error || 'Não foi possível carregar as solicitações.')
    trainerReceivedRequests.value = body.requests
    trainerRequestsStatus.value = body.requests.length ? '' : 'Nenhuma solicitação recebida no momento.'
  } catch (error) {
    trainerRequestsStatus.value = error instanceof Error ? error.message : 'Não foi possível consultar as solicitações.'
  }
}

function scheduleCustomerLoginPoll(delayMs = 3_000) {
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginPollTimer = window.setTimeout(() => void pollCustomerLogin(), delayMs)
}

async function pollCustomerLogin() {
  if (!customerLoginCode.value || !customerLoginWhatsApp.value || !customerLoginSessionToken.value) return
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/login-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: customerLoginCode.value, whatsapp: customerLoginWhatsApp.value, sessionToken: customerLoginSessionToken.value }),
    })
    const body = await response.json() as { authenticated?: boolean; confirmed?: boolean; expired?: boolean; error?: string }
    if (response.ok && body.authenticated === true) {
      const profile = await loadCustomerProfile(customerLoginSessionToken.value)
      sessionStorage.setItem('fitpeso-customer-session', customerLoginSessionToken.value)
      sessionStorage.removeItem('fitpeso-google-session')
      applyCustomerProfile(profile)
      customerLoginError.value = ''
      customerLoginStatus.value = 'Login confirmado. Seus dados foram carregados.'
      googleProfileStatus.value = 'Cadastro carregado. Confira os dados antes de enviar.'
      showCustomerLoginDialog.value = false
      if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
      customerLoginPollTimer = undefined
      showCustomerLogin.value = false
      await returnToRequestFormAfterLogin()
      return
    }
    if (response.ok && body.confirmed && !body.authenticated) {
      customerLoginError.value = 'Não foi possível confirmar o login. Confira o WhatsApp e tente novamente.'
      customerLoginStatus.value = ''
      showCustomerLoginDialog.value = false
      customerLoginCode.value = ''
      customerLoginVerificationLink.value = ''
      return
    }
    if (response.ok && body.expired) {
      customerLoginError.value = 'O código expirou. Inicie o login novamente para gerar outro.'
      customerLoginStatus.value = ''
      showCustomerLoginDialog.value = false
      customerLoginCode.value = ''
      customerLoginVerificationLink.value = ''
      return
    }
  } catch {
    // Falhas transitórias não interrompem a consulta automática.
  }
  if (Date.now() - customerLoginPollStartedAt >= 15 * 60 * 1000) {
    customerLoginError.value = 'O prazo do código terminou. Inicie o login novamente.'
    customerLoginStatus.value = ''
    showCustomerLoginDialog.value = false
    customerLoginCode.value = ''
    customerLoginVerificationLink.value = ''
    customerLoginPollTimer = undefined
    return
  }
  scheduleCustomerLoginPoll()
}

async function startCustomerWhatsAppLogin() {
  if (customerLoginSubmitting.value) return
  customerLoginStatus.value = ''
  customerLoginError.value = ''
  const whatsapp = normalizeBrazilianPhone(customerLoginWhatsApp.value)
  if (!whatsapp) {
    customerLoginError.value = 'Informe um WhatsApp válido com DDD.'
    return
  }
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginSubmitting.value = true
  customerLoginStatus.value = 'Preparando o acesso…'
  try {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const sessionToken = btoa(Array.from(randomBytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp, sessionToken }),
    })
    const body = await response.json() as { started?: boolean; verificationCode?: string; error?: string }
    if (!response.ok || body.started !== true || !body.verificationCode) throw new Error(body.error || 'Não foi possível iniciar o login agora.')
    customerLoginWhatsApp.value = whatsapp
    customerLoginCode.value = body.verificationCode
    customerLoginSessionToken.value = sessionToken
    customerLoginVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(`Confirmar login FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}`)}`
    customerLoginPollStartedAt = Date.now()
    customerLoginStatus.value = 'Envie o código pelo WhatsApp. Depois, mantenha esta tela aberta: o login será confirmado automaticamente.'
    showCustomerLoginDialog.value = true
    scheduleCustomerLoginPoll(1_000)
  } catch (error) {
    customerLoginError.value = error instanceof Error ? error.message : 'Não foi possível iniciar o login agora.'
    customerLoginStatus.value = ''
  } finally {
    customerLoginSubmitting.value = false
  }
}

function continueLoginIdentifier() {
  emailLoginError.value = ''
  customerLoginError.value = ''
  trainerLoginError.value = ''
  const typed = loginIdentifier.value.trim()
  if (typed.includes('@')) {
    const email = typed.toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailLoginError.value = 'Informe um endereço de e-mail válido.'
      return
    }
    loginIdentifier.value = email
    loginIdentifierKind.value = 'email'
  } else {
    const phone = normalizeBrazilianPhone(typed)
    if (!phone) {
      emailLoginError.value = 'Informe um WhatsApp com DDD ou um e-mail válido.'
      return
    }
    loginIdentifierKind.value = 'whatsapp'
    customerLoginWhatsApp.value = phone
    loginIdentifier.value = phone
  }
  loginStep.value = 2
  void nextTick(() => document.getElementById('login-confirm-action')?.focus())
}

function returnToLoginIdentifier() {
  loginStep.value = 1
  emailLoginPending.value = false
  emailLoginError.value = ''
  customerLoginError.value = ''
  trainerLoginError.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginPollTimer = undefined
  if (trainerLoginPollTimer !== undefined) window.clearTimeout(trainerLoginPollTimer)
  trainerLoginPollTimer = undefined
  showCustomerLoginDialog.value = false
  trainerLoginDialog.value = false
  emailLoginSessionToken.value = ''
  customerLoginCode.value = ''
  trainerLoginCode.value = ''
  void nextTick(() => {
    document.getElementById('login-identifier')?.focus()
    void renderGoogleButton('client')
  })
}

async function submitIdentityLogin() {
  if (loginIdentifierKind.value === 'email') {
    await startEmailLogin()
  } else if (loginAsTrainer.value) {
    await startTrainerWhatsAppLogin()
  } else {
    await startCustomerWhatsAppLogin()
  }
}

async function startEmailLogin() {
  if (emailLoginSubmitting.value || emailLoginPending.value) return
  emailLoginError.value = ''
  emailLoginSubmitting.value = true
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/customers/start-email-login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: loginIdentifier.value, sessionToken: token, asTrainer: loginAsTrainer.value }),
    })
    const body = await response.json() as { started?: boolean; error?: string }
    if (!response.ok || body.started !== true) throw new Error(body.error || 'Não foi possível enviar a confirmação.')
    emailLoginSessionToken.value = token
    emailLoginPending.value = true
    emailLoginStartedAt = Date.now()
    scheduleEmailLoginPoll(1500)
  } catch (error) {
    emailLoginError.value = error instanceof Error ? error.message : 'Não foi possível iniciar o login por e-mail.'
  } finally {
    emailLoginSubmitting.value = false
  }
}

function scheduleEmailLoginPoll(delayMs = 3000) {
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = window.setTimeout(() => void pollEmailLogin(), delayMs)
}

async function pollEmailLogin() {
  if (!showCustomerLogin.value || !emailLoginPending.value || !emailLoginSessionToken.value) return
  const token = emailLoginSessionToken.value
  const trainer = loginAsTrainer.value
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/customers/email-login-status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ sessionToken: token, role: trainer ? 'trainer' : 'customer' }),
    })
    const body = await response.json() as { authenticated?: boolean; error?: string }
    if (response.ok && body.authenticated === true) {
      if (trainer) {
        const profile = await loadTrainerSession(token)
        sessionStorage.setItem('fitpeso-trainer-session', token)
        applyTrainerSession(profile)
      } else {
        const profile = await loadCustomerProfile(token)
        sessionStorage.setItem('fitpeso-customer-session', token)
        sessionStorage.removeItem('fitpeso-google-session')
        applyCustomerProfile(profile)
      }
      emailLoginPending.value = false
      emailLoginPollTimer = undefined
      showCustomerLogin.value = false
      if (!trainer && requestLoginReturn.value) {
        await returnToRequestFormAfterLogin()
      } else {
        goHome()
      }
      return
    }
  } catch {
    // Erros transitórios não interrompem a confirmação.
  }
  if (Date.now() - emailLoginStartedAt > 15 * 60 * 1000) {
    emailLoginPending.value = false
    emailLoginError.value = 'O link expirou. Volte e solicite outro acesso por e-mail.'
    emailLoginPollTimer = undefined
    return
  }
  scheduleEmailLoginPoll()
}

function closeCustomerLogin() {
  if (customerLoginPollTimer !== undefined) window.clearTimeout(customerLoginPollTimer)
  customerLoginPollTimer = undefined
  showCustomerLoginDialog.value = false
  goHome()
}

function openCustomerSignupFromLogin() {
  signupStep.value = 1
  signupContact.value = loginIdentifier.value.trim()
  showCustomerLogin.value = false
  showCustomerSignup.value = true
  history.replaceState(null, '', `${window.location.pathname}#cadastro-cliente`)
}

onMounted(() => {
  if (trainerRequestToken) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  void loadTrainerProfile()
  void loadTrainerRequest()
  try {
    const trainerToken = sessionStorage.getItem('fitpeso-trainer-session')
    if (trainerToken) {
      const generation = sessionGeneration
      void loadTrainerSession(trainerToken).then(profile => {
        if (sessionGeneration === generation && sessionStorage.getItem('fitpeso-trainer-session') === trainerToken) {
          applyTrainerSession(profile)
        }
      }).catch(() => {
        if (sessionGeneration !== generation) return
        sessionStorage.removeItem('fitpeso-trainer-session')
        trainerSignedInId.value = ''
        trainerSignedInName.value = ''
      })
    }
  } catch { /* armazenamento indisponível */ }
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session')
    if (token) {
      const generation = sessionGeneration
      void loadCustomerProfile(token).then(profile => {
        const storedToken = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session')
        if (sessionGeneration === generation && storedToken === token) applyCustomerProfile(profile)
      }).catch(() => {
        if (sessionGeneration !== generation) return
        sessionStorage.removeItem('fitpeso-google-session')
        sessionStorage.removeItem('fitpeso-customer-session')
              customerSignedInName.value = ''
      })
    }
  } catch { /* Sessão temporária indisponível; ainda é possível entrar novamente. */ }
})

async function createFitpesoRequest(request: Record<string, unknown>) {
  const endpoint = await getRequestApiEndpoint()
  const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
  const response = await fetch(`${endpoint}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
  })
  const body = await response.json() as {
    created?: boolean
    error?: string
  }
  if (!response.ok || body.created !== true) {
    throw new Error(body.error || 'Não foi possível registrar a solicitação agora. Tente novamente.')
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
  if (!isValidLoginBirthDate(requestBirthDate.value)) {
    status.value = 'Informe sua data de nascimento para solicitar atendimento.'
    return
  }
  const trainingDays = form.provideAvailability ? form.trainingDays : []
  const trainingShifts = form.provideAvailability ? form.trainingShifts : []

  submittingRequest.value = true
  status.value = 'Enviando sua solicitação para a Beta…'

  try {
    // O nascimento só é coletado quando o aluno solicita atendimento.
    // Atualização autenticada antes do pedido: o backend calcula a idade a partir desse dado.
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) throw new Error('Entre na sua conta para solicitar atendimento.')
    if (customerForm.dateOfBirth !== requestBirthDate.value) {
      const endpoint = await getRequestApiEndpoint()
      const saved = await fetch(endpoint + '/api/customers/update-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: customerSignedInName.value, dateOfBirth: requestBirthDate.value }),
      })
      const savedBody = await saved.json() as { profile?: { name: string; whatsapp: string; email: string; dateOfBirth?: string }; error?: string }
      if (!saved.ok || !savedBody.profile) throw new Error(savedBody.error || 'Não foi possível salvar a data de nascimento.')
      applyCustomerProfile(savedBody.profile)
    }
    await createFitpesoRequest({
      clientName,
      clientPhone: `+${normalizedPhoneDigits}`,
      ...(email ? { email } : {}),
      ...(age !== undefined ? { age } : {}),
      city,
      trainerGenderPreference: form.trainerGenderPreference,
      ...(form.desiredDuration ? { desiredDuration: form.desiredDuration } : {}),
      attendsGym: form.attendsGym,
      ...(form.attendsGym && form.gymName.trim() ? { gymName: form.gymName.trim() } : {}),
      objective: form.objective,
      trainingDays,
      trainingShifts,
      selectedTrainerIds: selectedTrainerIds.value,
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
      <header class="hero">
        <div class="brand" aria-label="FitPeso — Rede de treinadores">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" /><path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" /></svg>
          <span class="brand-lockup"><span class="brand-default"><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span><small class="brand-tagline">Rede de treinadores</small></span>
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
        <label class="field field-wide" for="trainer-sex"><span class="field-label">Sexo</span>
          <select id="trainer-sex" v-model="trainerForm.sex" name="trainerSex" required>
            <option disabled value="">Selecione</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
        </label>
        <label class="field field-wide" for="trainer-slug"><span class="field-label">Endereço do seu perfil</span>
          <input id="trainer-slug" v-model="trainerForm.slug" name="trainerSlug" type="text" autocapitalize="none" maxlength="40" pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])" placeholder="joao-silva" required>
          <small>Seu perfil será ativado em https://{{ trainerForm.slug || 'seu-identificador' }}.fitpeso.com.br após a confirmação do WhatsApp.</small>
        </label>
        <label class="field field-wide" for="trainer-phone"><span class="field-label">Telefone</span>
          <input id="trainer-phone" v-model="trainerForm.phone" name="trainerPhone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(21) 99999-9999" required>
        </label>
        <label class="field field-wide" for="trainer-birth-date"><span class="field-label">Data de nascimento <span>opcional</span></span>
          <input id="trainer-birth-date" v-model="trainerForm.dateOfBirth" name="trainerBirthDate" type="date" autocomplete="bday" min="1900-01-01" :max="new Date().toISOString().slice(0, 10)">
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
      <button class="back-button" type="button" @click="closeTrainerSignup">Início</button>
      <div class="box-footer" role="group" aria-label="Aparência e contato">
        <span class="box-footer-balancer" aria-hidden="true"></span>
        <a class="box-contact-link" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
          <svg class="box-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 3.5h3l1.3 4.1-2 1.7a15.1 15.1 0 0 0 5.8 5.8l1.7-2 4.1 1.3v3a2 2 0 0 1-2.2 2C10.8 18.9 5.1 13.2 4.6 5.7a2 2 0 0 1 2-2.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
          <span>Fale conosco</span>
        </a>
        <div class="box-theme-actions" role="group" aria-label="Escolher tema">
          <button type="button" class="theme-icon-button" aria-label="Tema claro" title="Claro" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          </button>
          <button type="button" class="theme-icon-button" aria-label="Tema escuro" title="Escuro" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="showCustomerLogin" class="calculator customer-signup login-screen" aria-labelledby="customer-login-title">
      <header class="hero">
        <div class="brand" aria-label="FitPeso — Rede de treinadores">
          <span class="brand-lockup"><span class="brand-default"><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span></span>
        </div>
        <hr class="personal-divider">
        <h1 id="customer-login-title">Login</h1>
        <p class="intro">{{ loginStep === 1 ? 'Informe seu WhatsApp ou e-mail para acessar o FitPeso.' : 'Confirme seu acesso com segurança, sem senha nem data de nascimento.' }}</p>
      </header>

      <form v-if="loginStep === 1" class="form login-step-form" @submit.prevent="continueLoginIdentifier">
        <label class="field field-wide" for="login-identifier">
          <span class="field-label">WhatsApp ou e-mail</span>
          <input id="login-identifier" v-model="loginIdentifier" type="text" inputmode="email" autocomplete="username" maxlength="254" placeholder="(21) 99999-9999 ou seu@email.com" required @input="emailLoginError = ''">
        </label>
        <label class="login-profile-option field-wide" for="login-as-trainer">
          <input id="login-as-trainer" v-model="loginAsTrainer" type="checkbox" :disabled="requestLoginReturn" @change="changeLoginProfile">
          <span>Entrar como personal trainer</span>
        </label>
        <p v-if="emailLoginError" class="login-validation-error field-wide" role="alert">{{ emailLoginError }}</p>
        <button class="primary-button field-wide" type="submit">Continuar</button>
        <div v-if="!loginAsTrainer" class="login-google-alternative field-wide">
          <span>ou</span>
          <div ref="googleButtonContainer" class="google-button-container"></div>
        </div>
      </form>

      <div v-else class="login-second-step">
        <div class="login-identity-summary">
          <span>{{ loginIdentifierKind === 'whatsapp' ? 'WhatsApp' : 'E-mail' }}</span>
          <strong>{{ loginIdentifier }}</strong>
          <button type="button" @click="returnToLoginIdentifier">Alterar</button>
        </div>
        <form v-if="!emailLoginPending" class="form login-step-form" @submit.prevent="submitIdentityLogin">
          <p v-if="loginIdentifierKind === 'whatsapp'" class="login-step-note field-wide">Após continuar, você enviará uma mensagem para a Beta pelo WhatsApp. A confirmação será automática.</p>
          <p v-else class="login-step-note field-wide">Enviaremos um link de confirmação para seu e-mail. Sua conta só será acessada após confirmar o link.</p>
          <p v-if="loginIdentifierKind === 'email' ? emailLoginError : (loginAsTrainer ? trainerLoginError : customerLoginError)" class="login-validation-error field-wide" role="alert" aria-live="assertive">{{ loginIdentifierKind === 'email' ? emailLoginError : (loginAsTrainer ? trainerLoginError : customerLoginError) }}</p>
          <button id="login-confirm-action" class="primary-button field-wide" type="submit" :disabled="customerLoginSubmitting || trainerLoginSubmitting || emailLoginSubmitting">
            {{ customerLoginSubmitting || trainerLoginSubmitting || emailLoginSubmitting ? 'Preparando acesso…' : loginIdentifierKind === 'email' ? 'Enviar link para meu e-mail' : 'Confirmar pelo WhatsApp' }}
          </button>
          <button class="back-button field-wide" type="button" @click="returnToLoginIdentifier">Voltar</button>
        </form>
        <div v-else class="login-email-waiting" role="status" aria-live="polite">
          <h2>Confira seu e-mail</h2>
          <p>Enviamos um link de confirmação para <strong>{{ loginIdentifier }}</strong>.</p>
          <p>Abra o link, confirme o acesso e volte para esta tela. A entrada será concluída automaticamente.</p>
          <button class="secondary-button" type="button" @click="pollEmailLogin">Já confirmei meu e-mail</button>
          <button class="back-button" type="button" @click="returnToLoginIdentifier">Voltar</button>
        </div>
      </div>

      <button v-if="loginStep === 1" class="back-button" type="button" @click="openCustomerSignupFromLogin">Criar cadastro</button>
      <button class="back-button" type="button" @click="closeCustomerLogin">Voltar ao início</button>
      <div v-if="loginAsTrainer ? trainerLoginDialog : showCustomerLoginDialog" class="success-overlay" role="presentation">
        <section class="success-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-login-confirm-title">
          <div class="success-mark" aria-hidden="true">✓</div>
          <h2 id="customer-login-confirm-title">Confirme seu login</h2>
          <p>Toque no botão e envie a mensagem com o código para a Beta no WhatsApp. Depois, volte para esta tela e aguarde a confirmação automática.</p>
          <a v-if="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink" class="primary-button customer-verification-link" :href="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink" target="_blank" rel="noopener noreferrer">Enviar mensagem para a Beta</a>
          <button class="secondary-button" type="button" @click="loginAsTrainer ? pollTrainerWhatsAppLogin() : pollCustomerLogin()">Verificar agora</button>
        </section>
      </div>
      <div class="box-footer" role="group" aria-label="Aparência e contato">
        <span class="box-footer-balancer" aria-hidden="true"></span>
        <a class="box-contact-link" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
          <svg class="box-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 3.5h3l1.3 4.1-2 1.7a15.1 15.1 0 0 0 5.8 5.8l1.7-2 4.1 1.3v3a2 2 0 0 1-2.2 2C10.8 18.9 5.1 13.2 4.6 5.7a2 2 0 0 1 2-2.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
          <span>Fale conosco</span>
        </a>
        <div class="box-theme-actions" role="group" aria-label="Escolher tema">
          <button type="button" class="theme-icon-button" aria-label="Tema claro" title="Claro" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          </button>
          <button type="button" class="theme-icon-button" aria-label="Tema escuro" title="Escuro" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="showCustomerSignup" class="calculator customer-signup" aria-labelledby="customer-signup-title">
      <header class="hero">
        <div class="brand" aria-label="FitPeso">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" /><path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" /></svg>
          <span class="brand-lockup"><span class="brand-default"><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span><small class="brand-tagline">Evoluindo com você</small></span>
        </div>
        <hr class="personal-divider">
        <h1 id="customer-signup-title">Cadastro de cliente</h1>
      </header>
      <form v-if="!customerVerificationLink && signupStep === 1" class="form login-step-form" @submit.prevent="continueSignupContact">
        <p class="field-wide intro">Informe apenas seu WhatsApp ou e-mail. Pelo WhatsApp, a Beta confirma seu número e informa seu nome automaticamente.</p>
        <label class="field field-wide" for="signup-contact"><span class="field-label">WhatsApp ou e-mail</span>
          <input id="signup-contact" v-model="signupContact" name="signupContact" autocomplete="username" type="text" maxlength="254" placeholder="(21) 99999-9999 ou seu@email.com" required>
        </label>
        <button class="primary-button field-wide" type="submit" :disabled="customerSubmitting">{{ customerSubmitting ? "Preparando confirmação…" : "Continuar" }}</button>
      </form>
      <form v-else-if="!customerVerificationLink" class="form" @submit.prevent="sendCustomerSignup">
        <p class="field-wide intro">Para continuar pelo e-mail, informe seu nome e WhatsApp. O número será confirmado com a Beta. A data de nascimento será solicitada apenas quando pedir atendimento.</p>
        <label class="field field-wide" for="customer-name"><span class="field-label">Seu nome</span>
          <input id="customer-name" v-model="customerForm.name" name="customerName" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Como podemos chamar você?" required>
        </label>
        <label class="field field-wide" for="customer-whatsapp"><span class="field-label">WhatsApp com DDD</span>
          <input id="customer-whatsapp" v-model="customerForm.whatsapp" name="customerWhatsapp" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(21) 99999-9999" required>
        </label>
        <label class="field field-wide" for="customer-email"><span class="field-label">E-mail <span>opcional</span></span>
          <input id="customer-email" v-model="customerForm.email" name="customerEmail" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com">
        </label>
        <button class="primary-button field-wide" type="submit" :disabled="customerSubmitting">{{ customerSubmitting ? 'Preparando confirmação…' : 'Confirmar WhatsApp' }}</button>
        <button class="back-button field-wide" type="button" @click="signupStep = 1">Voltar</button>
      </form>
      <div v-else class="customer-signup-confirmation">
        <p class="status" role="status" aria-live="polite">{{ customerStatus }}</p>
        <a v-if="!customerVerificationComplete" class="primary-button customer-verification-link" :href="customerVerificationLink" target="_blank" rel="noopener noreferrer">Confirmar WhatsApp</a>
        <button v-if="!customerVerificationComplete" class="secondary-button" type="button" @click="pollCustomerVerification">Verificar agora</button>
        <button v-else class="primary-button" type="button" @click="closeCustomerSignup">Concluir cadastro</button>
        <small>O botão abre uma conversa com a Beta e prepara o número e o código. A Beta deverá enviar também o nome exibido no WhatsApp à rota de confirmação. Esse nome não comprova titularidade da linha.</small>
      </div>
      <p v-if="customerStatus && !customerVerificationLink" class="status" role="alert">{{ customerStatus }}</p>
      <button class="back-button" type="button" @click="closeCustomerSignup">Início</button>
      <div class="box-footer" role="group" aria-label="Aparência e contato">
        <span class="box-footer-balancer" aria-hidden="true"></span>
        <a class="box-contact-link" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
          <svg class="box-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 3.5h3l1.3 4.1-2 1.7a15.1 15.1 0 0 0 5.8 5.8l1.7-2 4.1 1.3v3a2 2 0 0 1-2.2 2C10.8 18.9 5.1 13.2 4.6 5.7a2 2 0 0 1 2-2.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
          <span>Fale conosco</span>
        </a>
        <div class="box-theme-actions" role="group" aria-label="Escolher tema">
          <button type="button" class="theme-icon-button" aria-label="Tema claro" title="Claro" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          </button>
          <button type="button" class="theme-icon-button" aria-label="Tema escuro" title="Escuro" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>
          </button>
        </div>
      </div>
    </section>

    <section v-else class="calculator" :aria-labelledby="viewMode === 'home' && !result ? undefined : viewMode === 'contact' ? 'contact-form-title' : 'page-title'" :aria-label="viewMode === 'home' && !result ? 'FitPeso' : undefined">
      <div v-if="showHomeTopbar" class="fitpeso-home-topbar">
        <div class="fitpeso-home-brand" aria-label="FitPeso — Rede de treinadores">
          <div class="fitpeso-home-brand-main">
            <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
            <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
          </svg>
            <span class="brand-default"><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span>
          </div>
          <small class="brand-tagline">Rede de treinadores</small>
        </div>
        <nav class="customer-account-links" aria-label="Conta do usuário">
          <template v-if="trainerSignedInId || customerSignedInName">
            <span class="account-greeting">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
              <span>Olá, {{ (trainerSignedInId ? trainerSignedInName : customerSignedInName).trim().split(/\s+/)[0] }}</span>
            </span>
            <details class="account-dropdown">
              <summary aria-label="Abrir menu do usuário" title="Menu do usuário" aria-haspopup="menu">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </summary>
              <div class="account-dropdown-panel">
                <button type="button" @click="trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()">{{ trainerSignedInId ? 'Solicitações recebidas' : 'Minhas solicitações' }}</button>
                <button type="button" @click="openMyProfile">Meu cadastro</button>
                <button type="button" @click="logout">Sair</button>
              </div>
            </details>
          </template>
          <template v-else>
            <button type="button" @click="openCustomerLogin()">Entrar</button>
          </template>
        </nav>
      </div>
      <header class="hero">
        <div v-if="!showHomeTopbar" class="brand" aria-label="FitPeso — Rede de treinadores">
          <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
            <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
          </svg>
          <span class="brand-lockup"><span class="brand-default"><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span></span>
        </div>
        <p v-if="(trainerIdFromPath || trainerSlugFromHost) && trainerProfileFailed" class="trainer-profile-status" role="status">Não foi possível localizar o personal.</p>
        <hr class="personal-divider">
        <h2 v-if="viewMode === 'contact' && showRequestForm" id="contact-form-title" class="request-form-title">Solicitar atendimento</h2>
        <h1 v-if="viewMode === 'home' && !result" class="home-tagline">
          <span v-if="trainerSlugFromHost && personalBrandFirstName" class="personal-trainer-brand personal-trainer-home-title">
            <span class="personal-trainer-first-name">{{ personalBrandFirstName }}</span>
            <span class="personal-trainer-role">Personal Trainer</span>
          </span>
          <span v-else>Treine com um personal</span>
        </h1>
        <img v-if="viewMode === 'home' && !result && isRootHome" class="root-home-personal-image" :src="rootHomePersonalImage" width="1069" height="594" alt="Personal trainer orientando uma aluna durante um exercício" decoding="async" fetchpriority="high">
        <p v-if="viewMode === 'home' && !result && isRootHome" class="root-home-tagline-subtitle">Apoio profissional faz a diferença</p>
        <h1 v-if="viewMode !== 'contact' && (viewMode !== 'home' || result)" id="page-title">
          <svg class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="4" width="28" height="32" rx="6" />
            <rect x="12" y="9" width="16" height="8" rx="2" />
            <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
          </svg>
          <span>{{ viewMode === 'trainer-request' ? 'Solicitação de atendimento' : viewMode === 'customer-requests' ? 'Minhas solicitações' : viewMode === 'trainer-requests' ? 'Solicitações recebidas' : viewMode === 'my-profile' ? 'Meu cadastro' : result ? 'Resultado da avaliação' : form.calculateBodyFat ? 'IMC e gordura corporal' : 'Avaliar meu peso' }}</span>
        </h1>
        <p v-if="viewMode === 'assessment' && !result" class="intro">Informe suas medidas para fazer uma avaliação.</p>
      </header>

      <section v-if="viewMode === 'my-profile'" class="customer-signup" aria-labelledby="page-title">
        <p class="intro">Consulte e atualize as informações do seu cadastro.</p>
        <p v-if="editingProfileLoading" class="status" role="status">Carregando seu cadastro…</p>
        <form v-else class="form contact-fields" @submit.prevent="saveMyProfile">
          <label class="field field-wide" for="profile-name"><span class="field-label">Nome completo</span>
            <input id="profile-name" v-model="editingProfile.name" type="text" autocomplete="name" minlength="2" maxlength="80" required>
          </label>
          <label class="field field-wide" for="profile-whatsapp"><span class="field-label">WhatsApp confirmado</span>
            <input id="profile-whatsapp" :value="editingProfile.whatsapp" type="tel" readonly aria-readonly="true">
          </label>
          <label class="field field-wide" for="profile-email"><span class="field-label">E-mail</span>
            <input id="profile-email" :value="editingProfile.email" type="email" readonly aria-readonly="true">
          </label>
          <label class="field field-wide" for="profile-dob"><span class="field-label">Data de nascimento</span>
            <input id="profile-dob" v-model="editingProfile.dateOfBirth" type="date" autocomplete="bday" min="1900-01-01" :max="new Date().toISOString().slice(0, 10)" :required="editingProfileType === 'trainer'">
          </label>
          <template v-if="editingProfileType === 'trainer'">
            <label class="field field-wide" for="profile-cref"><span class="field-label">Registro CREF <span>opcional</span></span>
              <input id="profile-cref" v-model="editingProfile.cref" type="text" maxlength="20" autocapitalize="characters" placeholder="072573-G/RJ">
            </label>
            <label class="field field-wide" for="profile-instagram"><span class="field-label">Instagram <span>opcional</span></span>
              <input id="profile-instagram" v-model="editingProfile.instagram" type="text" maxlength="31" placeholder="@usuario">
            </label>
            <label class="field field-wide" for="profile-slug"><span class="field-label">Endereço do perfil</span>
              <input id="profile-slug" :value="editingProfile.slug" type="text" readonly aria-readonly="true">
            </label>
          </template>
          <small class="field-wide">Para alterar WhatsApp, e-mail ou endereço do perfil profissional, é necessária uma nova verificação com a Beta.</small>
          <button class="primary-button field-wide" type="submit" :disabled="editingProfileSaving">{{ editingProfileSaving ? 'Salvando…' : 'Salvar alterações' }}</button>
        </form>
        <p v-if="editingProfileStatus" class="status" role="status" aria-live="polite">{{ editingProfileStatus }}</p>
        <button class="back-button" type="button" @click="goHome">Voltar ao início</button>
      </section>

      <section v-if="viewMode === 'trainer-request'" class="trainer-request-view" aria-labelledby="page-title">
        <p v-if="trainerRequestStatus" class="status" role="status" aria-live="polite">{{ trainerRequestStatus }}</p>
        <div v-else-if="trainerRequest" class="trainer-request-details">
          <dl>
            <div><dt>Nome</dt><dd>{{ trainerRequest.clientName }}</dd></div>
            <div v-if="trainerRequest.age"><dt>Idade</dt><dd>{{ trainerRequest.age }} anos</dd></div>
            <div><dt>Cidade</dt><dd>{{ trainerRequest.city }}</dd></div>
            <div v-if="trainerRequest.objective"><dt>Objetivo</dt><dd>{{ trainerRequest.objective }}</dd></div>
            <div v-if="trainerRequest.desiredDuration"><dt>Tempo de acompanhamento</dt><dd>{{ trainerRequest.desiredDuration }}</dd></div>
            <div v-if="trainerRequest.attendsGym"><dt>Frequenta academia</dt><dd>Sim</dd></div>
            <div v-if="trainerRequest.attendsGym && trainerRequest.gymName"><dt>Qual?</dt><dd>{{ trainerRequest.gymName }}</dd></div>
            <div><dt>Disponibilidade para treino</dt><dd>{{ [trainerRequest.trainingDays.length ? `Dias: ${trainerRequest.trainingDays.join(', ')}` : '', trainerRequest.trainingShifts.length ? `Turnos: ${trainerRequest.trainingShifts.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Não informada' }}</dd></div>
          </dl>
          <p class="trainer-request-expiry">Válida até {{ new Date(trainerRequest.validUntil * 1000).toLocaleString('pt-BR') }}.</p>
          <form v-if="!trainerRequest.proposalAlreadySent" class="form contact-fields" @submit.prevent="submitTrainerProposal">
            <label class="field field-wide" for="trainer-proposal-price"><span class="field-label">Valor mensal (R$)</span><input id="trainer-proposal-price" v-model="trainerProposalPrice" type="number" min="0.01" max="100000" step="0.01" inputmode="decimal" required></label>
            <label class="field field-wide" for="trainer-proposal-message"><span class="field-label">Mensagem <span>opcional</span></span><textarea id="trainer-proposal-message" v-model="trainerProposalMessage" maxlength="500" rows="4" placeholder="Apresente sua proposta"></textarea></label>
            <button class="primary-button field-wide" type="submit" :disabled="trainerProposalSubmitting">{{ trainerProposalSubmitting ? 'Enviando…' : 'Enviar proposta' }}</button>
          </form>
          <p v-else class="status">Você já enviou uma proposta para esta solicitação.</p>
        </div>
      </section>

      <section v-if="viewMode === 'trainer-requests'" class="customer-requests-view" aria-labelledby="page-title">
        <p v-if="trainerRequestsStatus" class="status" role="status">{{ trainerRequestsStatus }}</p>
        <button class="secondary-button" type="button" @click="openTrainerReceivedRequests">Atualizar solicitações</button>
        <article v-for="request in trainerReceivedRequests" :key="request.requestId" class="customer-request-card">
          <h2>{{ request.city }}<span v-if="request.objective"> · {{ request.objective }}</span></h2>
          <p>Cliente: {{ request.clientName }}</p>
          <p>Recebida em {{ new Date(request.createdAt).toLocaleString('pt-BR') }}</p>
          <p>Válida até {{ new Date(request.validUntil * 1000).toLocaleString('pt-BR') }}</p>
          <a class="secondary-button" :href="'/?token=' + encodeURIComponent(request.token)">Ver solicitação e enviar proposta</a>
        </article>
        <button class="back-button" type="button" @click="goHome">Início</button>
      </section>

      <section v-if="viewMode === 'customer-requests'" class="customer-requests-view" aria-labelledby="page-title">
        <p v-if="customerRequestsStatus" class="status" role="status">{{ customerRequestsStatus }}</p>
        <button class="secondary-button" type="button" @click="openCustomerRequests">Atualizar propostas</button>
        <article v-for="request in customerRequests" :key="request.requestId" class="customer-request-card">
          <h2>{{ request.city }}<span v-if="request.objective"> · {{ request.objective }}</span></h2>
          <p>Status: {{ request.lifecycle === 'ACCEPTED' ? 'Atendimento iniciado' : request.requestExpired ? 'Solicitação expirada' : request.lifecycle === 'CLOSED' ? 'Solicitação fechada; propostas válidas ainda podem ser escolhidas' : 'Recebendo propostas' }}</p>
          <p v-if="request.acceptedAt">Atendimento iniciado em {{ new Date(request.acceptedAt).toLocaleString('pt-BR') }}.</p>
          <p>{{ request.proposalCount }} de até 5 propostas · válida até {{ new Date(request.validUntil * 1000).toLocaleDateString('pt-BR') }}</p>
          <p v-if="!request.proposals.length">Ainda não há propostas. Confira novamente mais tarde.</p>
          <div v-for="proposal in request.proposals" :key="proposal.trainerId" class="customer-proposal-card">
            <h3>{{ proposal.name }}</h3>
            <p><strong>Valor:</strong> {{ proposal.monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }}</p>
            <p v-if="proposal.message">{{ proposal.message }}</p>
            <p>Válida até {{ new Date(proposal.validUntil * 1000).toLocaleString('pt-BR') }}<span v-if="proposal.expired"> · Expirada</span></p>
            <p v-if="proposal.status === 'OPEN' && !proposal.expired && request.lifecycle !== 'ACCEPTED'" class="proposal-contact-links"><a :href="'https://wa.me/' + proposal.whatsapp.replace(/\D/g, '')" target="_blank" rel="noopener noreferrer">Conversar pelo WhatsApp</a><a v-if="proposal.instagram" :href="'https://www.instagram.com/' + proposal.instagram.replace(/^@/, '') + '/'" target="_blank" rel="noopener noreferrer">Instagram</a></p>
            <button v-if="request.lifecycle !== 'ACCEPTED' && proposal.status === 'OPEN' && !proposal.expired" class="primary-button" type="button" @click="acceptProposal(request, proposal)">Aceitar proposta</button>
            <p v-else-if="proposal.status === 'ACCEPTED'">Proposta escolhida</p>
          </div>
        </article>
        <button class="back-button" type="button" @click="goHome">Início</button>
      </section>

      <div v-if="viewMode === 'home' && !result" class="home-actions">
        <div class="home-action">
          <button class="primary-button" type="button" @click="openRequestForm">
            <svg class="home-action-icon support-button-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M7.5 2.5v4M16.5 2.5v4M3 9h18"/><circle cx="15.5" cy="15.5" r="3.2"/><path d="M15.5 13.7v2l1.4.9"/></svg>
            <span class="home-action-copy"><strong>Receber atendimento</strong><small>Receba propostas acessíveis</small></span>
          </button>
        </div>
        <div class="home-action home-assessment-link">
          <a href="#avaliacao" @click.prevent="viewMode = 'assessment'">Avaliação on-line grátis</a>
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
        <button class="back-button field-wide" type="button" @click="goHome">Voltar</button>
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

        <button class="primary-button result-request-button" type="button" @click="openRequestForm">Receber atendimento <span aria-hidden="true">→</span></button>
        <button class="back-button" type="button" @click="editMeasurement">Nova avaliação</button>
      </section>

      <form v-if="viewMode === 'contact' && showRequestForm" id="contact-fields" class="form contact-fields request-form" aria-labelledby="contact-form-title" @submit.prevent="sendResult">
        <template v-if="requestStep === 1">
        <p class="field-wide intro">Primeiro, vamos conferir se há profissionais que atendem na sua cidade.</p>
        <label class="field field-wide" for="city"><span class="field-label">Cidade</span>
          <select id="city" v-model="form.city" name="city" autocomplete="address-level2" required>
            <option value="" disabled>Selecione sua cidade</option>
            <option value="Mesquita">Mesquita</option>
            <option value="Nilópolis">Nilópolis</option>
            <option value="Nova Iguaçu">Nova Iguaçu</option>
            <option value="Rio de Janeiro">Rio de Janeiro</option>
          </select>
        </label>
        <label class="field field-wide" for="trainer-gender-preference"><span class="field-label">Gênero do personal</span>
          <select id="trainer-gender-preference" v-model="form.trainerGenderPreference" name="trainerGenderPreference" required>
            <option value="indiferente">Indiferente</option><option value="feminino">Mulher</option><option value="masculino">Homem</option>
          </select>
        </label>
        <button class="primary-button field-wide" type="button" :disabled="checkingTrainers" @click="searchEligibleTrainers">{{ checkingTrainers ? 'Buscando…' : 'Buscar profissionais' }}</button>
        <button class="back-button field-wide" type="button" @click="goHome">Voltar</button>
        </template>

        <template v-else-if="requestStep === 2">
        <p class="field-wide">Encontramos {{ eligibleTrainers.length }} profissional(is) em {{ form.city }}. Conte um pouco sobre o atendimento que procura.</p>
        <label class="field field-wide" for="objective"><span class="field-label">Objetivo <span>opcional</span></span>
          <select id="objective" v-model="form.objective" name="objective">
            <option value="">Selecione seu objetivo</option>
            <option value="Emagrecimento">Emagrecimento</option>
            <option value="Musculação">Musculação</option>
            <option value="Outros">Outros</option>
          </select>
        </label>

        <label class="field field-wide" for="desired-duration"><span class="field-label">Por quanto tempo você deseja o acompanhamento? <span>opcional</span></span>
          <select id="desired-duration" v-model="form.desiredDuration" name="desiredDuration">
            <option value="">Selecione uma duração</option>
            <option value="1 mês">1 mês</option>
            <option value="2 meses">2 meses</option>
            <option value="3 meses">3 meses</option>
            <option value="Mais de 3 meses">Mais de 3 meses</option>
          </select>
        </label>

        <label class="contact-opt-in field-wide availability-toggle" for="attends-gym">
          <input id="attends-gym" v-model="form.attendsGym" name="attendsGym" type="checkbox">
          <span>Frequento academia</span>
        </label>
        <label v-if="form.attendsGym" class="field field-wide" for="gym-name"><span class="field-label">Qual? <span>opcional</span></span>
          <input id="gym-name" v-model="form.gymName" name="gymName" type="text" maxlength="50" placeholder="Nome da academia">
        </label>

        <label class="contact-opt-in field-wide availability-toggle" for="provide-availability">
          <input id="provide-availability" v-model="form.provideAvailability" name="provideAvailability" type="checkbox">
          <svg class="home-action-icon availability-button-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M7.5 2.5v4M16.5 2.5v4M3 9h18"/><circle cx="15.5" cy="15.5" r="3.2"/><path d="M15.5 13.7v2l1.4.9"/></svg>
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
          <span>Autorizo o envio desta solicitação aos profissionais que eu selecionar.</span>
        </label>
        <button class="primary-button field-wide" type="button" @click="continueToTrainerSelection">Escolher profissionais</button>
        <button class="back-button field-wide" type="button" @click="requestStep = 1">Voltar</button>
        </template>

        <template v-else-if="requestStep === 3">
          <p class="field-wide">Escolha quem receberá sua solicitação. Você pode selecionar até 20 profissionais.</p>
          <label v-for="trainer in eligibleTrainers" :key="trainer.trainerId" class="contact-opt-in field-wide availability-toggle">
            <input v-model="selectedTrainerIds" type="checkbox" :value="trainer.trainerId" :disabled="!selectedTrainerIds.includes(trainer.trainerId) && selectedTrainerIds.length >= 20">
            <span><strong>{{ trainer.name }}</strong><small v-if="trainer.instagram"> · Instagram: @{{ trainer.instagram.replace(/^@/, '') }}</small></span>
          </label>
          <button class="primary-button field-wide" type="button" @click="reviewRequest">Revisar solicitação</button>
          <button class="back-button field-wide" type="button" @click="requestStep = 2">Voltar</button>
        </template>

        <template v-else>
          <h3 class="field-wide">Revise antes de enviar</h3>
          <label class="field field-wide" for="request-birth-date">
            <span class="field-label">Data de nascimento</span>
            <input id="request-birth-date" v-model="requestBirthDate" type="date" name="requestBirthDate" autocomplete="bday" min="1900-01-01" :max="new Date().toISOString().slice(0, 10)" required>
            <small class="body-fat-help">Solicitada somente agora, para completar o pedido de atendimento.</small>
          </label>
          <dl class="request-customer-summary field-wide"><div><dt>Cidade</dt><dd>{{ form.city }}</dd></div><div><dt>Preferência</dt><dd>{{ form.trainerGenderPreference === 'indiferente' ? 'Indiferente' : form.trainerGenderPreference === 'feminino' ? 'Mulher' : 'Homem' }}</dd></div><div><dt>Objetivo</dt><dd>{{ form.objective || 'Não informado' }}</dd></div><div><dt>Profissionais</dt><dd>{{ eligibleTrainers.filter(item => selectedTrainerIds.includes(item.trainerId)).map(item => item.name).join(', ') }}</dd></div></dl>
          <p class="field-wide">A solicitação ficará aberta por até 7 dias ou até receber 5 propostas. Cada proposta fica disponível por 3 dias.</p>
          <button class="primary-button field-wide" type="button" :disabled="submittingRequest" @click="confirmServiceRequest">{{ submittingRequest ? 'Enviando…' : customerSignedInName ? 'Confirmar e enviar' : 'Entrar para confirmar' }}</button>
          <button class="back-button field-wide" type="button" @click="requestStep = 3">Voltar e editar</button>
        </template>
      </form>

      <div v-if="evaluating" class="evaluation-overlay" role="status" aria-live="polite" :aria-label="`Avaliando: ${evaluationProgress}%`">
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <div v-if="requestSent" class="success-overlay" role="presentation" @click.self="goHome">
        <section class="success-dialog" role="dialog" aria-modal="true" aria-labelledby="request-sent-title">
          <div class="success-mark" aria-hidden="true">✓</div>
          <h2 id="request-sent-title">Solicitação registrada!</h2>
          <p>Sua solicitação foi enviada aos profissionais escolhidos. Ela ficará aberta por até 7 dias ou até receber 5 propostas. Você pode conversar com vários profissionais antes de escolher.</p>
          <button class="primary-button" type="button" @click="requestSent = false; openCustomerRequests()">Ver propostas</button>
        </section>
      </div>
      <div class="box-footer" role="group" aria-label="Aparência e contato">
        <span class="box-footer-balancer" aria-hidden="true"></span>
        <a class="box-contact-link" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
          <svg class="box-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 3.5h3l1.3 4.1-2 1.7a15.1 15.1 0 0 0 5.8 5.8l1.7-2 4.1 1.3v3a2 2 0 0 1-2.2 2C10.8 18.9 5.1 13.2 4.6 5.7a2 2 0 0 1 2-2.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
          <span>Fale conosco</span>
        </a>
        <div class="box-theme-actions" role="group" aria-label="Escolher tema">
          <button type="button" class="theme-icon-button" aria-label="Tema claro" title="Claro" :class="{ active: theme === 'light' }" :aria-pressed="theme === 'light'" @click="theme = 'light'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          </button>
          <button type="button" class="theme-icon-button" aria-label="Tema escuro" title="Escuro" :class="{ active: theme === 'dark' }" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>
          </button>
        </div>
      </div>

    </section>
  </main>
</template>
