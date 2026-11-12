<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { updatePageSeo } from './services/seo'
import ConsultarProfissionaisView from './views/profissionais/ConsultarProfissionaisView.vue'
import SelecionarProfissionaisView from './views/atendimento/SelecionarProfissionaisView.vue'
import { getCachedEligibleTrainers, listEligibleTrainers } from './services/profissionaisService'
import { useTrainerDirectory } from './composables/useTrainerDirectory'
import { usePublicNavigation } from './composables/usePublicNavigation'
import { useTrainerSelection } from './stores/trainerSelection'
import { storeToRefs } from 'pinia'
import { getRequestApiEndpoint } from './services/api'
import { trainerDisplayName, trainerInstagramUrl } from './utils/trainer'
import { minutesToTime } from './utils/time'
import { trainingTimeRanges } from './constants/training'
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
  clientGender?: 'feminino' | 'masculino' | 'nao_informar'
  city: string
  objective?: string
  desiredDuration?: string
  singleLesson?: boolean
  withCompanion?: boolean
  attendsGym: boolean
  gymName?: string
  trainingDays: string[]
  trainingShifts: string[]
  trainingStartTime?: string
  trainingEndTime?: string
  validUntil: number
  proposalAlreadySent?: boolean
}

type EligibleTrainer = { trainerId: string; name: string; slug: string; instagram?: string; cref?: string; sex?: string; gender?: string; academias?: string[]; gymName?: string; academy?: string }
type CustomerProposal = { trainerId: string; name: string; whatsapp: string; instagram?: string; monthlyPrice: number; message: string; status: string; validUntil: number; expired: boolean }
type TrainerReceivedRequest = { requestId: string; clientName: string; city: string; objective?: string; createdAt: string; validUntil: number; lifecycle: string; token: string }
type EditableProfile = { name: string; whatsapp: string; email: string; dateOfBirth: string; instagram: string; cref: string; slug: string; academias: string[] }
type TrainerAccountProfile = { trainerId: string; name: string; whatsapp: string; email?: string; dateOfBirth?: string; instagram?: string; cref?: string; sex?: string; slug?: string; academias?: string[] }
type AdminTrainer = { trainerId: string; name: string; whatsapp: string; email: string; dateOfBirth: string; sex: string; cref: string; instagram: string; slug: string; cities: string[]; academias: string[]; active: boolean }
type CustomerRequest = { requestId: string; city: string; objective?: string; selectedTrainerIds?: string[]; lifecycle: string; proposalCount: number; validUntil: number; requestExpired?: boolean; acceptedAt?: string; proposals: CustomerProposal[] }

const trainerRequestToken = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
const trainerIdFromPath = getTrainerIdFromPath()
const trainerSlugFromHost = getTrainerSlugFromHost()
const isRootHome = window.location.pathname === '/' && !trainerIdFromPath && !trainerSlugFromHost
const personalName = ref('FitPeso')
const personalBrandFirstName = computed(() => personalName.value.endsWith(' Personal Trainer') ? personalName.value.slice(0, -' Personal Trainer'.length) : '')
const showHomeTopbar = computed(() => ((viewMode.value === 'home' && !result.value) || viewMode.value === 'public-trainers' || viewMode.value === 'professional-registration' || (viewMode.value === 'contact' && showRequestForm.value)) && (isRootHome || Boolean(trainerSlugFromHost)))
const trainerProfileFailed = ref(false)
const availableCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
const viewMode = ref<'home' | 'assessment' | 'contact' | 'trainer-request' | 'customer-requests' | 'trainer-requests' | 'my-profile' | 'public-trainers' | 'select-trainers' | 'professional-registration' | 'admin-trainer' | 'admin-trainers'>(trainerRequestToken ? 'trainer-request' : window.location.pathname.replace(/\/$/, '') === '/profissionais' ? 'public-trainers' : 'home')
const trainerRequest = ref<TrainerRequestDetails | null>(null)
const trainerProposalPrice = ref('')
const trainerProposalMessage = ref('')
const trainerProposalSubmitting = ref(false)
const trainerRequestStatus = ref(trainerRequestToken ? 'Carregando solicitação…' : '')
const showRequestForm = ref(false)
const requestSent = ref(false)
const requestStep = ref(1)
const selectingTrainersForDraft = ref(false)
const academyOptions = ['AquaticCenter', 'SmartFit', 'LifeFit', 'BodyTech', 'Outros']
function addAcademy(list: string[], choice: string, other: string) {
  const name = (choice === 'Outros' ? other : choice).trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60 || list.length >= 5 || list.some(x => x.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) return false
  list.push(name)
  return true
}
const signupAcademyChoice = ref('')
const signupOtherAcademy = ref('')
const profileAcademyChoice = ref('')
const profileOtherAcademy = ref('')
function readNavigationPreference(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function saveNavigationPreference(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* private browsing */ }
}
const NAV_CITY = 'fitpeso:preferred-city:v1'
const NAV_ACADEMY = 'fitpeso:preferred-academy:v1'
const NAV_ROLE = 'fitpeso:preferred-role:v1'

const publicTrainers = ref<EligibleTrainer[]>([])
const publicTrainerCity = ref('')
const publicTrainerName = ref('')
const publicTrainerAcademy = ref('')
const mesquitaAcademies = ['Aquatic Center — Vila Emil']
const storedHomeAcademy = readNavigationPreference(NAV_ACADEMY)
const homeAcademyChoice = ref(storedHomeAcademy && !mesquitaAcademies.includes(storedHomeAcademy) ? 'Outras academias' : storedHomeAcademy)
const homeOtherAcademy = ref(homeAcademyChoice.value === 'Outras academias' ? storedHomeAcademy : '')
const homeAcademy = ref(storedHomeAcademy)
function updateHomeAcademy() {
  homeAcademy.value = homeAcademyChoice.value === 'Outras academias' ? homeOtherAcademy.value.trim() : homeAcademyChoice.value
}
const trainerSelectionStore = useTrainerSelection()
const { selectedTrainerIds: homeSelectedTrainerIds } = storeToRefs(trainerSelectionStore)
const sharingRequestId = ref('')
const sharingRequestMessage = ref('')
const sharingRequestBusy = ref(false)
const activeCustomerRequest = computed(() => customerRequests.value.find(request => request.lifecycle === 'OPEN' && !request.requestExpired && request.validUntil * 1000 > Date.now()))
const checkingCustomerRequests = ref(false)
const customerRequestsLookupError = ref('')
const pendingHomeTrainerIds = ref<string[]>([])
const homeGymOptions = computed(() => {
  const names = new Set(academyOptions.filter(name => name !== 'Outros'))
  publicTrainers.value.forEach(trainer => {
    ;[...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? ''].forEach(name => {
      if (name.trim()) names.add(name.trim())
    })
  })
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))
})
const homeFilteredTrainers = computed(() => publicTrainers.value.filter(trainer =>
  !homeAcademy.value || [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? ''].some(name => name.toLocaleLowerCase('pt-BR') === homeAcademy.value.toLocaleLowerCase('pt-BR'))
))
function searchHomeTrainers() {
  if (!homeCity.value) return
  publicTrainerCity.value = homeCity.value
  void loadPublicTrainers()
}
function requestProposalFromHome() {
  if (sharingRequestId.value) { void sendRequestToSelectedTrainers(); return }
  pendingHomeTrainerIds.value = [...homeSelectedTrainerIds.value]
  void openRequestForm()
}

async function openTrainersForRequest(request: CustomerRequest) {
  sharingRequestId.value = request.requestId
  sharingRequestMessage.value = 'Selecione os profissionais e clique em Enviar solicitação.'
  homeSelectedTrainerIds.value = []
  publicTrainerCity.value = request.city
  homeCity.value = request.city
  viewMode.value = 'select-trainers'
  await loadPublicTrainers()
  await nextTick()
  window.scrollTo(0, 0)
}

async function refreshShareableRequests() {
  if (!customerSignedInName.value) { customerRequests.value = []; sharingRequestId.value = ''; customerRequestsLookupError.value = ''; return }
  checkingCustomerRequests.value = true
  customerRequestsLookupError.value = ''
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) throw new Error('Entre novamente para consultar sua solicitação.')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/customers/requests', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' })
    const body = await response.json() as { requests?: CustomerRequest[] }
    if (!response.ok || !Array.isArray(body.requests)) throw new Error('Não foi possível consultar sua solicitação.')
    customerRequests.value = body.requests
    sharingRequestId.value = activeCustomerRequest.value?.requestId ?? ''
  } catch {
    customerRequestsLookupError.value = 'Não foi possível consultar sua solicitação. Tente novamente.'
  } finally { checkingCustomerRequests.value = false }
}

async function sendRequestToSelectedTrainers() {
  if (!sharingRequestId.value || sharingRequestBusy.value) return
  if (!homeSelectedTrainerIds.value.length) { sharingRequestMessage.value = 'Selecione pelo menos um personal.'; return }
  sharingRequestBusy.value = true
  sharingRequestMessage.value = ''
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/requests/' + encodeURIComponent(sharingRequestId.value) + '/send-to-trainers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ trainerIds: homeSelectedTrainerIds.value }),
    })
    const body = await response.json() as { sent?: boolean; added?: number; error?: string }
    if (!response.ok || !body.sent) throw new Error(body.error || 'Não foi possível enviar a solicitação.')
    sharingRequestMessage.value = body.added ? 'Solicitação enviada para ' + body.added + (body.added === 1 ? ' personal!' : ' personais!') : 'Estes profissionais já receberam sua solicitação.'
    homeSelectedTrainerIds.value = []
    await refreshShareableRequests()
  } catch (error) {
    sharingRequestMessage.value = error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.'
  } finally { sharingRequestBusy.value = false }
}
const publicTrainersLoading = ref(false)
const publicTrainersError = ref('')
let publicLookupId = 0
const isMesquita = (city: string) => city.trim().toLocaleLowerCase('pt-BR') === 'mesquita'
const { academies: publicTrainerAcademies, filtered: publicFilteredTrainers } = useTrainerDirectory({
  trainers: publicTrainers,
  academy: publicTrainerAcademy,
  city: publicTrainerCity,
  requestCity: computed(() => form.city),
  requestGender: computed(() => form.trainerGenderPreference),
  selectingForRequest: computed(() => viewMode.value === 'select-trainers'),
})
watch(publicTrainerCity, () => { publicTrainerAcademy.value = '' })
async function loadPublicTrainers() {
  const id = ++publicLookupId
  const city = publicTrainerCity.value
  const gender = viewMode.value === 'select-trainers' ? form.trainerGenderPreference : 'indiferente'
  const cached = getCachedEligibleTrainers(city, gender)
  publicTrainersError.value = ''
  // Dados em cache aparecem imediatamente; não esvaziar a listagem em toda navegação.
  if (cached) {
    publicTrainers.value = cached
    publicTrainersLoading.value = false
    return
  }
  publicTrainersLoading.value = true
  try {
    const trainers = await listEligibleTrainers(city, gender)
    if (id === publicLookupId) publicTrainers.value = trainers
  } catch {
    if (id === publicLookupId) publicTrainersError.value = 'Não foi possível consultar os profissionais.'
  } finally { if (id === publicLookupId) publicTrainersLoading.value = false }
}
function openPublicTrainers() {
  selectingTrainersForDraft.value = false
  publicTrainerCity.value = homeCity.value || ''
  publicTrainerName.value = ''
  publicTrainerAcademy.value = ''
  homeSelectedTrainerIds.value = []
  viewMode.value = 'public-trainers'
  sharingRequestId.value = ''
  sharingRequestMessage.value = ''
  if (publicTrainerCity.value) void loadPublicTrainers()
  void refreshShareableRequests()
}
const eligibleTrainers = ref<EligibleTrainer[]>([])
const selectedTrainerIds = ref<string[]>([])
const checkingTrainers = ref(false)
const filteredTrainers = computed(() => eligibleTrainers.value)
const allVisibleTrainersSelected = computed(() => filteredTrainers.value.length > 0 && filteredTrainers.value.every(t => selectedTrainerIds.value.includes(t.trainerId)))
function toggleAllVisibleTrainers(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const visibleIds = filteredTrainers.value.map(t => t.trainerId)
  if (!checked) { selectedTrainerIds.value = selectedTrainerIds.value.filter(id => !visibleIds.includes(id)); return }
  selectedTrainerIds.value = [...new Set([...selectedTrainerIds.value, ...visibleIds])].slice(0, 20)
}

const customerRequests = ref<CustomerRequest[]>([])
const customerRequestsStatus = ref('')
const changingRequestId = ref('')
const requestActionDialog = ref<{ request: CustomerRequest; action: 'deactivate' | 'reactivate' } | null>(null)
const requestActionError = ref('')
const requestVerificationLink = ref('')
const showTrainerSignup = ref(window.location.hash === '#cadastro-personal')
const showCustomerSignup = ref(window.location.hash === '#cadastro-cliente')
const showCustomerLogin = ref(false)
const loginAsTrainer = ref(readNavigationPreference(NAV_ROLE) === 'trainer')
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
  academias: [] as string[],
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
const customerSignedInName = ref('')
const customerIsAdmin = ref(false)
const adminTrainerForm = reactive({ name: '', whatsapp: '', email: '', dateOfBirth: '', sex: 'feminino', cref: '', instagram: '@', slug: '', city: 'Mesquita', academias: '' })
const adminTrainerStatus = ref('')
const adminTrainerBusy = ref(false)
async function saveAdminTrainer() {
  if (!customerIsAdmin.value || adminTrainerBusy.value) return
  const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) { adminTrainerStatus.value = 'Entre novamente como administrador.'; return }
  adminTrainerBusy.value = true
  adminTrainerStatus.value = 'Salvando profissional…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/admin/trainers', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ ...adminTrainerForm, cities: [adminTrainerForm.city], academias: adminTrainerForm.academias.split(',').map(x => x.trim()).filter(Boolean) }) })
    const body = await response.json() as { registered?: boolean; error?: string }
    if (!response.ok || !body.registered) throw new Error(body.error || 'Não foi possível cadastrar o profissional.')
    adminTrainerStatus.value = 'Personal cadastrado e ativado com sucesso.'
  } catch (error) { adminTrainerStatus.value = error instanceof Error ? error.message : 'Falha ao cadastrar profissional.' }
  finally { adminTrainerBusy.value = false }
}

const adminTrainers = ref<AdminTrainer[]>([])
const adminTrainerSearch = ref('')
const selectedAdminTrainerId = ref('')
const adminTrainersStatus = ref('')
const adminTrainersLoading = ref(false)
const adminTrainerEditBusy = ref(false)
const adminTrainerEditForm = reactive({ name: '', whatsapp: '', email: '', dateOfBirth: '', sex: 'feminino', cref: '', instagram: '', slug: '', cities: [] as string[], academias: '', active: true })
const filteredAdminTrainers = computed(() => {
  const search = adminTrainerSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (!search) return adminTrainers.value
  return adminTrainers.value.filter(trainer => [trainer.name, trainer.cref, trainer.whatsapp].some(value => value.toLocaleLowerCase('pt-BR').includes(search)))
})

function selectAdminTrainer(trainer: AdminTrainer) {
  selectedAdminTrainerId.value = trainer.trainerId
  Object.assign(adminTrainerEditForm, {
    name: trainer.name, whatsapp: trainer.whatsapp, email: trainer.email,
    dateOfBirth: trainer.dateOfBirth, sex: trainer.sex || 'feminino', cref: trainer.cref,
    instagram: trainer.instagram, slug: trainer.slug, cities: [...trainer.cities],
    academias: trainer.academias.join(', '), active: trainer.active,
  })
  adminTrainersStatus.value = ''
  void nextTick(() => document.querySelector<HTMLElement>('#admin-trainer-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

async function loadAdminTrainers() {
  if (!customerIsAdmin.value || adminTrainersLoading.value) return
  const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) { adminTrainersStatus.value = 'Entre novamente como administrador.'; return }
  adminTrainersLoading.value = true
  adminTrainersStatus.value = 'Carregando profissionais…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/admin/trainers', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' })
    const body = await response.json() as { trainers?: AdminTrainer[]; error?: string }
    if (!response.ok || !Array.isArray(body.trainers)) throw new Error(body.error || 'Não foi possível carregar os profissionais.')
    adminTrainers.value = body.trainers
    adminTrainersStatus.value = body.trainers.length ? '' : 'Nenhum profissional cadastrado.'
    if (selectedAdminTrainerId.value) {
      const selected = body.trainers.find(trainer => trainer.trainerId === selectedAdminTrainerId.value)
      if (selected) selectAdminTrainer(selected)
    }
  } catch (error) {
    adminTrainersStatus.value = error instanceof Error ? error.message : 'Não foi possível carregar os profissionais.'
  } finally { adminTrainersLoading.value = false }
}

function openAdminTrainers() {
  viewMode.value = 'admin-trainers'
  selectedAdminTrainerId.value = ''
  adminTrainerSearch.value = ''
  void loadAdminTrainers()
  void nextTick(() => window.scrollTo(0, 0))
}

async function saveAdminTrainerEdit() {
  if (!customerIsAdmin.value || !selectedAdminTrainerId.value || adminTrainerEditBusy.value) return
  if (!adminTrainerEditForm.cities.length) { adminTrainersStatus.value = 'Selecione pelo menos uma cidade.'; return }
  const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
  if (!token) { adminTrainersStatus.value = 'Entre novamente como administrador.'; return }
  adminTrainerEditBusy.value = true
  adminTrainersStatus.value = 'Salvando profissional…'
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/admin/trainers/' + encodeURIComponent(selectedAdminTrainerId.value), {
      method: 'PUT',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ ...adminTrainerEditForm, academias: adminTrainerEditForm.academias.split(',').map(name => name.trim()).filter(Boolean) }),
    })
    const body = await response.json() as { updated?: boolean; error?: string }
    if (!response.ok || !body.updated) throw new Error(body.error || 'Não foi possível salvar o profissional.')
    await loadAdminTrainers()
    adminTrainersStatus.value = 'Dados do profissional atualizados com sucesso.'
  } catch (error) {
    adminTrainersStatus.value = error instanceof Error ? error.message : 'Não foi possível salvar o profissional.'
  } finally { adminTrainerEditBusy.value = false }
}

const trainerSignedInName = ref('')
const trainerSignedInId = ref('')
const editingProfile = reactive<EditableProfile>({ name: '', whatsapp: '', email: '', dateOfBirth: '', instagram: '', cref: '', slug: '', academias: [] })
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
let sessionGeneration = 0
const requestLoginReturn = ref(false)
const trainingDayOptions = [
  { label: 'Seg', value: 'Segunda-feira' },
  { label: 'Ter', value: 'Terça-feira' },
  { label: 'Qua', value: 'Quarta-feira' },
  { label: 'Qui', value: 'Quinta-feira' },
  { label: 'Sex', value: 'Sexta-feira' },
  { label: 'Sáb', value: 'Sábado' },
]
const trainingShiftOptions = ['Manhã', 'Tarde', 'Noite']

const form = reactive({
  weight: '70',
  height: '170',
  waist: '85',
  calculateBodyFat: false,
  bodyFatAge: '',
  shareContactConsent: false,
  sessionsPerWeek: '1',
  name: '',
  phone: '',
  email: '',
  objective: 'Emagrecimento',
  sex: 'feminino' as Sex,
  age: '',
  clientGender: 'nao_informar' as 'feminino' | 'masculino' | 'nao_informar',
  city: '',
  trainerGenderPreference: 'indiferente' as 'indiferente' | 'feminino' | 'masculino',
  desiredDuration: '1 mês',
  singleLesson: false,
  withCompanion: false,
  attendsGym: false,
  gymName: '',

  trainingDays: ['Segunda-feira'] as string[],
  trainingShifts: ['Noite'] as string[],
})

const trainingStartMinutes = ref(1080)
const trainingEndMinutes = ref(1260)
function selectTrainingTimeRange(start: number, end: number) {
  trainingStartMinutes.value = start
  trainingEndMinutes.value = end
}
const trainingTimeShifts = computed(() => {
  const start = trainingStartMinutes.value
  const end = trainingEndMinutes.value
  return [
    ...(start < 720 && end > 300 ? ['Manhã'] : []),
    ...(start < 1080 && end > 720 ? ['Tarde'] : []),
    ...(end > 1080 ? ['Noite'] : []),
  ]
})

const result = ref<ImcResult | null>(null)

// Cada tela lógica começa no topo, inclusive ao voltar ou alternar cadastros.
// Não interfere na rolagem durante a interação com a mesma tela.
const currentScreen = computed(() => [
  viewMode.value,
  showTrainerSignup.value,
  showCustomerSignup.value,
  showCustomerLogin.value,
  Boolean(result.value),
].join(':'))

watch(currentScreen, async () => {
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}, { flush: 'post' })

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
  form.clientGender = 'nao_informar'
  form.city = ''
  form.sessionsPerWeek = '1'
  form.trainingDays = ['Segunda-feira']
  form.trainingShifts = ['Noite']
  trainingStartMinutes.value = 1080
  trainingEndMinutes.value = 1260
  googleProfileStatus.value = ''
}

function applyCustomerProfile(profile: { name: string; whatsapp: string; email: string; dateOfBirth?: string; isAdmin?: boolean }) {
  customerIsAdmin.value = profile.isAdmin === true
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
  requestBirthDate.value = profile.dateOfBirth ?? ''
  customerSignedInName.value = profile.name
  trainerSignedInName.value = ''
  trainerSignedInId.value = ''
  try { sessionStorage.removeItem('fitpeso-trainer-session') } catch { /* armazenamento indisponível */ }
}

async function loadCustomerProfile(token: string, signal?: AbortSignal) {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(`${endpoint}/api/customers/profile`, {
    signal, method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const body = await response.json() as {
    authenticated?: boolean
    profile?: { name: string; whatsapp: string; email: string; dateOfBirth?: string; isAdmin?: boolean }
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
  clearPendingWhatsAppLogin()
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
  customerIsAdmin.value = false
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
  editingProfile.academias = []
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

function openProfessionalRegistration() {
  viewMode.value = 'professional-registration'
  void nextTick(() => window.scrollTo(0, 0))
}

function goBackFromTitle() {
  if (showCustomerLogin.value) {
    if (loginStep.value !== 1 || emailLoginPending.value) returnToLoginIdentifier()
    else closeCustomerLogin()
    return
  }
  if (showCustomerSignup.value) { closeCustomerSignup(); return }
  if (showTrainerSignup.value) { closeTrainerSignup(); return }
  if (viewMode.value === 'contact' && showRequestForm.value) {
    if (requestStep.value > 1) requestStep.value -= 1
    else goHome()
  } else if (viewMode.value === 'select-trainers') {
    void returnToDraftSummary()
    return
  } else {
    goHome()
  }
  void nextTick(() => window.scrollTo(0, 0))
}

function goHome() {
  if (window.location.pathname === '/profissionais') window.history.replaceState(null, '', '/')
  clearPendingWhatsAppLogin()
  showTrainerSignup.value = false
  showCustomerSignup.value = false
  showCustomerLogin.value = false
  loginStep.value = 1
  emailLoginPending.value = false
  emailLoginError.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
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
      body: JSON.stringify({ name, sex, slug, whatsapp: phone, ...(dateOfBirth ? { dateOfBirth } : {}), ...(email ? { email } : {}), cities: trainerForm.cities, academias: trainerForm.academias, instagram, ...(cref ? { cref } : {}) }),
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

const supportedRequestCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'] as const
const detectingRequestCity = ref(false)
const requestCityLocationMessage = ref('')
const homeCity = ref('')
const storedHomeCity = readNavigationPreference(NAV_CITY)
const homeCityManuallySelected = ref(storedHomeCity !== '' && supportedRequestCities.some(city => city === storedHomeCity))
if (homeCityManuallySelected.value) homeCity.value = storedHomeCity
const homeTrainerCount = ref<number | null>(null)
const homeTrainerCountLoading = ref(false)
let homeCityCountLookupId = 0

const HOME_TRAINER_COUNT_TTL_MS = 24 * 60 * 60 * 1000
const homeTrainerCountRequests = new Map<string, Promise<number>>()

async function loadHomeTrainerCount(city: string) {
  const lookupId = ++homeCityCountLookupId
  const cacheKey = `fitpeso:trainer-count:v1:${city}`
  try {
    const stored = localStorage.getItem(cacheKey)
    if (stored) {
      const cached = JSON.parse(stored) as { count?: number; expiresAt?: number }
      if (Number.isInteger(cached.count) && Number(cached.count) >= 0 && Number(cached.expiresAt) > Date.now()) {
        homeTrainerCount.value = Number(cached.count)
        homeTrainerCountLoading.value = false
        return
      }
    }
  } catch { /* Storage may be unavailable; fall back to the API. */ }

  homeTrainerCount.value = null
  homeTrainerCountLoading.value = true
  try {
    let pending = homeTrainerCountRequests.get(city)
    if (!pending) {
      pending = (async () => {
        const endpoint = await getRequestApiEndpoint()
        const query = new URLSearchParams({ city, gender: 'indiferente' })
        const response = await fetch(`${endpoint}/api/trainers/eligible?${query}`)
        const body = await response.json() as { count?: number; trainers?: EligibleTrainer[] }
        if (!response.ok) throw new Error('Unavailable')
        const count = Number.isInteger(body.count) ? Number(body.count) : Array.isArray(body.trainers) ? body.trainers.length : NaN
        if (!Number.isInteger(count) || count < 0) throw new Error('Invalid count')
        try { localStorage.setItem(cacheKey, JSON.stringify({ count, expiresAt: Date.now() + HOME_TRAINER_COUNT_TTL_MS })) } catch { /* Optional cache */ }
        return count
      })().finally(() => homeTrainerCountRequests.delete(city))
      homeTrainerCountRequests.set(city, pending)
    }
    const count = await pending
    if (lookupId === homeCityCountLookupId) homeTrainerCount.value = count
  } catch {
    if (lookupId === homeCityCountLookupId) homeTrainerCount.value = null
  } finally {
    if (lookupId === homeCityCountLookupId) homeTrainerCountLoading.value = false
  }
}

function updateHomeCity(city: string) {
  if (homeCityManuallySelected.value) return
  if (homeCity.value === city) return
  homeCity.value = city
  if (viewMode.value === 'public-trainers') {
    if (publicTrainerCity.value !== city) sharingRequestMessage.value = ''
    publicTrainerCity.value = city
    homeSelectedTrainerIds.value = []
    void loadPublicTrainers()
  }
  void loadHomeTrainerCount(city)
}

function selectHomeCity(event: Event) {
  const city = (event.target as HTMLSelectElement).value
  if (!supportedRequestCities.some(item => item === city)) return
  homeCityManuallySelected.value = true
  homeCity.value = city
  saveNavigationPreference(NAV_CITY, city)
  void loadHomeTrainerCount(city)
}

watch(homeAcademy, academy => saveNavigationPreference(NAV_ACADEMY, academy))

watch(homeCity, city => {
  homeSelectedTrainerIds.value = []
  if (city && viewMode.value === 'public-trainers') searchHomeTrainers()
})

let requestCityLookupId = 0

function normalizeRequestCity(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

const requestCitySuggestions = computed(() => {
  const query = normalizeRequestCity(form.city)
  if (query.length < 3) return []
  return supportedRequestCities.filter(city => normalizeRequestCity(city).includes(query))
})

function matchSupportedRequestCity(value: string): string {
  const normalized = value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase()
  return supportedRequestCities.find(city =>
    city.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase() === normalized
  ) ?? ''
}

async function detectRequestCity(cityDetectionScope: 'request' | 'home' = 'request') {
  if (!navigator.geolocation) {
    requestCityLocationMessage.value = 'Selecione sua cidade na lista.'
    return
  }
  const lookupId = ++requestCityLookupId
  if (cityDetectionScope === 'request') detectingRequestCity.value = true
  if (cityDetectionScope === 'request') requestCityLocationMessage.value = 'Identificando sua cidade…'
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      // Reverse geocoding is used only to obtain the municipality; coordinates are not stored.
      const params = new URLSearchParams({
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
        localityLanguage: 'pt',
      })
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error('Geocoding unavailable')
      const location = await response.json() as {
        city?: string
        locality?: string
        localityInfo?: { administrative?: Array<{ name?: string; adminLevel?: number }> }
      }
      if (cityDetectionScope === 'request' && (lookupId !== requestCityLookupId || !showRequestForm.value || requestStep.value > 3)) return
      const candidates = [
        location.city ?? '',
        location.locality ?? '',
        ...(location.localityInfo?.administrative ?? []).map(item => item.name ?? ''),
      ]
      const city = candidates.map(matchSupportedRequestCity).find(Boolean) ?? ''
      if (city) {
        updateHomeCity(city)
        if (cityDetectionScope === 'request') {
          if (!form.city) form.city = city
          requestCityLocationMessage.value = 'Cidade sugerida pela localização. Você pode alterá-la.'
        }
      } else if (cityDetectionScope === 'request') {
        requestCityLocationMessage.value = 'Sua cidade não está entre as atendidas. Selecione uma cidade da lista.'
      }
    } catch {
      if (cityDetectionScope === 'request' && lookupId === requestCityLookupId) requestCityLocationMessage.value = 'Não foi possível identificar sua cidade. Selecione na lista.'
    } finally {
      if (cityDetectionScope === 'request' && lookupId === requestCityLookupId) detectingRequestCity.value = false
    }
  }, () => {
    if (cityDetectionScope === 'request' && lookupId !== requestCityLookupId) return
    if (cityDetectionScope === 'request') detectingRequestCity.value = false
    if (cityDetectionScope === 'request') requestCityLocationMessage.value = 'Localização indisponível. Selecione sua cidade na lista.'
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
}

async function openRequestForm() {
  status.value = ''
  showRequestForm.value = true
  requestStep.value = 1
  selectingTrainersForDraft.value = false
  ++requestCityLookupId
  form.city = homeCity.value
  requestCityLocationMessage.value = ''
  form.trainerGenderPreference = 'indiferente'
  form.sessionsPerWeek = '1'
  form.trainingDays = ['Segunda-feira']
  form.trainingShifts = ['Noite']
  trainingStartMinutes.value = 1080
  trainingEndMinutes.value = 1260
  form.desiredDuration = '1 mês'
  form.singleLesson = false
  form.withCompanion = false
  eligibleTrainers.value = []
  selectedTrainerIds.value = []
  form.gymName = defaultAcademyForCity(form.city)
  form.attendsGym = Boolean(form.gymName)
  otherGymName.value = ''
  form.objective = 'Emagrecimento'
  viewMode.value = 'contact'
  publicTrainerCity.value = form.city
  if (publicTrainerCity.value) void loadPublicTrainers()
  await nextTick()
  window.scrollTo(0, 0)
  if (!homeCity.value) void detectRequestCity()
}

async function openCustomerLogin(fromRequest = false, method: 'google' | 'whatsapp' = 'google') {
  requestLoginReturn.value = fromRequest
  loginAsTrainer.value = fromRequest ? false : readNavigationPreference(NAV_ROLE) === 'trainer'
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
  window.scrollTo(0, 0)
}

async function searchEligibleTrainers() {
  status.value = ''
  selectedTrainerIds.value = []
  const selectedCity = matchSupportedRequestCity(form.city)
  if (!selectedCity) { status.value = 'Selecione uma cidade atendida nas sugestões para buscar profissionais.'; return }
  form.city = selectedCity
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
    selectedTrainerIds.value = pendingHomeTrainerIds.value.filter(id => body.trainers!.some(t => t.trainerId === id)).slice(0, 20)
    pendingHomeTrainerIds.value = []
    status.value = ''
    requestStep.value = 3
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível consultar os profissionais agora.'
  } finally { checkingTrainers.value = false }
}

function defaultAcademyForCity(city: string): string {
  if (!isMesquita(city)) return ''
  return publicTrainerAcademies.value.find(name => name.trim().toLocaleLowerCase('pt-BR') === 'aquatic center — vila emil')
    ?? publicTrainerAcademies.value.find(name => /aquatic\s*center/i.test(name) && /vila\s*emil/i.test(name))
    ?? ''
}
watch(publicTrainerAcademies, () => {
  if (viewMode.value === 'contact' && !form.gymName) {
    form.gymName = defaultAcademyForCity(form.city)
    form.attendsGym = Boolean(form.gymName)
  }
})
const otherGymName = ref('')
watch(() => form.city, city => {
  if (viewMode.value !== 'contact' || requestStep.value > 3) return
  form.gymName = defaultAcademyForCity(city)
  form.attendsGym = Boolean(form.gymName)
  otherGymName.value = ''
  publicTrainerCity.value = city
  if (city) void loadPublicTrainers()
})

async function modifyRequestDetails() {
  requestStep.value = 1
  status.value = ''
  await nextTick()
  window.scrollTo(0, 0)
}

async function continueToTrainerSelection() {
  status.value = ''
  if (requestStep.value === 1) {
    const age = Number(String(form.age).trim())
    if (!String(form.age).trim() || !Number.isInteger(age) || age < 1 || age > 120) {
      status.value = 'Informe sua idade (de 1 a 120 anos).'
      return
    }
    const sessions = Number(form.sessionsPerWeek)
    if (!form.objective) { status.value = 'Selecione seu objetivo.'; return }
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 4) {
      status.value = 'Selecione de 1 a 4 aulas por semana.'
      return
    }
  } else if (requestStep.value === 2) {
    if (!form.gymName) { status.value = 'Selecione uma academia.'; return }
    if (form.gymName === 'Outros' && !otherGymName.value.trim()) {
      status.value = 'Informe o lugar onde pretende treinar.'
      return
    }
    form.attendsGym = true
    if (!form.trainingDays.length) { status.value = 'Selecione pelo menos um dia da semana.'; return }
    if (trainingStartMinutes.value >= trainingEndMinutes.value) {
      status.value = 'Informe uma faixa de horário válida.'
      return
    }
    const selectedCity = matchSupportedRequestCity(form.city)
    if (!selectedCity) { status.value = 'Selecione uma cidade atendida.'; return }
    form.city = selectedCity
  }
  if (requestStep.value < 4) requestStep.value += 1
  await nextTick()
  window.scrollTo(0, 0)
}

function reviewRequest() {
  if (!selectedTrainerIds.value.length) { status.value = 'Selecione ao menos um profissional.'; return }
  requestStep.value = 4
  status.value = ''
}

async function selectTrainersForDraft() {
  if (!matchSupportedRequestCity(form.city)) { status.value = 'Selecione uma cidade atendida antes de escolher os profissionais.'; requestStep.value = 2; return }
  status.value = ''
  selectingTrainersForDraft.value = true
  publicTrainerCity.value = form.city
  publicTrainerAcademy.value = ''
  homeSelectedTrainerIds.value = [...selectedTrainerIds.value]
  viewMode.value = 'select-trainers'
  await loadPublicTrainers()
  await nextTick()
  window.scrollTo(0, 0)
}
async function returnToDraftSummary() {
  selectedTrainerIds.value = [...homeSelectedTrainerIds.value]
  selectingTrainersForDraft.value = false
  viewMode.value = 'contact'
  requestStep.value = 4
  showRequestForm.value = true
  await nextTick()
  window.scrollTo(0, 0)
}
async function confirmServiceRequest() {
  if (!selectedTrainerIds.value.length) { status.value = 'Selecione pelo menos um personal antes de enviar a solicitação.'; return }
  if (!/^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(String(form.age).trim())) { status.value = 'Informe sua idade (de 1 a 120 anos) antes de enviar.'; return }
  if (!customerSignedInName.value) {
    await openCustomerLogin(true, 'whatsapp')
    return
  }
  form.shareContactConsent = true
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
    customerRequests.value = body.requests.filter(request =>
      !request.requestExpired &&
      request.validUntil * 1000 > Date.now() &&
      request.lifecycle === 'OPEN'
    )
    customerRequestsStatus.value = customerRequests.value.length ? '' : 'Você não possui solicitações ativas.'
  } catch (error) { customerRequestsStatus.value = error instanceof Error ? error.message : 'Não foi possível carregar suas solicitações.' }
}

async function changeRequestVisibility(request: CustomerRequest, action: 'deactivate' | 'reactivate') {
  if (changingRequestId.value || request.requestExpired || request.validUntil * 1000 <= Date.now()) return
  if (action === 'deactivate' && (request.lifecycle !== 'OPEN' || request.proposalCount !== 0 || request.proposals.length !== 0)) return
  if (action === 'reactivate' && request.lifecycle !== 'INACTIVE') return
  requestActionError.value = ''
  requestActionDialog.value = { request, action }
}

async function confirmRequestVisibilityChange() {
  const pending = requestActionDialog.value
  if (!pending || changingRequestId.value) return
  const { request, action } = pending
  changingRequestId.value = request.requestId
  customerRequestsStatus.value = ''
  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/requests/${encodeURIComponent(request.requestId)}/visibility`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    })
    const body = await response.json() as { updated?: boolean; error?: string }
    if (!response.ok || !body.updated) throw new Error(body.error || 'Não foi possível atualizar a solicitação.')
    requestActionDialog.value = null
    await openCustomerRequests()
    customerRequestsStatus.value = action === 'deactivate' ? 'Solicitação inativada. Você pode reativá-la até o vencimento.' : 'Solicitação reativada.'
  } catch (error) {
    requestActionError.value = error instanceof Error ? error.message : 'Não foi possível atualizar a solicitação.'
  } finally { changingRequestId.value = '' }
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


async function loadTrainerSession(token: string, signal?: AbortSignal): Promise<TrainerAccountProfile> {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(endpoint + '/api/trainers/profile', {
    signal, method: 'POST', headers: { authorization: 'Bearer ' + token }, cache: 'no-store',
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


function applyProfileForEditing(profile: { name: string; whatsapp: string; email?: string; dateOfBirth?: string; instagram?: string; cref?: string; slug?: string; academias?: string[] }) {
  editingProfile.name = profile.name ?? ''
  editingProfile.whatsapp = profile.whatsapp ?? ''
  editingProfile.email = profile.email ?? ''
  editingProfile.dateOfBirth = profile.dateOfBirth ?? ''
  editingProfile.instagram = profile.instagram ?? ''
  editingProfile.cref = profile.cref ?? ''
  editingProfile.slug = profile.slug ?? ''
  editingProfile.academias = [...(profile.academias ?? [])]
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
      body: JSON.stringify(trainer ? { name, dateOfBirth: birth, instagram, cref, academias: editingProfile.academias } : { name, ...(birth ? { dateOfBirth: birth } : {}) }),
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
    if (!trainer && requestStep.value === 4 && showRequestForm.value && isValidLoginBirthDate(customerForm.dateOfBirth)) {
      viewMode.value = 'contact'
      status.value = 'Cadastro completo. Agora você pode confirmar sua solicitação.'
      await nextTick()
      window.scrollTo(0, 0)
    }
  } catch (error) {
    if (sessionGeneration === generation) editingProfileStatus.value = error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'
  } finally {
    if (sessionGeneration === generation) editingProfileSaving.value = false
  }
}

// The progress measures a fifteen-second waiting window, never authentication success.
type PendingWhatsAppLogin = {
  role: 'customer' | 'trainer'; whatsapp: string; code: string; token: string
  expiresAt: number; progressStartedAt: number; awaitingReturn: boolean
}
const pendingWhatsAppKey = 'fitpeso-pending-whatsapp-login'
const whatsappProgressDurationMs = 15_000
const pendingWhatsAppLogin = ref<PendingWhatsAppLogin | null>(null)
const whatsappClock = ref(Date.now())
const whatsappChecking = ref(false)
const whatsappConfirmed = ref(false)
const whatsappNetworkError = ref(false)
const whatsappProgressStartedAt = computed(() => pendingWhatsAppLogin.value?.progressStartedAt ?? 0)
const whatsappProgress = computed(() => whatsappConfirmed.value ? 100 : whatsappProgressStartedAt.value
  ? Math.min(100, Math.max(0, Math.floor(((whatsappClock.value - whatsappProgressStartedAt.value) / whatsappProgressDurationMs) * 100))) : 0)
const whatsappSecondsRemaining = computed(() => Math.max(0, Math.ceil((whatsappProgressDurationMs - (whatsappClock.value - whatsappProgressStartedAt.value)) / 1000)))
let whatsappCheckTimer: number | undefined
let whatsappClockTimer: number | undefined
let whatsappRequest: AbortController | undefined
let whatsappAttemptGeneration = 0
let whatsappLeftPage = false

function persistWhatsAppAttempt() {
  try {
    if (pendingWhatsAppLogin.value) sessionStorage.setItem(pendingWhatsAppKey, JSON.stringify(pendingWhatsAppLogin.value))
    else sessionStorage.removeItem(pendingWhatsAppKey)
  } catch { /* The current attempt still works when storage is unavailable. */ }
}

function stopWhatsAppTimers() {
  window.clearTimeout(whatsappCheckTimer)
  window.clearInterval(whatsappClockTimer)
  whatsappCheckTimer = undefined
  whatsappClockTimer = undefined
}

function clearPendingWhatsAppLogin() {
  whatsappAttemptGeneration += 1
  stopWhatsAppTimers()
  whatsappRequest?.abort()
  whatsappRequest = undefined
  pendingWhatsAppLogin.value = null
  whatsappChecking.value = false
  whatsappConfirmed.value = false
  whatsappNetworkError.value = false
  whatsappLeftPage = false
  persistWhatsAppAttempt()
}

function saveNewWhatsAppAttempt(role: PendingWhatsAppLogin['role'], whatsapp: string, code: string, token: string, expiresAt?: number) {
  clearPendingWhatsAppLogin()
  pendingWhatsAppLogin.value = { role, whatsapp, code, token,
    expiresAt: expiresAt ? expiresAt * 1000 : Date.now() + 15 * 60_000,
    progressStartedAt: 0, awaitingReturn: false }
  persistWhatsAppAttempt()
  startWhatsAppClock()
}

function expireWhatsAppAttempt() {
  const role = pendingWhatsAppLogin.value?.role
  clearPendingWhatsAppLogin()
  if (role === 'trainer') {
    trainerLoginCode.value = ''
    trainerLoginToken.value = ''
    trainerLoginDialog.value = false
    trainerLoginError.value = 'O código expirou. Inicie o login novamente.'
  } else {
    customerLoginCode.value = ''
    customerLoginSessionToken.value = ''
    showCustomerLoginDialog.value = false
    customerLoginError.value = 'O código expirou. Inicie o login novamente.'
  }
}

function startWhatsAppClock() {
  window.clearInterval(whatsappClockTimer)
  whatsappClock.value = Date.now()
  if (document.hidden) return
  whatsappClockTimer = window.setInterval(() => {
    whatsappClock.value = Date.now()
    if (pendingWhatsAppLogin.value && Date.now() >= pendingWhatsAppLogin.value.expiresAt) expireWhatsAppAttempt()
  }, 100)
}

function scheduleWhatsAppLoginCheck(delay = 3000) {
  window.clearTimeout(whatsappCheckTimer)
  if (!pendingWhatsAppLogin.value || document.hidden) return
  whatsappCheckTimer = window.setTimeout(() => void checkPendingWhatsAppLogin(), delay)
}

function markWhatsAppOpened() {
  if (!pendingWhatsAppLogin.value) return
  pendingWhatsAppLogin.value.awaitingReturn = true
  whatsappLeftPage = false
  persistWhatsAppAttempt()
}
function onWhatsAppBlur() {
  if (pendingWhatsAppLogin.value?.awaitingReturn) whatsappLeftPage = true
}
function onWhatsAppVisibilityChange() {
  if (document.hidden) {
    onWhatsAppBlur()
    stopWhatsAppTimers()
  } else onWhatsAppReturn()
}
function onWhatsAppReturn() {
  const attempt = pendingWhatsAppLogin.value
  if (!attempt || document.hidden) return
  if (attempt.awaitingReturn && whatsappLeftPage) {
    attempt.progressStartedAt = Date.now()
    attempt.awaitingReturn = false
    whatsappLeftPage = false
    persistWhatsAppAttempt()
  }
  startWhatsAppClock()
  void checkPendingWhatsAppLogin()
}

function restoreWhatsAppAttempt() {
  try {
    const raw = sessionStorage.getItem(pendingWhatsAppKey)
    if (!raw) return
    const a = JSON.parse(raw) as PendingWhatsAppLogin
    if (!a || !['customer', 'trainer'].includes(a.role) || !/^\+55\d{10,11}$/.test(a.whatsapp) ||
      !/^[A-Za-z0-9_-]{22}$/.test(a.code) || !/^[A-Za-z0-9_-]{43}$/.test(a.token) ||
      !Number.isFinite(a.expiresAt) || !Number.isFinite(a.progressStartedAt) ||
      a.progressStartedAt < 0 || a.progressStartedAt > Date.now() || typeof a.awaitingReturn !== 'boolean' ||
      a.expiresAt > Date.now() + 15 * 60_000) {
      sessionStorage.removeItem(pendingWhatsAppKey)
      return
    }
    pendingWhatsAppLogin.value = a
    showCustomerLogin.value = true
    showCustomerSignup.value = false
    showTrainerSignup.value = false
    loginAsTrainer.value = a.role === 'trainer'
    loginIdentifierKind.value = 'whatsapp'
    loginIdentifier.value = a.whatsapp
    customerLoginWhatsApp.value = a.whatsapp
    loginStep.value = 2
    customerLoginMethod.value = 'whatsapp'
    const link = 'https://wa.me/5521971118383?text=' + encodeURIComponent(`Confirmar login FitPeso ${a.code}\nWhatsApp: ${a.whatsapp}`)
    if (a.role === 'trainer') {
      trainerLoginCode.value = a.code
      trainerLoginToken.value = a.token
      trainerLoginLink.value = link
      trainerLoginDialog.value = true
    } else {
      customerLoginCode.value = a.code
      customerLoginSessionToken.value = a.token
      customerLoginVerificationLink.value = link
      showCustomerLoginDialog.value = true
    }
    if (Date.now() >= a.expiresAt) { expireWhatsAppAttempt(); return }
    // Reloading after opening WhatsApp is also a return; an existing timer is preserved.
    whatsappLeftPage = a.awaitingReturn
    onWhatsAppReturn()
  } catch {
    clearPendingWhatsAppLogin()
  }
}

async function checkPendingWhatsAppLogin() {
  const attempt = pendingWhatsAppLogin.value
  if (!attempt || document.hidden || whatsappChecking.value || whatsappConfirmed.value) return
  if (Date.now() >= attempt.expiresAt) { expireWhatsAppAttempt(); return }
  window.clearTimeout(whatsappCheckTimer)
  const controller = new AbortController()
  whatsappRequest = controller
  whatsappChecking.value = true
  const isCurrent = () => pendingWhatsAppLogin.value === attempt && !controller.signal.aborted
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const endpoint = await getRequestApiEndpoint(controller.signal)
    if (!isCurrent()) return
    const response = await fetch(`${endpoint}/api/${attempt.role === 'trainer' ? 'trainers' : 'customers'}/login-status`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ whatsapp: attempt.whatsapp, code: attempt.code, sessionToken: attempt.token }),
    })
    const body = await response.json() as { authenticated?: boolean; expired?: boolean; confirmed?: boolean }
    if (!isCurrent()) return
    if (!response.ok) throw new Error('Status unavailable')
    whatsappNetworkError.value = false
    if (body.expired) { expireWhatsAppAttempt(); return }
    if (body.authenticated) {
      whatsappConfirmed.value = true
      window.clearInterval(whatsappClockTimer)
      if (attempt.role === 'trainer') {
        const profile = await loadTrainerSession(attempt.token, controller.signal)
        if (!isCurrent()) return
        try { sessionStorage.setItem('fitpeso-trainer-session', attempt.token) } catch { /* Session remains in memory. */ }
        applyTrainerSession(profile)
        trainerLoginDialog.value = false
        showCustomerLogin.value = false
        clearPendingWhatsAppLogin()
        trainerLoginCode.value = ''
        trainerLoginToken.value = ''
        goHome()
      } else {
        const profile = await loadCustomerProfile(attempt.token, controller.signal)
        if (!isCurrent()) return
        try {
          sessionStorage.setItem('fitpeso-customer-session', attempt.token)
          sessionStorage.removeItem('fitpeso-google-session')
        } catch { /* Session remains in memory. */ }
        applyCustomerProfile(profile)
        customerLoginError.value = ''
        customerLoginStatus.value = 'WhatsApp confirmado! Seus dados foram carregados.'
        showCustomerLoginDialog.value = false
        showCustomerLogin.value = false
        clearPendingWhatsAppLogin()
        customerLoginCode.value = ''
        customerLoginSessionToken.value = ''
        await returnToRequestFormAfterLogin()
      }
    } else if (body.confirmed) {
      returnToLoginIdentifier()
      customerLoginError.value = 'Não foi possível confirmar o login. Confira o WhatsApp e tente novamente.'
    }
  } catch {
    if (pendingWhatsAppLogin.value === attempt) {
      whatsappNetworkError.value = true
      whatsappConfirmed.value = false
      startWhatsAppClock()
    }
  } finally {
    window.clearTimeout(timeout)
    if (whatsappRequest === controller) {
      whatsappRequest = undefined
      whatsappChecking.value = false
      if (pendingWhatsAppLogin.value === attempt && controller.signal.aborted) {
        whatsappNetworkError.value = true
        whatsappConfirmed.value = false
        startWhatsAppClock()
      }
      scheduleWhatsAppLoginCheck()
    }
  }
}

onUnmounted(() => {
  document.removeEventListener('pointerdown', closeHamburgerOnOutsideClick)
  document.removeEventListener('click', closeHamburgerOnSelection)
  stopWhatsAppTimers()
  whatsappRequest?.abort()
  document.removeEventListener('visibilitychange', onWhatsAppVisibilityChange)
  window.removeEventListener('focus', onWhatsAppReturn)
  window.removeEventListener('blur', onWhatsAppBlur)
})

function changeLoginProfile() {
  if (!requestLoginReturn.value) saveNavigationPreference(NAV_ROLE, loginAsTrainer.value ? 'trainer' : 'customer')
  clearPendingWhatsAppLogin()
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
  trainerLoginSubmitting.value = true
  trainerLoginError.value = ''
  trainerLoginStatus.value = 'Preparando acesso…'
  const generation = whatsappAttemptGeneration
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/trainers/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp, sessionToken: token }),
    })
    const body = await response.json() as { started?: boolean; verificationCode?: string; expiresAt?: number; error?: string }
    if (generation !== whatsappAttemptGeneration) return
    if (!response.ok || !body.started || !body.verificationCode) throw new Error(body.error || 'Não foi possível iniciar o login.')
    trainerLoginCode.value = body.verificationCode
    trainerLoginToken.value = token
    trainerLoginLink.value = 'https://wa.me/5521971118383?text=' + encodeURIComponent('Confirmar login FitPeso ' + body.verificationCode + '\nWhatsApp: ' + whatsapp)
    trainerLoginDialog.value = true
    saveNewWhatsAppAttempt('trainer', whatsapp, body.verificationCode, token, body.expiresAt)
    trainerLoginStatus.value = 'Toque no botão da janela para enviar a mensagem à Beta pelo WhatsApp. Depois, aguarde a confirmação automática.'
    scheduleWhatsAppLoginCheck(1000)
  } catch (error) {
    trainerLoginError.value = error instanceof Error ? error.message : 'Não foi possível iniciar o login.'
    trainerLoginStatus.value = ''
  } finally {
    trainerLoginSubmitting.value = false
  }
}

async function pollTrainerWhatsAppLogin() {
  await checkPendingWhatsAppLogin()
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
  scheduleWhatsAppLoginCheck(delayMs)
}

async function pollCustomerLogin() {
  await checkPendingWhatsAppLogin()
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
  customerLoginSubmitting.value = true
  customerLoginStatus.value = 'Preparando o acesso…'
  const generation = whatsappAttemptGeneration
  try {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const sessionToken = btoa(Array.from(randomBytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(`${endpoint}/api/customers/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp, sessionToken }),
    })
    const body = await response.json() as { started?: boolean; verificationCode?: string; expiresAt?: number; error?: string }
    if (generation !== whatsappAttemptGeneration) return
    if (!response.ok || body.started !== true || !body.verificationCode) throw new Error(body.error || 'Não foi possível iniciar o login agora.')
    customerLoginWhatsApp.value = whatsapp
    customerLoginCode.value = body.verificationCode
    customerLoginSessionToken.value = sessionToken
    customerLoginVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(`Confirmar login FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}`)}`
    saveNewWhatsAppAttempt('customer', whatsapp, body.verificationCode, sessionToken, body.expiresAt)
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
  clearPendingWhatsAppLogin()
  loginStep.value = 1
  emailLoginPending.value = false
  emailLoginError.value = ''
  customerLoginError.value = ''
  trainerLoginError.value = ''
  if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
  emailLoginPollTimer = undefined
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
  showCustomerLoginDialog.value = false
  goHome()
}

function openCustomerSignupFromLogin() {
  clearPendingWhatsAppLogin()
  signupStep.value = 1
  signupContact.value = loginIdentifier.value.trim()
  showCustomerLogin.value = false
  showCustomerSignup.value = true
  history.replaceState(null, '', `${window.location.pathname}#cadastro-cliente`)
}

async function finishEmailLoginFromLink() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('emailLoginCode')
  if (!code) return
  // Remove the one-time code from history before making network requests.
  url.searchParams.delete('emailLoginCode')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  try {
    const endpoint = await getRequestApiEndpoint()
    const response = await fetch(endpoint + '/api/customers/verify-email-login?code=' + encodeURIComponent(code), {
      method: 'POST', cache: 'no-store',
    })
    const result = await response.json() as { authenticated?: boolean; sessionToken?: string; role?: string; error?: string }
    if (!response.ok || !result.authenticated || !result.sessionToken) throw new Error(result.error || 'Não foi possível confirmar o e-mail.')
    const token = result.sessionToken
    if (result.role === 'trainer') {
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
    showCustomerLogin.value = false
    goHome()
  } catch (error) {
    emailLoginError.value = error instanceof Error ? error.message : 'Não foi possível confirmar o login.'
    showCustomerLogin.value = true
  }
}

function closeHamburgerOnOutsideClick(event: PointerEvent) {
  const menu = document.querySelector<HTMLDetailsElement>('.main-hamburger-menu[open]')
  if (menu && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
}

function closeHamburgerOnSelection(event: MouseEvent) {
  const menu = document.querySelector<HTMLDetailsElement>('.main-hamburger-menu[open]')
  if (menu && event.target instanceof Element && event.target.closest('.account-dropdown-panel button')) menu.open = false
}

usePublicNavigation(viewMode, () => {
  selectingTrainersForDraft.value = false
  publicTrainerCity.value = homeCity.value || ''
  publicTrainerAcademy.value = ''
  viewMode.value = 'public-trainers'
  if (publicTrainerCity.value) void loadPublicTrainers()
}, () => {
  viewMode.value = 'home'
  selectingTrainersForDraft.value = false
})

watch(viewMode, mode => updatePageSeo(mode === 'home' ? 'home' : mode === 'public-trainers' ? 'directory' : 'private'), { immediate: true })

onMounted(() => {
  if (viewMode.value === 'public-trainers') {
    publicTrainerCity.value = homeCity.value
    if (publicTrainerCity.value) void loadPublicTrainers()
  }
  document.addEventListener('pointerdown', closeHamburgerOnOutsideClick)
  document.addEventListener('click', closeHamburgerOnSelection)
  void finishEmailLoginFromLink()
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)
  if (trainerRequestToken) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  void loadTrainerProfile()
  void loadTrainerRequest()
  if (isRootHome && !homeCityManuallySelected.value) void detectRequestCity('home')
  if (homeCity.value) void loadHomeTrainerCount(homeCity.value)
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
  restoreWhatsAppAttempt()
  document.addEventListener('visibilitychange', onWhatsAppVisibilityChange)
  window.addEventListener('focus', onWhatsAppReturn)
  window.addEventListener('blur', onWhatsAppBlur)
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
    requestId?: string
    error?: string
  }
  if (!response.ok || body.created !== true || !body.requestId) {
    throw new Error(body.error || 'Não foi possível registrar a solicitação agora. Tente novamente.')
  }
  return body.requestId
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
  const validCity = Boolean(matchSupportedRequestCity(city))
  const validAge = age !== undefined && Number.isInteger(age) && age >= 1 && age <= 120
  const normalizedPhoneDigits = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`
  const validPhone = /^55[1-9]{2}9?\d{8}$/.test(normalizedPhoneDigits)

  if (!validName || !validCity || !validAge || !validPhone) {
    status.value = 'Confira o nome, o WhatsApp, a cidade e informe sua idade (de 1 a 120 anos).'
    return
  }
  if (!selectedTrainerIds.value.length) { status.value = 'Selecione pelo menos um personal.'; return }
  if (!Number.isInteger(Number(form.sessionsPerWeek)) || Number(form.sessionsPerWeek) < 1 || Number(form.sessionsPerWeek) > 4 || !form.trainingDays.length || trainingStartMinutes.value >= trainingEndMinutes.value) {
    status.value = 'Informe as aulas por semana, pelo menos um dia e uma faixa de horário válida.'
    return
  }
  const trainingDays = form.trainingDays
  const trainingShifts = trainingTimeShifts.value

  submittingRequest.value = true
  status.value = 'Enviando sua solicitação para a Beta…'

  try {
    const token = sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
    if (!token) throw new Error('Entre na sua conta para solicitar atendimento.')
    const createdRequestId = await createFitpesoRequest({
      clientName,
      clientPhone: `+${normalizedPhoneDigits}`,
      ...(email ? { email } : {}),
      age,
      clientGender: form.clientGender,
      city,
      trainerGenderPreference: form.trainerGenderPreference,
      desiredDuration: form.singleLesson ? 'Aula avulsa' : form.desiredDuration,
      singleLesson: form.singleLesson,
      withCompanion: form.withCompanion,
      attendsGym: form.attendsGym,
      ...(form.attendsGym && form.gymName.trim() ? { gymName: form.gymName === 'Outros' ? otherGymName.value.trim() : form.gymName.trim() } : {}),
      objective: form.objective,
      ...(form.sessionsPerWeek ? { sessionsPerWeek: Number(form.sessionsPerWeek) } : {}),
      trainingDays,
      trainingShifts,
      trainingStartTime: minutesToTime(trainingStartMinutes.value),
      trainingEndTime: minutesToTime(trainingEndMinutes.value),
      selectedTrainerIds: selectedTrainerIds.value,
      consent: form.shareContactConsent,
    })
    sharingRequestId.value = createdRequestId
    sharingRequestMessage.value = 'Solicitação criada com os profissionais selecionados.'
    homeSelectedTrainerIds.value = []
    publicTrainerCity.value = city
    homeCity.value = city
    viewMode.value = 'public-trainers'
    showRequestForm.value = false
    await loadPublicTrainers()
    await refreshShareableRequests()
    await nextTick()
    window.scrollTo(0, 0)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível preparar a solicitação agora.'
    submittingRequest.value = false
    return
  }

  status.value = ''
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
        <h1 id="page-title"><button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">&lt;</button> Cadastro de personal</h1>
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
<fieldset class="availability-group field-wide"><legend>Academias onde atende (até 5)</legend>
  <div class="public-academy-add"><select v-model="signupAcademyChoice" aria-label="Selecionar academia"><option value="">Selecione uma academia</option><option v-for="option in academyOptions" :key="option" :value="option">{{ option }}</option></select>
  <input v-if="signupAcademyChoice === 'Outros'" v-model="signupOtherAcademy" type="text" maxlength="60" placeholder="Nome da academia" aria-label="Nome da academia">
  <button type="button" class="secondary-button" :disabled="trainerForm.academias.length >= 5 || !signupAcademyChoice || (signupAcademyChoice === 'Outros' && !signupOtherAcademy.trim())" @click="addAcademy(trainerForm.academias, signupAcademyChoice, signupOtherAcademy); signupAcademyChoice = ''; signupOtherAcademy = ''">Adicionar</button></div>
  <div v-for="(gym, index) in trainerForm.academias" :key="gym" class="public-academy-item"><span>{{ gym }}</span><button type="button" :aria-label="'Remover ' + gym" @click="trainerForm.academias.splice(index,1)">Remover</button></div>
  <small>{{ trainerForm.academias.length }}/5 academias</small>
</fieldset>
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
      <div class="box-footer" role="group" aria-label="Aparência e contato" style="display:flex;justify-content:space-between;align-items:center">
                <a class="box-contact-link" style="margin-right:auto;margin-left:0;justify-self:start" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
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
        <h1 id="customer-login-title"><button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">&lt;</button> Login</h1>
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
        <div class="login-google-alternative field-wide">
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
        </form>
        <div v-else class="login-email-waiting" role="status" aria-live="polite">
          <h2>Confira seu e-mail</h2>
          <p>Enviamos um link de confirmação para <strong>{{ loginIdentifier }}</strong>.</p>
          <p>Abra o link, confirme o acesso e volte para esta tela. A entrada será concluída automaticamente.</p>
          <button class="secondary-button" type="button" @click="pollEmailLogin">Já confirmei meu e-mail</button>
        </div>
      </div>

      <button v-if="loginStep === 1" class="back-button" type="button" @click="openCustomerSignupFromLogin">Criar cadastro</button>
      <div v-if="loginAsTrainer ? trainerLoginDialog : showCustomerLoginDialog" class="success-overlay" role="presentation">
        <section class="success-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-login-confirm-title">
          <div class="whatsapp-wait-icon" :class="{ 'is-confirmed': whatsappConfirmed }" aria-hidden="true">{{ whatsappConfirmed ? '✓' : '↻' }}</div>
          <h2 id="customer-login-confirm-title">{{ whatsappConfirmed ? 'WhatsApp confirmado! Entrando…' : 'Confirme seu login' }}</h2>
          <p>Toque no botão e envie a mensagem com o código para a Beta no WhatsApp. Depois, volte para esta tela e aguarde a confirmação automática.</p>
          <a v-if="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink" class="primary-button customer-verification-link" @click="markWhatsAppOpened" :href="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink" target="_blank" rel="noopener noreferrer">{{ whatsappProgressStartedAt ? 'Abrir WhatsApp novamente' : 'Enviar mensagem para a Beta' }}</a>
          <div v-if="whatsappProgressStartedAt" class="whatsapp-progress">
            <p v-if="!whatsappConfirmed" role="status">{{ whatsappProgress < 100 ? `Verificando confirmação… ${whatsappSecondsRemaining} s` : 'Ainda não recebemos sua confirmação. Confira se enviou a mensagem no WhatsApp.' }}</p>
            <div role="progressbar" aria-label="Tempo de espera pela confirmação" :aria-valuenow="whatsappProgress" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="`${whatsappProgress}% do período de espera`" class="whatsapp-progress-track"><span :style="{ width: `${whatsappProgress}%` }"></span></div>
            <small>{{ whatsappProgress }}% do período de espera · Não precisa atualizar a página.</small>
          </div>
          <p v-if="whatsappNetworkError" role="status">Não foi possível consultar agora. Tentaremos novamente automaticamente.</p>
          <button v-if="whatsappProgress >= 100 && !whatsappConfirmed" class="primary-button" type="button" :disabled="whatsappChecking" @click="loginAsTrainer ? pollTrainerWhatsAppLogin() : pollCustomerLogin()">Código já enviado</button>
          <button class="back-button" type="button" @click="returnToLoginIdentifier">Cancelar</button>
        </section>
      </div>
      <div class="box-footer" role="group" aria-label="Aparência e contato" style="display:flex;justify-content:space-between;align-items:center">
                <a class="box-contact-link" style="margin-right:auto;margin-left:0;justify-self:start" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
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
        <h1 id="customer-signup-title"><button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">&lt;</button> Cadastro de cliente</h1>
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
      </form>
      <div v-else class="customer-signup-confirmation">
        <p class="status" role="status" aria-live="polite">{{ customerStatus }}</p>
        <a v-if="!customerVerificationComplete" class="primary-button customer-verification-link" :href="customerVerificationLink" target="_blank" rel="noopener noreferrer">Confirmar WhatsApp</a>
        <button v-if="!customerVerificationComplete" class="secondary-button" type="button" @click="pollCustomerVerification">Código já enviado</button>
        <button v-else class="primary-button" type="button" @click="closeCustomerSignup">Concluir cadastro</button>
        <small>O botão abre uma conversa com a Beta e prepara o número e o código. A Beta deverá enviar também o nome exibido no WhatsApp à rota de confirmação. Esse nome não comprova titularidade da linha.</small>
      </div>
      <p v-if="customerStatus && !customerVerificationLink" class="status" role="alert">{{ customerStatus }}</p>
      <button class="back-button" type="button" @click="closeCustomerSignup">Início</button>
      <div class="box-footer" role="group" aria-label="Aparência e contato" style="display:flex;justify-content:space-between;align-items:center">
                <a class="box-contact-link" style="margin-right:auto;margin-left:0;justify-self:start" href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
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
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0">
        <nav class="customer-account-links" aria-label="Menu principal">
          <span v-if="trainerSignedInId || customerSignedInName" class="account-greeting">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
            <span>Olá, {{ (trainerSignedInId ? trainerSignedInName : customerSignedInName).trim().split(/\s+/)[0] }}</span>
          </span>
          <span v-if="!trainerSignedInId && !customerSignedInName" class="header-auth-links">
            <a href="#entrar" class="header-login-link" @click.prevent="openCustomerLogin()">Entrar</a><span class="header-auth-divider" aria-hidden="true">|</span><a href="#cadastro-cliente" class="header-signup-link" @click.prevent="openCustomerSignupFromLogin()">Cadastre-se</a>
          </span>
          <details v-if="trainerSignedInId || customerSignedInName || (viewMode !== 'home' && viewMode !== 'public-trainers' && viewMode !== 'select-trainers' && !(viewMode === 'contact' && showRequestForm))" class="account-dropdown main-hamburger-menu">
            <summary aria-label="Abrir menu principal" title="Menu" aria-haspopup="menu">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </summary>
            <div class="account-dropdown-panel">
              <button v-if="!trainerSignedInId && !customerSignedInName" type="button" @click="openCustomerLogin()">Entrar</button>
              <button type="button" @click="viewMode = 'assessment'">Avaliação corporal</button>
              <button type="button" @click="openProfessionalRegistration">Consultar Registro profissional</button>
              <template v-if="trainerSignedInId || customerSignedInName">
                <button type="button" @click="trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()">{{ trainerSignedInId ? 'Solicitações recebidas' : 'Minhas solicitações' }}</button>
                <button type="button" @click="openMyProfile">Meu cadastro</button>
                <button v-if="customerIsAdmin && !trainerSignedInId" type="button" @click="viewMode = 'admin-trainer'">Cadastrar Personal</button>
                <button v-if="customerIsAdmin && !trainerSignedInId" type="button" @click="openAdminTrainers">Editar profissionais</button>
                <button type="button" @click="logout">Sair</button>
              </template>
            </div>
          </details>
        </nav>
        <label v-if="viewMode === 'home' || viewMode === 'public-trainers' || (viewMode === 'contact' && showRequestForm)" class="home-location-label" style="display:flex;align-items:center;gap:5px;max-width:100%" for="home-city">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <select id="home-city" :value="viewMode === 'public-trainers' ? publicTrainerCity : homeCity" aria-label="Alterar cidade" @change="selectHomeCity" style="max-width:165px;font:inherit;color:inherit;background:transparent;border:0;cursor:pointer">
            <option value="" disabled>Escolha sua cidade</option>
            <option v-for="city in supportedRequestCities" :key="city" :value="city">{{ city }}</option>
          </select>
        </label>
        </div>
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
        <hr v-if="viewMode !== 'home'" class="personal-divider">
        <h2 v-if="viewMode === 'contact' && showRequestForm" id="contact-form-title" class="request-form-title"><button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">&lt;</button> {{ requestStep === 4 ? 'Resumo da solicitação' : 'Solicitar atendimento' }}</h2>
        <h1 v-if="viewMode === 'home' && !result && !isRootHome" class="home-tagline">
          <span v-if="trainerSlugFromHost && personalBrandFirstName" class="personal-trainer-brand personal-trainer-home-title">
            <span class="personal-trainer-first-name">{{ personalBrandFirstName }}</span>
            <span class="personal-trainer-role">Personal Trainer</span>
          </span>
          <span v-else>Treine com um personal</span>
        </h1>
        <div v-if="viewMode === 'home' && !result && isRootHome" class="root-home-photo">
          <img class="root-home-personal-image" :src="rootHomePersonalImage" width="1069" height="594" alt="Personal trainer orientando uma aluna durante um exercício" decoding="async" fetchpriority="high">
          <p class="root-home-tagline-subtitle">O apoio faz toda a diferença.</p>
        </div>
        <h1 v-if="viewMode !== 'contact' && (viewMode !== 'home' || result)" id="page-title">
          <button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">&lt;</button>
          <svg v-if="viewMode !== 'public-trainers'" class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="4" width="28" height="32" rx="6" />
            <rect x="12" y="9" width="16" height="8" rx="2" />
            <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
          </svg>
          <span>{{ viewMode === 'select-trainers' ? 'Selecionar profissionais' : viewMode === 'public-trainers' ? 'Profissionais' : viewMode === 'trainer-request' ? 'Solicitação de atendimento' : viewMode === 'customer-requests' ? 'Minhas solicitações' : viewMode === 'trainer-requests' ? 'Solicitações recebidas' : viewMode === 'my-profile' ? 'Meu cadastro' : result ? 'Resultado da avaliação' : form.calculateBodyFat ? 'IMC e gordura corporal' : 'Avaliar meu peso' }}</span>
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
<fieldset class="availability-group field-wide"><legend>Academias onde atende (até 5)</legend>
  <div class="public-academy-add"><select v-model="profileAcademyChoice" aria-label="Selecionar academia"><option value="">Selecione uma academia</option><option v-for="option in academyOptions" :key="option" :value="option">{{ option }}</option></select>
  <input v-if="profileAcademyChoice === 'Outros'" v-model="profileOtherAcademy" type="text" maxlength="60" placeholder="Nome da academia" aria-label="Nome da academia">
  <button type="button" class="secondary-button" :disabled="editingProfile.academias.length >= 5 || !profileAcademyChoice || (profileAcademyChoice === 'Outros' && !profileOtherAcademy.trim())" @click="addAcademy(editingProfile.academias, profileAcademyChoice, profileOtherAcademy); profileAcademyChoice = ''; profileOtherAcademy = ''">Adicionar</button></div>
  <div v-for="(gym, index) in editingProfile.academias" :key="gym" class="public-academy-item"><span>{{ gym }}</span><button type="button" :aria-label="'Remover ' + gym" @click="editingProfile.academias.splice(index,1)">Remover</button></div>
  <small>{{ editingProfile.academias.length }}/5 academias</small>
</fieldset>
              <input id="profile-slug" :value="editingProfile.slug" type="text" readonly aria-readonly="true">
            </label>
          </template>
          <small class="field-wide">Para alterar WhatsApp, e-mail ou endereço do perfil profissional, é necessária uma nova verificação com a Beta.</small>
          <button class="primary-button field-wide" type="submit" :disabled="editingProfileSaving">{{ editingProfileSaving ? 'Salvando…' : 'Salvar alterações' }}</button>
        </form>
        <p v-if="editingProfileStatus" class="status" role="status" aria-live="polite">{{ editingProfileStatus }}</p>
      </section>

      <section v-if="viewMode === 'trainer-request'" class="trainer-request-view" aria-labelledby="page-title">
        <p v-if="trainerRequestStatus" class="status" role="status" aria-live="polite">{{ trainerRequestStatus }}</p>
        <div v-else-if="trainerRequest" class="trainer-request-details">
          <dl>
            <div><dt>Nome</dt><dd>{{ trainerRequest.clientName }}</dd></div>
            <div v-if="trainerRequest.age"><dt>Idade</dt><dd>{{ trainerRequest.age }} anos</dd></div>
            <div v-if="trainerRequest.clientGender"><dt>Gênero do cliente</dt><dd>{{ trainerRequest.clientGender === 'feminino' ? 'Mulher' : trainerRequest.clientGender === 'masculino' ? 'Homem' : 'Prefere não informar' }}</dd></div>
            <div><dt>Cidade</dt><dd>{{ trainerRequest.city }}</dd></div>
            <div v-if="trainerRequest.objective"><dt>Objetivo</dt><dd>{{ trainerRequest.objective }}</dd></div>
            <div><dt>Participantes</dt><dd>{{ trainerRequest.withCompanion ? 'Com um acompanhante' : 'Sozinho' }}</dd></div>
            <div v-if="trainerRequest.desiredDuration"><dt>Tempo de acompanhamento</dt><dd>{{ trainerRequest.desiredDuration }}</dd></div>
            <div v-if="trainerRequest.attendsGym"><dt>Frequenta academia</dt><dd>Sim</dd></div>
            <div v-if="trainerRequest.attendsGym && trainerRequest.gymName"><dt>Qual?</dt><dd>{{ trainerRequest.gymName }}</dd></div>
            <div><dt>Disponibilidade para treino</dt><dd>{{ [trainerRequest.trainingDays.length ? `Dias: ${trainerRequest.trainingDays.join(', ')}` : '', trainerRequest.trainingStartTime && trainerRequest.trainingEndTime ? `Horário: ${trainerRequest.trainingStartTime} às ${trainerRequest.trainingEndTime}` : trainerRequest.trainingShifts.length ? `Turnos: ${trainerRequest.trainingShifts.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Não informada' }}</dd></div>
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

      <div v-if="requestActionDialog" class="request-action-overlay" @click.self="!changingRequestId && (requestActionDialog = null)" @keydown.esc="!changingRequestId && (requestActionDialog = null)">
        <section class="request-action-dialog" role="dialog" aria-modal="true" aria-labelledby="request-action-title" aria-describedby="request-action-description">
          <h2 id="request-action-title">{{ requestActionDialog.action === 'deactivate' ? 'Inativar solicitação?' : 'Reativar solicitação?' }}</h2>
          <p id="request-action-description">{{ requestActionDialog.action === 'deactivate' ? 'Os profissionais deixarão de receber esta solicitação. Você poderá reativá-la até o fim da validade.' : 'Sua solicitação voltará a ficar disponível aos profissionais selecionados.' }}</p>
          <p class="request-action-expiry">Validade original: {{ new Date(requestActionDialog.request.validUntil * 1000).toLocaleDateString('pt-BR') }}</p>
          <p v-if="requestActionError" class="request-action-error" role="alert">{{ requestActionError }}</p>
          <div class="request-action-buttons">
            <button type="button" class="secondary-button" :disabled="Boolean(changingRequestId)" @click="requestActionDialog = null">Cancelar</button>
            <button type="button" class="primary-button" :disabled="Boolean(changingRequestId)" @click="confirmRequestVisibilityChange">{{ changingRequestId ? 'Aguarde…' : requestActionDialog.action === 'deactivate' ? 'Sim, inativar' : 'Sim, reativar' }}</button>
          </div>
        </section>
      </div>
      <section v-if="viewMode === 'customer-requests'" class="customer-requests-view" aria-labelledby="page-title">
        <p v-if="customerRequestsStatus" class="status" role="status">{{ customerRequestsStatus }}</p>
        <button class="secondary-button" type="button" @click="openCustomerRequests">Atualizar propostas</button>
        <article v-for="request in customerRequests" :key="request.requestId" class="customer-request-card">
          <h2>{{ request.city }}<span v-if="request.objective"> · {{ request.objective }}</span></h2>
          <p>Status: {{ request.lifecycle === 'ACCEPTED' ? 'Atendimento iniciado' : request.requestExpired ? 'Solicitação expirada' : request.lifecycle === 'CLOSED' ? 'Solicitação fechada; propostas válidas ainda podem ser escolhidas' : request.lifecycle === 'INACTIVE' ? 'Inativa temporariamente' : 'Recebendo propostas' }}</p>
          <p v-if="request.acceptedAt">Atendimento iniciado em {{ new Date(request.acceptedAt).toLocaleString('pt-BR') }}.</p>
          <p>{{ request.proposalCount }} de até 5 propostas · válida até {{ new Date(request.validUntil * 1000).toLocaleDateString('pt-BR') }}</p>
          <p v-if="!request.proposals.length">{{ request.lifecycle === 'INACTIVE' ? 'Solicitação pausada. Nenhum personal poderá enviar propostas até a reativação.' : 'Ainda não há propostas. Confira novamente mais tarde.' }}</p>
          <button v-if="!request.requestExpired && request.validUntil * 1000 > Date.now() && request.lifecycle === 'OPEN'" class="primary-button" type="button" @click="openTrainersForRequest(request)">Enviar para personais</button>
          <button v-if="!request.requestExpired && request.validUntil * 1000 > Date.now() && request.lifecycle === 'OPEN' && request.proposalCount === 0 && request.proposals.length === 0" class="secondary-button" type="button" :disabled="Boolean(changingRequestId)" @click="changeRequestVisibility(request, 'deactivate')">Inativar solicitação</button>
          <button v-if="!request.requestExpired && request.validUntil * 1000 > Date.now() && request.lifecycle === 'INACTIVE'" class="secondary-button" type="button" :disabled="Boolean(changingRequestId)" @click="changeRequestVisibility(request, 'reactivate')">Reativar solicitação</button>
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

      <section v-if="viewMode === 'admin-trainer' && customerIsAdmin" class="customer-signup" aria-labelledby="admin-trainer-title">
        <h2 id="admin-trainer-title" class="request-form-title"><button type="button" class="title-back-button" @click="goHome" aria-label="Voltar">&lt;</button> Cadastrar Personal Trainer</h2>
        <form class="form contact-fields" @submit.prevent="saveAdminTrainer">
          <label class="field field-wide"><span class="field-label">Nome completo</span><input v-model="adminTrainerForm.name" required maxlength="80" /></label>
          <label class="field"><span class="field-label">WhatsApp</span><input v-model="adminTrainerForm.whatsapp" required type="tel" /></label>
          <label class="field"><span class="field-label">E-mail</span><input v-model="adminTrainerForm.email" type="email" /></label>
          <label class="field"><span class="field-label">Nascimento</span><input v-model="adminTrainerForm.dateOfBirth" required type="date" /></label>
          <label class="field"><span class="field-label">Gênero</span><select v-model="adminTrainerForm.sex"><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
          <label class="field"><span class="field-label">CREF</span><input v-model="adminTrainerForm.cref" required placeholder="000000-G/RJ" /></label>
          <label class="field"><span class="field-label">Instagram</span><input v-model="adminTrainerForm.instagram" required placeholder="@usuario" /></label>
          <label class="field"><span class="field-label">Endereço do perfil (slug)</span><input v-model="adminTrainerForm.slug" required pattern="[a-z0-9-]+" placeholder="nome-do-personal" /></label>
          <label class="field"><span class="field-label">Cidade</span><select v-model="adminTrainerForm.city"><option v-for="city in availableCities" :key="city" :value="city">{{ city }}</option></select></label>
          <label class="field"><span class="field-label">Academias (separadas por vírgula)</span><input v-model="adminTrainerForm.academias" /></label>
          <button type="submit" class="primary-button" :disabled="adminTrainerBusy">Salvar Personal</button>
          <p role="status">{{ adminTrainerStatus }}</p>
        </form>
      </section>
      <section v-if="viewMode === 'admin-trainers' && customerIsAdmin" class="admin-trainers-view" aria-labelledby="admin-trainers-title">
        <h2 id="admin-trainers-title" class="request-form-title"><button type="button" class="title-back-button" @click="goHome" aria-label="Voltar">&lt;</button> Editar profissionais</h2>
        <label class="field field-wide"><span class="field-label">Buscar por nome, CREF ou WhatsApp</span><input v-model="adminTrainerSearch" type="search" autocomplete="off" placeholder="Digite para buscar" /></label>
        <p v-if="adminTrainersStatus" class="status" role="status">{{ adminTrainersStatus }}</p>
        <div v-if="!adminTrainersLoading" class="admin-trainer-list" aria-label="Profissionais cadastrados">
          <button v-for="trainer in filteredAdminTrainers" :key="trainer.trainerId" type="button" class="admin-trainer-list-item" :class="{ selected: selectedAdminTrainerId === trainer.trainerId }" @click="selectAdminTrainer(trainer)">
            <strong>{{ trainer.name }}</strong>
            <span>{{ trainer.cref }} · {{ trainer.cities.join(', ') }}</span>
            <small>{{ trainer.active ? 'Ativo' : 'Inativo' }}</small>
          </button>
        </div>
        <p v-if="!adminTrainersLoading && adminTrainerSearch && !filteredAdminTrainers.length" class="status">Nenhum profissional encontrado.</p>

        <form v-if="selectedAdminTrainerId" id="admin-trainer-edit-form" class="form contact-fields admin-trainer-edit-form" @submit.prevent="saveAdminTrainerEdit">
          <h3 class="field-wide">Dados do profissional</h3>
          <label class="field field-wide"><span class="field-label">Nome completo</span><input v-model="adminTrainerEditForm.name" required maxlength="80" /></label>
          <label class="field"><span class="field-label">WhatsApp</span><input v-model="adminTrainerEditForm.whatsapp" required type="tel" /></label>
          <label class="field"><span class="field-label">E-mail</span><input v-model="adminTrainerEditForm.email" type="email" /></label>
          <label class="field"><span class="field-label">Nascimento</span><input v-model="adminTrainerEditForm.dateOfBirth" required type="date" /></label>
          <label class="field"><span class="field-label">Gênero</span><select v-model="adminTrainerEditForm.sex"><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
          <label class="field"><span class="field-label">CREF</span><input v-model="adminTrainerEditForm.cref" required placeholder="000000-G/RJ" /></label>
          <label class="field"><span class="field-label">Instagram</span><input v-model="adminTrainerEditForm.instagram" required placeholder="@usuario" /></label>
          <label class="field"><span class="field-label">Endereço do perfil</span><input v-model="adminTrainerEditForm.slug" required pattern="[a-z0-9-]+" /></label>
          <fieldset class="field field-wide admin-trainer-cities"><legend>Cidades atendidas</legend><label v-for="city in availableCities" :key="city"><input v-model="adminTrainerEditForm.cities" type="checkbox" :value="city" /> {{ city }}</label></fieldset>
          <label class="field field-wide"><span class="field-label">Academias (separadas por vírgula)</span><input v-model="adminTrainerEditForm.academias" /></label>
          <label class="admin-trainer-active field-wide"><input v-model="adminTrainerEditForm.active" type="checkbox" /> Profissional ativo e visível nas buscas</label>
          <button class="primary-button field-wide" type="submit" :disabled="adminTrainerEditBusy">{{ adminTrainerEditBusy ? 'Salvando…' : 'Salvar alterações' }}</button>
        </form>
      </section>
      <section v-if="viewMode === 'professional-registration'" class="professional-registration-view" aria-labelledby="professional-registration-title">
        <h2 id="professional-registration-title" class="request-form-title"><button type="button" class="title-back-button" aria-label="Voltar ao início" @click="goHome">&lt;</button> Consultar Registro profissional</h2>
        <p>Consulte a situação cadastral de profissionais de Educação Física no CREF-RJ.</p>
        <p class="professional-registration-help"><a href="https://cref-rj.implanta.net.br/servicosOnline/Publico/ConsultaInscritos/" target="_blank" rel="noopener noreferrer">Consultar registro diretamente no site do CREF-RJ</a>.</p>
      </section>

      <ConsultarProfissionaisView
        v-if="viewMode === 'public-trainers'"
        :academy="publicTrainerAcademy"
        :academies="publicTrainerAcademies"
        :trainers="publicFilteredTrainers"
        :selected-ids="homeSelectedTrainerIds"
        :sent-ids="sharingRequestId ? (customerRequests.find(request => request.requestId === sharingRequestId)?.selectedTrainerIds ?? []) : []"
        :city="publicTrainerCity"
        :request-city="form.city"
        :request-gender="form.trainerGenderPreference"
        :signed-in-name="customerSignedInName"
        :active-request="activeCustomerRequest"
        :checking-requests="checkingCustomerRequests"
        :requests-error="customerRequestsLookupError"
        :sharing-busy="sharingRequestBusy"
        :sharing-message="sharingRequestMessage"
        :loading="publicTrainersLoading"
        :error="publicTrainersError"
        @update:academy="value => { publicTrainerAcademy = value }"
        @update:selected-ids="ids => { homeSelectedTrainerIds = ids }"
        @continue="returnToDraftSummary"
        @request-proposal="requestProposalFromHome"
        @open-requests="openCustomerRequests"
        @refresh-requests="refreshShareableRequests"
        @retry="searchHomeTrainers"
      />
      <SelecionarProfissionaisView
        v-if="viewMode === 'select-trainers'"
        :academy="publicTrainerAcademy"
        :academies="publicTrainerAcademies"
        :trainers="publicFilteredTrainers"
        :selected-ids="homeSelectedTrainerIds"
        :sent-ids="sharingRequestId ? (customerRequests.find(request => request.requestId === sharingRequestId)?.selectedTrainerIds ?? []) : []"
        :city="publicTrainerCity"
        :request-city="form.city"
        :request-gender="form.trainerGenderPreference"
        :signed-in-name="customerSignedInName"
        :active-request="activeCustomerRequest"
        :checking-requests="checkingCustomerRequests"
        :requests-error="customerRequestsLookupError"
        :sharing-busy="sharingRequestBusy"
        :sharing-message="sharingRequestMessage"
        :loading="publicTrainersLoading"
        :error="publicTrainersError"
        @update:academy="value => { publicTrainerAcademy = value }"
        @update:selected-ids="ids => { homeSelectedTrainerIds = ids }"
        @continue="returnToDraftSummary"
        @request-proposal="requestProposalFromHome"
        @open-requests="openCustomerRequests"
        @refresh-requests="refreshShareableRequests"
        @retry="searchHomeTrainers"
      />
      <div v-if="viewMode === 'home' && !result && isRootHome" class="home-actions">
        <div class="home-action">
          <button class="primary-button" type="button" @click="openPublicTrainers">
            <span class="home-action-copy"><strong>Buscar Personal</strong><small>Encontre profissionais na sua cidade</small></span>
          </button>
        </div>
        <div class="home-action home-assessment-link">
          <button type="button" class="secondary-button" @click="viewMode = 'assessment'">Avaliar meu peso</button>
        </div>
      </div>
      <div v-if="viewMode === 'home' && !result && !isRootHome" class="home-actions">
        <div class="home-action"><button class="primary-button" type="button" @click="openRequestForm">Solicitar Proposta</button></div>
      </div>
      <div v-if="viewMode === 'home' && !result && !isRootHome" class="home-action home-assessment-link">
        <button type="button" class="secondary-button" @click="viewMode = 'assessment'">Avaliar meu peso</button>
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
        <div v-if="requestStep < 4" class="field-wide request-step-progress" role="status" aria-live="polite">Etapa {{ requestStep }} de 3</div>
        <template v-if="requestStep < 4">
        
        <section v-if="requestStep === 1" class="request-card field-wide" aria-labelledby="request-client-heading">
          <h3 id="request-client-heading">👤 Sobre você</h3>
          <label class="field" for="request-client-age">
            <span class="field-label">Qual é a sua idade?</span>
            <input id="request-client-age" v-model="form.age" name="clientAge" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Idade em anos" required>
          </label>
          <p class="request-question">Qual é o seu sexo?</p>
          <div class="request-gender-row" role="group" aria-label="Seu sexo">
            <label v-for="option in [{ value: 'feminino', label: 'Mulher' }, { value: 'masculino', label: 'Homem' }, { value: 'nao_informar', label: 'Prefiro não informar' }]" :key="option.value" class="request-choice request-gender">
              <input v-model="form.clientGender" type="radio" name="clientGender" :value="option.value">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </section>

        <section v-if="requestStep === 1" class="request-card field-wide" aria-labelledby="request-training-heading">
          <h3 id="request-training-heading">🏋️ Seu treino</h3>
          <label class="field" for="request-objective">
            <span class="field-label">Qual é o seu objetivo?</span>
            <select id="request-objective" v-model="form.objective" name="objective" required>
              <option value="" disabled>Selecione seu objetivo</option>
              <option value="Emagrecimento">Emagrecimento</option>
              <option value="Hipertrofia">Ganho de massa muscular (hipertrofia)</option>
              <option value="Condicionamento físico">Condicionamento físico</option>
              <option value="Saúde e qualidade de vida">Saúde e qualidade de vida</option>
              <option value="Reabilitação">Reabilitação</option>
              <option value="Outro">Outro</option>
            </select>
          </label>
          <p class="request-question">Quantas aulas por semana você deseja?</p>
          <div class="request-choice-row" role="group" aria-label="Quantidade de aulas por semana">
            <label v-for="number in 4" :key="number" class="request-choice">
              <input v-model="form.sessionsPerWeek" type="radio" name="sessionsPerWeek" :value="String(number)">
              <span>{{ number }}</span>
            </label>
          </div>
        </section>

        <section v-if="requestStep === 2" class="request-card field-wide" aria-labelledby="request-location-heading">
          <h3 id="request-location-heading">📍 Local de atendimento</h3>
          <label class="field" for="request-gym-name">
            <span class="field-label">Onde você deseja treinar?</span>
            <select id="request-gym-name" v-model="form.gymName" name="gymName" required @change="form.attendsGym = Boolean(form.gymName)">
              <option value="" disabled>Selecione o local</option>
              <option v-for="gym in publicTrainerAcademies" :key="gym" :value="gym">{{ gym }}</option>
              <option value="Outros">Outros</option>
            </select>
          </label>
          <label v-if="form.gymName === 'Outros'" class="field" for="request-other-gym">
            <span class="field-label">Informe o lugar</span>
            <input id="request-other-gym" v-model.trim="otherGymName" type="text" maxlength="100" required placeholder="Nome do local onde pretende treinar">
          </label>
        </section>

        <section v-if="requestStep === 2" class="request-card field-wide" aria-labelledby="request-availability-heading">
          <h3 id="request-availability-heading">▦ Sua disponibilidade</h3>
          <p class="request-question">Em quais dias você pode treinar?</p>
          <div class="request-choice-row" role="group" aria-label="Dias disponíveis">
            <label v-for="day in trainingDayOptions" :key="day.value" class="request-choice">
              <input v-model="form.trainingDays" type="checkbox" name="trainingDays" :value="day.value">
              <span>{{ day.label }}</span>
            </label>
          </div>
          <p class="request-question">Qual faixa de horário você prefere?</p>
          <p class="request-hint">Selecione uma faixa para todos os dias escolhidos.</p>
          <div class="request-choice-row" role="group" aria-label="Faixas de horário">
            <button v-for="range in trainingTimeRanges" :key="range.start" type="button"
              class="request-choice training-time-button"
              :class="{ 'training-time-button-active': trainingStartMinutes === range.start }"
              :aria-pressed="trainingStartMinutes === range.start"
              @click="selectTrainingTimeRange(range.start, range.end)">
              {{ range.label }}
            </button>
          </div>
        </section>

        <section v-if="requestStep === 3" class="request-card field-wide" aria-labelledby="request-gender-heading">
          <h3 id="request-gender-heading">♙ Preferência do personal</h3>
          <p class="request-question">Você tem preferência pelo gênero do personal?</p>
          <div class="request-gender-row" role="group" aria-label="Preferência de gênero">
            <label v-for="option in [{ value: 'indiferente', label: 'Sem preferência' }, { value: 'masculino', label: 'Masculino' }, { value: 'feminino', label: 'Feminino' }]" :key="option.value" class="request-choice request-gender">
              <input v-model="form.trainerGenderPreference" type="radio" name="trainerGenderPreference" :value="option.value">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </section>

        <section v-if="requestStep === 3" class="request-card field-wide" aria-labelledby="request-companion-heading">
          <h3 id="request-companion-heading">Como você vai fazer a aula?</h3>
          <div class="request-gender-row" role="group" aria-label="Participantes da aula">
            <label class="request-choice"><input v-model="form.withCompanion" type="radio" name="withCompanion" :value="false"><span>Sozinho</span></label>
            <label class="request-choice"><input v-model="form.withCompanion" type="radio" name="withCompanion" :value="true"><span>Com um acompanhante</span></label>
          </div>
        </section>

        <section v-if="requestStep === 3" class="request-card field-wide" aria-labelledby="request-duration-heading">
          <h3 id="request-duration-heading">⌛ Duração do atendimento</h3>
          <label class="admin-trainer-active"><input v-model="form.singleLesson" type="checkbox"> Aula avulsa</label>
          <label class="field" for="request-duration">
            <span class="field-label">Por quanto tempo você deseja o acompanhamento?</span>
            <select id="request-duration" v-model="form.desiredDuration" :disabled="form.singleLesson" :required="!form.singleLesson">
              <option v-for="months in 6" :key="months" :value="`${months} ${months === 1 ? 'mês' : 'meses'}`">{{ months }} {{ months === 1 ? 'mês' : 'meses' }}</option>
            </select>
          </label>
        </section>

        <button class="primary-button field-wide" type="button" @click="continueToTrainerSelection">{{ requestStep === 3 ? 'Revisar solicitação →' : 'Continuar →' }}</button>
        </template>

        <template v-else>
          <div class="field-wide request-summary-table-wrap">
            <table class="request-summary-table">
              <tbody>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🎂</span>Idade</th><td>{{ form.age ? form.age + ' anos' : 'Não informada' }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">👤</span>Sexo</th><td>{{ form.clientGender === 'feminino' ? 'Mulher' : form.clientGender === 'masculino' ? 'Homem' : 'Prefiro não informar' }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">📍</span>Cidade</th><td>{{ form.city }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🏋️</span>Academia / local</th><td>{{ form.gymName === 'Outros' ? otherGymName : form.gymName }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🎯</span>Objetivo</th><td>{{ form.objective || 'Não informado' }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🔢</span>Aulas por semana</th><td>{{ form.sessionsPerWeek }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">📅</span>Dias disponíveis</th><td>{{ form.trainingDays.join(', ') }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🕒</span>Horário disponível</th><td>{{ minutesToTime(trainingStartMinutes) }} às {{ minutesToTime(trainingEndMinutes) }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">👥</span>Participantes</th><td>{{ form.withCompanion ? 'Com um acompanhante' : 'Sozinho' }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">⏳</span>Duração</th><td>{{ form.singleLesson ? 'Aula avulsa' : form.desiredDuration }}</td></tr>
                <tr><th scope="row"><span class="summary-row-icon" aria-hidden="true">🧑‍🏫</span>Gênero do personal</th><td>{{ form.trainerGenderPreference === 'indiferente' ? 'Sem preferência' : form.trainerGenderPreference === 'feminino' ? 'Feminino' : 'Masculino' }}</td></tr>
                <tr class="request-summary-price"><th scope="row"><span class="summary-row-icon" aria-hidden="true">💰</span>Valor estimado</th><td><strong>a partir de {{ ((form.singleLesson ? 40 : Number(form.sessionsPerWeek) * 4 * 40) * (form.withCompanion ? 2 : 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <button class="secondary-button field-wide" type="button" @click="modifyRequestDetails">Modificar atendimento</button>
          <button class="primary-button field-wide" type="button" @click="selectTrainersForDraft">Selecionar personal{{ selectedTrainerIds.length ? ' (' + selectedTrainerIds.length + ')' : '' }}</button>
          <button v-if="selectedTrainerIds.length" class="primary-button field-wide" type="button" :disabled="submittingRequest" @click="confirmServiceRequest">{{ submittingRequest ? 'Enviando…' : customerSignedInName ? 'Confirmar e enviar' : 'Entrar para confirmar' }}</button>
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
          <p>Sua solicitação foi criada! Agora, envie-a para algum personal para receber uma proposta. Ela ficará disponível por até 7 dias.</p>
          <button class="primary-button" type="button" @click="requestSent = false; openCustomerRequests()">Ver minhas solicitações</button>
        </section>
      </div>
      <div class="box-footer" role="group" aria-label="Aparência e contato" style="display:flex;justify-content:space-between;align-items:center">
                <a class="box-contact-link" style="margin-right:auto;margin-left:0;justify-self:start" href="https://wa.me/5521971118383?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso." target="_blank" rel="noopener noreferrer">
          <svg class="box-contact-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 .1C5.4.1 0 5.5 0 12.1c0 2.1.6 4.2 1.6 6L0 24l6.1-1.6a12 12 0 0 0 5.9 1.5c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4ZM12 21.9c-1.9 0-3.7-.5-5.2-1.4l-.4-.2-3.6.9 1-3.5-.3-.4A9.9 9.9 0 0 1 2 12.1C2 6.6 6.5 2.1 12 2.1s10 4.5 10 10-4.5 9.8-10 9.8Zm5.5-7.4c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.7.1-.2.1-.4 0-.6l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7 1.1-.2 1.8-.9 2-1.7.2-.8.2-1.5.2-1.7-.1-.1-.3-.2-.6-.4Z"/></svg>
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

<style scoped>
.home-trainer-directory { display:grid; gap:16px; margin:22px 0; }
.home-trainer-controls { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr); gap:10px; align-items:stretch; }
.home-trainer-controls button,.home-academy-select select { min-width:0; width:100%; min-height:48px; font:inherit; }
.home-academy-select select { color:inherit; background:var(--input-bg, transparent); border:1px solid currentColor; border-radius:12px; padding:10px; }
.home-academy-select input { box-sizing:border-box; width:100%; min-height:48px; padding:10px; color:inherit; background:transparent; border:1px solid currentColor; border-radius:12px; font:inherit; }
.public-directory .home-trainer-controls { grid-template-columns:repeat(2,minmax(0,1fr)); }
@media(max-width:700px) { .public-directory .home-trainer-controls { grid-template-columns:1fr 1fr; } .public-directory .home-trainer-controls .home-proposal-button { grid-column:1 / -1; } }
.home-trainer-list { display:grid; gap:10px; }
.trainer-instagram-link { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; }
.trainer-instagram-link svg { width:24px; height:24px; }
.home-trainer-card { display:flex; gap:14px; align-items:center; border:1px solid var(--border-color, #86978f); border-radius:16px; padding:14px; cursor:pointer; }
.home-trainer-card input { flex:none; width:22px; height:22px; accent-color:#08763a; }
.home-trainer-avatar { display:grid; flex:none; place-items:center; width:58px; height:58px; border-radius:12px; background:#d9efe0; color:#075f32; font-weight:750; }
.home-trainer-info { display:flex; flex:1; flex-direction:column; gap:4px; min-width:0; overflow-wrap:anywhere; }
.home-trainer-name-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.home-trainer-name-row strong { min-width:0; }
.home-trainer-name-row .trainer-instagram-link { flex-shrink:0; }
.home-trainer-info strong { font-size:1.05rem; }
.home-trainer-info a { color:inherit; text-decoration:underline; text-underline-offset:2px; }
.home-list-heading,.home-list-message { margin:0; }
@media(max-width:700px) { .home-trainer-controls { grid-template-columns:1fr 1fr; } .home-academy-select { grid-column:1 / -1; } .home-trainer-controls button { padding:10px 6px; font-size:.9rem; } }
.trainer-instagram-icon { display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px; }

.trainer-filters { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px; }
.trainer-filters .field { min-width:0; }
.trainer-results-bar { display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px; }
.trainer-select-all { display:flex;align-items:center;gap:10px;cursor:pointer; }
.trainer-select-all input,.trainer-selection-table input { width:20px;height:20px;accent-color:#efa449; }
.trainer-table-scroll { overflow-x:auto;max-width:100%; }
.trainer-selection-table { width:100%;border-collapse:collapse;text-align:left;min-width:560px; }
.trainer-selection-table th,.trainer-selection-table td { padding:12px 10px;border-bottom:1px solid currentColor; }
.trainer-selection-table th { font-weight:700; }
.trainer-selection-table a { color:inherit;text-decoration:underline; }
.public-directory .trainer-selection-table { min-width:0; }
.public-directory .trainer-selection-table td:first-child { overflow-wrap:anywhere; }
@media(max-width:620px){
  .public-directory .trainer-selection-table th,.public-directory .trainer-selection-table td { padding:12px 4px;font-size:14px; }
}
.trainer-selection-count { margin:0;opacity:.8; }
@media(max-width:620px){.trainer-filters{grid-template-columns:1fr;}}

.request-card { min-width:0; border:1px solid var(--border-color, #658575); border-radius:18px; padding:18px; display:grid; gap:14px; }
.request-card h3 { margin:0; font-size:1.2rem; }
.request-question { margin:0; font-weight:650; }
.request-hint { margin:-10px 0 0; opacity:.75; font-size:.88rem; }
.request-choice-row,.request-shift-row,.request-gender-row { display:flex; flex-wrap:wrap; gap:9px; }
.request-choice { position:relative; cursor:pointer; min-width:44px; min-height:44px; display:inline-flex; flex:1 1 auto; }
.request-choice input { position:absolute; opacity:0; width:1px; height:1px; }
.request-choice span { display:flex; align-items:center; justify-content:center; width:100%; min-height:44px; padding:9px 12px; border:1px solid currentColor; border-radius:11px; font-weight:650; text-align:center; }
.request-choice input:checked + span { background:#f3a446; color:#17251d; border-color:#f3a446; }
.request-choice input:focus-visible + span { outline:3px solid #f3a446; outline-offset:3px; }
.request-shift { flex:1 1 110px; }
.request-shift span { flex-direction:column; gap:2px; }
.request-shift small { font-size:.75rem; font-weight:400; }
.request-gender { flex:1 1 125px; }
.request-card .field { min-width:0; }
@media(max-width:390px) { .request-card { padding:12px; } .request-choice-row { gap:5px; } .request-choice:not(.request-shift):not(.request-gender) span { padding:8px; } }

.admin-trainers-view { display:grid; gap:16px; }
.admin-trainer-list { display:grid; gap:8px; max-height:360px; overflow:auto; padding:2px; }
.admin-trainer-list-item { display:grid; gap:3px; width:100%; padding:12px 14px; border:1px solid currentColor; border-radius:12px; background:transparent; color:inherit; text-align:left; cursor:pointer; font:inherit; }
.admin-trainer-list-item.selected { outline:3px solid #efa449; border-color:#efa449; }
.admin-trainer-list-item span,.admin-trainer-list-item small { opacity:.8; }
.admin-trainer-edit-form { margin-top:8px; padding-top:18px; border-top:1px solid currentColor; }
.admin-trainer-edit-form h3 { margin:0; }
.admin-trainer-cities { display:flex; flex-wrap:wrap; gap:12px; padding:12px; border:1px solid currentColor; border-radius:12px; }
.admin-trainer-cities legend { padding:0 6px; font-weight:650; }
.admin-trainer-cities label,.admin-trainer-active { display:flex; align-items:center; gap:7px; cursor:pointer; }
.admin-trainer-cities input,.admin-trainer-active input { width:20px; height:20px; accent-color:#08763a; }

.title-back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 0 0.45em 0 0;
  min-width: 1.5em;
  min-height: 1.5em;
}
.title-back-button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; border-radius: 4px; }
</style>

<style scoped>
.public-directory{width:100%;padding:12px 0 24px}.public-directory-filters{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin:18px 0}.public-trainers-link{background:transparent;border:0;padding:4px;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;font:inherit}.public-academy-add{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.public-academy-item{display:flex;gap:12px;align-items:center;margin:6px 0}

.request-step-progress { padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--blue) 9%, var(--select-bg)); color: var(--select-text); font-size: 14px; font-weight: 700; text-align: center; }

/* Resumo de atendimento: leitura confortável e ícones identificadores. */
.request-summary-table { font-size: 14px; line-height: 1.55; }
.request-summary-table th, .request-summary-table td { padding: 0.85rem 0.7rem; }
.request-summary-table th { font-weight: 650; }
.summary-row-icon { display: inline-block; width: 1.65em; margin-right: 0.2em; font-size: 1.15em; vertical-align: -0.08em; }
@media (max-width: 480px) { .request-summary-table { font-size: 14px; } .request-summary-table th, .request-summary-table td { padding: 0.75rem 0.45rem; } }
</style>
