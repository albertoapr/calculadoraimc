import { useAccountSession } from '../stores/accountSession'
import { createFitpesoRequest } from '../services/atendimentoService'
import { useRouter } from 'vue-router'
import { useTrainingDraft } from '../stores/trainingDraft'
import { useTheme } from './useTheme'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { updatePageSeo } from '../services/seo'
import ConsultarProfissionaisView from '../views/profissionais/ConsultarProfissionaisView.vue'
import SelecionarProfissionaisView from '../views/atendimento/SelecionarProfissionaisView.vue'
import { getCachedEligibleTrainers, listEligibleTrainers } from '../services/profissionaisService'
import { useTrainerDirectory } from './useTrainerDirectory'
import { usePublicNavigation } from './usePublicNavigation'
import { useTrainerSelection } from '../stores/trainerSelection'
import { storeToRefs } from 'pinia'
import { getRequestApiEndpoint } from '../services/api'
import { trainerDisplayName } from '../utils/trainer'
import { minutesToTime } from '../utils/time'
import { trainingTimeRanges } from '../constants/training'
import silhouetteScaleImage from '../assets/female-bmi-silhouette-scale.jpg'
import maleSilhouetteScaleImage from '../assets/male-bmi-silhouette-scale.jpg'
import rootHomePersonalImage from '../assets/root-home-personal.jpg'
import type {
  Sex,
  GoogleCredentialResponse,
  GoogleIdentityApi,
  ImcResult,
  TrainerRequestDetails,
  EligibleTrainer,
  CustomerProposal,
  TrainerReceivedRequest,
  EditableProfile,
  TrainerAccountProfile,
  AdminTrainer,
  CustomerRequest,
  PendingWhatsAppLogin,
} from '../types/domain'

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

/** Coordinates screen flows. Domain controllers can be extracted independently from this boundary. */
export function useFitpesoApp() {
  const router = useRouter()
  const { customerSignedInName, customerIsAdmin, trainerSignedInName, trainerSignedInId } =
    storeToRefs(useAccountSession())
  // OAuth client IDs are public in browser apps; restrict this one to the app origin in Google Cloud.
  const googleClientId = '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com'

  const { theme } = useTheme()

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
    if (
      slug.includes('.') ||
      [
        'www',
        'api',
        'mail',
        'ftp',
        'admin',
        'app',
        'beta',
        'fitpeso',
        'suporte',
        'ajuda',
        'develop',
        'test',
        'homologacao',
      ].includes(slug)
    )
      return ''
    return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? slug : ''
  }

  const trainerRequestToken = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
  const trainerIdFromPath = getTrainerIdFromPath()
  const trainerSlugFromHost = getTrainerSlugFromHost()
  const isRootHome = window.location.pathname === '/' && !trainerIdFromPath && !trainerSlugFromHost
  const personalName = ref('FitPeso')
  const personalBrandFirstName = computed(() =>
    personalName.value.endsWith(' Personal Trainer')
      ? personalName.value.slice(0, -' Personal Trainer'.length)
      : '',
  )
  const showHomeTopbar = computed(
    () =>
      ((viewMode.value === 'home' && !result.value) ||
        viewMode.value === 'public-trainers' ||
        viewMode.value === 'professional-registration' ||
        (viewMode.value === 'contact' && showRequestForm.value)) &&
      (isRootHome || Boolean(trainerSlugFromHost)),
  )
  const trainerProfileFailed = ref(false)
  const availableCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']
  const viewMode = ref<
    | 'home'
    | 'assessment'
    | 'contact'
    | 'trainer-request'
    | 'customer-requests'
    | 'trainer-requests'
    | 'my-profile'
    | 'public-trainers'
    | 'select-trainers'
    | 'professional-registration'
    | 'admin-trainer'
    | 'admin-trainers'
  >(
    trainerRequestToken
      ? 'trainer-request'
      : window.location.pathname.replace(/\/$/, '') === '/profissionais'
        ? 'public-trainers'
        : 'home',
  )
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
    if (
      !name ||
      name.length > 60 ||
      list.length >= 5 ||
      list.some((x) => x.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    )
      return false
    list.push(name)
    return true
  }
  const signupAcademyChoice = ref('')
  const signupOtherAcademy = ref('')
  const profileAcademyChoice = ref('')
  const profileOtherAcademy = ref('')
  function readNavigationPreference(key: string): string {
    try {
      return localStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  }
  function saveNavigationPreference(key: string, value: string) {
    try {
      if (value) localStorage.setItem(key, value)
      else localStorage.removeItem(key)
    } catch {
      /* private browsing */
    }
  }
  const NAV_CITY = 'fitpeso:preferred-city:v1'
  const NAV_ACADEMY = 'fitpeso:preferred-academy:v1'
  const NAV_ROLE = 'fitpeso:preferred-role:v1'

  const publicTrainers = ref<EligibleTrainer[]>([])
  const publicTrainerCity = ref('')
  const publicTrainerName = ref('')
  const publicTrainerAcademy = ref('')

  const storedHomeAcademy = readNavigationPreference(NAV_ACADEMY)

  const homeAcademy = ref(storedHomeAcademy)

  const trainerSelectionStore = useTrainerSelection()
  const { selectedTrainerIds: homeSelectedTrainerIds } = storeToRefs(trainerSelectionStore)
  const sharingRequestId = ref('')
  const sharingRequestMessage = ref('')
  const sharingRequestBusy = ref(false)
  const activeCustomerRequest = computed(() =>
    customerRequests.value.find(
      (request) =>
        request.lifecycle === 'OPEN' &&
        !request.requestExpired &&
        request.validUntil * 1000 > Date.now(),
    ),
  )
  const checkingCustomerRequests = ref(false)
  const customerRequestsLookupError = ref('')
  const pendingHomeTrainerIds = ref<string[]>([])

  function searchHomeTrainers() {
    if (!homeCity.value) return
    publicTrainerCity.value = homeCity.value
    void loadPublicTrainers()
  }
  function requestProposalFromHome() {
    if (sharingRequestId.value) {
      void sendRequestToSelectedTrainers()
      return
    }
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
    if (!customerSignedInName.value) {
      customerRequests.value = []
      sharingRequestId.value = ''
      customerRequestsLookupError.value = ''
      return
    }
    checkingCustomerRequests.value = true
    customerRequestsLookupError.value = ''
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) throw new Error('Entre novamente para consultar sua solicitação.')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/customers/requests', {
        headers: { authorization: 'Bearer ' + token },
        cache: 'no-store',
      })
      const body = (await response.json()) as { requests?: CustomerRequest[] }
      if (!response.ok || !Array.isArray(body.requests))
        throw new Error('Não foi possível consultar sua solicitação.')
      customerRequests.value = body.requests
      sharingRequestId.value = activeCustomerRequest.value?.requestId ?? ''
    } catch {
      customerRequestsLookupError.value =
        'Não foi possível consultar sua solicitação. Tente novamente.'
    } finally {
      checkingCustomerRequests.value = false
    }
  }

  async function sendRequestToSelectedTrainers() {
    if (!sharingRequestId.value || sharingRequestBusy.value) return
    if (!homeSelectedTrainerIds.value.length) {
      sharingRequestMessage.value = 'Selecione pelo menos um personal.'
      return
    }
    sharingRequestBusy.value = true
    sharingRequestMessage.value = ''
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(
        endpoint +
          '/api/requests/' +
          encodeURIComponent(sharingRequestId.value) +
          '/send-to-trainers',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ trainerIds: homeSelectedTrainerIds.value }),
        },
      )
      const body = (await response.json()) as { sent?: boolean; added?: number; error?: string }
      if (!response.ok || !body.sent)
        throw new Error(body.error || 'Não foi possível enviar a solicitação.')
      sharingRequestMessage.value = body.added
        ? 'Solicitação enviada para ' +
          body.added +
          (body.added === 1 ? ' personal!' : ' personais!')
        : 'Estes profissionais já receberam sua solicitação.'
      homeSelectedTrainerIds.value = []
      await refreshShareableRequests()
    } catch (error) {
      sharingRequestMessage.value =
        error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.'
    } finally {
      sharingRequestBusy.value = false
    }
  }
  const publicTrainersLoading = ref(false)
  const publicTrainersError = ref('')
  let publicLookupId = 0
  const isMesquita = (city: string) => city.trim().toLocaleLowerCase('pt-BR') === 'mesquita'
  const { academies: publicTrainerAcademies, filtered: publicFilteredTrainers } =
    useTrainerDirectory({
      trainers: publicTrainers,
      academy: publicTrainerAcademy,
      city: publicTrainerCity,
      requestCity: computed(() => form.city),
      requestGender: computed(() => form.trainerGenderPreference),
      selectingForRequest: computed(() => viewMode.value === 'select-trainers'),
    })
  watch(publicTrainerCity, () => {
    publicTrainerAcademy.value = ''
  })
  async function loadPublicTrainers() {
    const id = ++publicLookupId
    const city = publicTrainerCity.value
    const gender =
      viewMode.value === 'select-trainers' ? form.trainerGenderPreference : 'indiferente'
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
      if (id === publicLookupId)
        publicTrainersError.value = 'Não foi possível consultar os profissionais.'
    } finally {
      if (id === publicLookupId) publicTrainersLoading.value = false
    }
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
  const selectedTrainerNames = computed(() =>
    selectedTrainerIds.value.map((id) => {
      const trainer = publicTrainers.value.find((item) => item.trainerId === id)
      return trainer ? trainerDisplayName(trainer.name) : 'Profissional indisponível'
    }),
  )

  const customerRequests = ref<CustomerRequest[]>([])
  const customerRequestsStatus = ref('')
  const changingRequestId = ref('')
  const requestActionDialog = ref<{
    request: CustomerRequest
    action: 'deactivate' | 'reactivate'
  } | null>(null)
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
  const adminTrainerForm = reactive({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    sex: 'feminino',
    cref: '',
    instagram: '@',
    slug: '',
    city: 'Mesquita',
    academias: '',
  })
  const adminTrainerStatus = ref('')
  const adminTrainerBusy = ref(false)
  async function saveAdminTrainer() {
    if (!customerIsAdmin.value || adminTrainerBusy.value) return
    const token =
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      ''
    if (!token) {
      adminTrainerStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainerBusy.value = true
    adminTrainerStatus.value = 'Salvando profissional…'
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/admin/trainers', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({
          ...adminTrainerForm,
          cities: [adminTrainerForm.city],
          academias: adminTrainerForm.academias
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      })
      const body = (await response.json()) as { registered?: boolean; error?: string }
      if (!response.ok || !body.registered)
        throw new Error(body.error || 'Não foi possível cadastrar o profissional.')
      adminTrainerStatus.value = 'Personal cadastrado e ativado com sucesso.'
    } catch (error) {
      adminTrainerStatus.value =
        error instanceof Error ? error.message : 'Falha ao cadastrar profissional.'
    } finally {
      adminTrainerBusy.value = false
    }
  }

  const adminTrainers = ref<AdminTrainer[]>([])
  const adminTrainerSearch = ref('')
  const selectedAdminTrainerId = ref('')
  const adminTrainersStatus = ref('')
  const adminTrainersLoading = ref(false)
  const adminTrainerEditBusy = ref(false)
  const adminTrainerEditForm = reactive({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    sex: 'feminino',
    cref: '',
    instagram: '',
    slug: '',
    cities: [] as string[],
    academias: '',
    active: true,
  })
  const filteredAdminTrainers = computed(() => {
    const search = adminTrainerSearch.value.trim().toLocaleLowerCase('pt-BR')
    if (!search) return adminTrainers.value
    return adminTrainers.value.filter((trainer) =>
      [trainer.name, trainer.cref, trainer.whatsapp].some((value) =>
        value.toLocaleLowerCase('pt-BR').includes(search),
      ),
    )
  })

  function selectAdminTrainer(trainer: AdminTrainer) {
    selectedAdminTrainerId.value = trainer.trainerId
    Object.assign(adminTrainerEditForm, {
      name: trainer.name,
      whatsapp: trainer.whatsapp,
      email: trainer.email,
      dateOfBirth: trainer.dateOfBirth,
      sex: trainer.sex || 'feminino',
      cref: trainer.cref,
      instagram: trainer.instagram,
      slug: trainer.slug,
      cities: [...trainer.cities],
      academias: trainer.academias.join(', '),
      active: trainer.active,
    })
    adminTrainersStatus.value = ''
    void nextTick(() =>
      document
        .querySelector<HTMLElement>('#admin-trainer-edit-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  async function loadAdminTrainers() {
    if (!customerIsAdmin.value || adminTrainersLoading.value) return
    const token =
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      ''
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainersLoading.value = true
    adminTrainersStatus.value = 'Carregando profissionais…'
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/admin/trainers', {
        headers: { authorization: 'Bearer ' + token },
        cache: 'no-store',
      })
      const body = (await response.json()) as { trainers?: AdminTrainer[]; error?: string }
      if (!response.ok || !Array.isArray(body.trainers))
        throw new Error(body.error || 'Não foi possível carregar os profissionais.')
      adminTrainers.value = body.trainers
      adminTrainersStatus.value = body.trainers.length ? '' : 'Nenhum profissional cadastrado.'
      if (selectedAdminTrainerId.value) {
        const selected = body.trainers.find(
          (trainer) => trainer.trainerId === selectedAdminTrainerId.value,
        )
        if (selected) selectAdminTrainer(selected)
      }
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar os profissionais.'
    } finally {
      adminTrainersLoading.value = false
    }
  }

  function openAdminTrainers() {
    viewMode.value = 'admin-trainers'
    selectedAdminTrainerId.value = ''
    adminTrainerSearch.value = ''
    void loadAdminTrainers()
    void nextTick(() => window.scrollTo(0, 0))
  }

  async function saveAdminTrainerEdit() {
    if (!customerIsAdmin.value || !selectedAdminTrainerId.value || adminTrainerEditBusy.value)
      return
    if (!adminTrainerEditForm.cities.length) {
      adminTrainersStatus.value = 'Selecione pelo menos uma cidade.'
      return
    }
    const token =
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      ''
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainerEditBusy.value = true
    adminTrainersStatus.value = 'Salvando profissional…'
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(
        endpoint + '/api/admin/trainers/' + encodeURIComponent(selectedAdminTrainerId.value),
        {
          method: 'PUT',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({
            ...adminTrainerEditForm,
            academias: adminTrainerEditForm.academias
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean),
          }),
        },
      )
      const body = (await response.json()) as { updated?: boolean; error?: string }
      if (!response.ok || !body.updated)
        throw new Error(body.error || 'Não foi possível salvar o profissional.')
      await loadAdminTrainers()
      adminTrainersStatus.value = 'Dados do profissional atualizados com sucesso.'
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível salvar o profissional.'
    } finally {
      adminTrainerEditBusy.value = false
    }
  }

  const editingProfile = reactive<EditableProfile>({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    instagram: '',
    cref: '',
    slug: '',
    academias: [],
  })
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

  const trainingDraft = useTrainingDraft()
  const { form } = trainingDraft
  const { trainingStartMinutes, trainingEndMinutes } = storeToRefs(trainingDraft)
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
  const currentScreen = computed(() =>
    [
      viewMode.value,
      showTrainerSignup.value,
      showCustomerSignup.value,
      showCustomerLogin.value,
      Boolean(result.value),
    ].join(':'),
  )

  watch(
    currentScreen,
    async () => {
      await nextTick()
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    },
    { flush: 'post' },
  )

  const evaluating = ref(false)
  const evaluationProgress = ref(0)
  const status = ref('')
  const submittingRequest = ref(false)
  const googleButtonContainer = ref<HTMLDivElement | null>(null)
  function setGoogleButtonContainer(element: unknown) {
    googleButtonContainer.value = element instanceof HTMLDivElement ? element : null
  }
  const googleProfileStatus = ref('')
  let googleIdentityScriptPromise: Promise<void> | null = null
  const contactAge = computed(() => {
    if (!showRequestForm.value || form.age === '') return undefined
    const age = Number(String(form.age))
    return Number.isInteger(age) ? age : undefined
  })

  function category(imc: number) {
    if (imc < 18.5)
      return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
    if (imc < 25)
      return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
    if (imc < 30)
      return [
        'Sobrepeso',
        'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.',
      ]
    if (imc < 35)
      return [
        'Obesidade I',
        'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
      ]
    if (imc < 40)
      return [
        'Obesidade II',
        'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
      ]
    return [
      'Obesidade mórbida',
      'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
    ]
  }

  function classifyBodyFat(percent: number, sex: Sex, age: number) {
    // Faixas gerais de referência por sexo e idade, para adultos de 20 a 79 anos.
    const referenceBands =
      sex === 'masculino'
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
    const reference = referenceBands.find((band) => age >= band.from && age < band.to)

    if (!reference) return 'Faixa de referência indisponível para esta idade'
    if (percent < reference.minimum) return 'Baixo'
    if (percent <= reference.maximum) return 'Adequado'
    if (percent <= reference.maximum + 5) return 'Alto'
    return 'Muito alto'
  }

  const classification = computed(() => (result.value ? category(result.value.imc)[0] : ''))
  const classificationEmoji = computed(() =>
    result.value && result.value.imc >= 18.5 && result.value.imc < 25 ? '😎' : '😕',
  )
  const silhouetteImage = computed(() =>
    form.sex === 'masculino' ? maleSilhouetteScaleImage : silhouetteScaleImage,
  )
  const silhouettePositions = computed(() =>
    form.sex === 'masculino' ? ['0%', '33.333%', '66.667%', '100%'] : ['0%', '25%', '50%', '75%'],
  )
  const silhouetteGenderLabel = computed(() =>
    form.sex === 'masculino' ? 'MASCULINAS' : 'FEMININAS',
  )
  const bmiScale = [
    { label: 'Magreza', range: '<18,5', from: 12, to: 18.5, color: '#60a5fa' },
    { label: 'Peso adequado', range: '18,5–24,9', from: 18.5, to: 25, color: '#34d399' },
    { label: 'Sobrepeso', range: '25–29,9', from: 25, to: 30, color: '#fbbf24' },
    { label: 'Obesidade I', range: '30–34,9', from: 30, to: 35, color: '#fb923c' },
  ]
  const scalePosition = computed(() =>
    result.value ? `${Math.max(0, Math.min(100, ((result.value.imc - 12) / 23) * 100))}%` : '0%',
  )
  const bodyFatReference = computed(() => {
    const current = result.value
    if (
      current?.bodyFatPercent === undefined ||
      current.bodyFatAge === undefined ||
      !current.bodyFatSex
    )
      return null
    const bands =
      current.bodyFatSex === 'masculino'
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
    const band = bands.find(
      (item) => current.bodyFatAge! >= item.from && current.bodyFatAge! < item.to,
    )
    if (!band) return null
    const domain = 70
    const highLimit = Math.min(domain, band.maximum + 5)
    return {
      ...band,
      domain,
      highLimit,
      sexLabel: current.bodyFatSex === 'masculino' ? 'homens' : 'mulheres',
      ageLabel: `${band.from}–${band.to - 1} anos`,
      marker: `${(Math.max(0, Math.min(domain, current.bodyFatPercent)) / domain) * 100}%`,
      widths: [
        (band.minimum / domain) * 100,
        ((band.maximum - band.minimum) / domain) * 100,
        ((highLimit - band.maximum) / domain) * 100,
        ((domain - highLimit) / domain) * 100,
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

  function applyCustomerProfile(profile: {
    name: string
    whatsapp: string
    email: string
    dateOfBirth?: string
    isAdmin?: boolean
  }) {
    customerIsAdmin.value = profile.isAdmin === true
    form.name = profile.name
    form.phone = profile.whatsapp
    form.email = profile.email
    if (profile.dateOfBirth) {
      const birth = new Date(`${profile.dateOfBirth}T00:00:00`)
      const today = new Date()
      let age = today.getFullYear() - birth.getFullYear()
      if (
        today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
      )
        age -= 1
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
    try {
      sessionStorage.removeItem('fitpeso-trainer-session')
    } catch {
      /* armazenamento indisponível */
    }
  }

  async function loadCustomerProfile(token: string, signal?: AbortSignal) {
    const endpoint = await getRequestApiEndpoint(signal)
    const response = await fetch(`${endpoint}/api/customers/profile`, {
      signal,
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await response.json()) as {
      authenticated?: boolean
      profile?: {
        name: string
        whatsapp: string
        email: string
        dateOfBirth?: string
        isAdmin?: boolean
      }
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
        googleProfileStatus.value =
          'Cadastro carregado. Confira a disponibilidade e os dados antes de enviar.'
        showCustomerLogin.value = false
        await returnToRequestFormAfterLogin()
      } catch (error) {
        customerLoginStatus.value =
          error instanceof Error ? error.message : 'Não foi possível entrar com o Google.'
        googleProfileStatus.value = customerLoginStatus.value
        try {
          sessionStorage.removeItem('fitpeso-google-session')
        } catch {
          /* Storage pode estar desativado. */
        }
      }
      return
    }
    try {
      const payloadPart = response.credential.split('.')[1]
      if (!payloadPart) throw new Error('Credencial Google inválida.')
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
      const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const profile = JSON.parse(new TextDecoder().decode(bytes)) as {
        name?: string
        email?: string
      }
      if (!profile.name && !profile.email) throw new Error('O Google não retornou nome ou e-mail.')
      const target =
        googleProfileTarget.value === 'trainer'
          ? trainerForm
          : googleProfileTarget.value === 'customer'
            ? customerForm
            : form
      if (profile.name) target.name = profile.name.trim()
      if (profile.email) {
        target.email = profile.email.trim().toLowerCase()
      }
    } catch {
      googleProfileStatus.value =
        'Não consegui ler os dados da conta Google. Tente novamente ou preencha manualmente.'
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
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.max(200, Math.min(400, Math.round(container.getBoundingClientRect().width))),
      })
    } catch {
      googleProfileStatus.value =
        'O preenchimento com Google está indisponível. Você pode preencher os dados manualmente.'
    }
  }

  watch(showCustomerLogin, async (enabled) => {
    if (!enabled) return
    await nextTick()
    await renderGoogleButton('client')
  })

  watch(
    showTrainerSignup,
    async (enabled) => {
      if (!enabled) return
      await nextTick()
      await renderGoogleButton('trainer')
    },
    { immediate: true },
  )

  watch(
    showCustomerSignup,
    async (enabled) => {
      if (!enabled) return
      await nextTick()
      await renderGoogleButton('customer')
    },
    { immediate: true },
  )

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
    if (showCustomerSignup.value) {
      closeCustomerSignup()
      return
    }
    if (showTrainerSignup.value) {
      closeTrainerSignup()
      return
    }
    if (viewMode.value === 'contact' && showRequestForm.value) {
      if (requestStep.value === 5) {
        void selectTrainersForDraft()
        return
      }
      if (requestStep.value > 1) requestStep.value -= 1
      else goHome()
    } else if (viewMode.value === 'select-trainers') {
      if (selectingTrainersForDraft.value) {
        selectingTrainersForDraft.value = false
        viewMode.value = 'contact'
        requestStep.value = 3
      } else {
        goHome()
      }
      void nextTick(() => window.scrollTo(0, 0))
      return
    } else {
      goHome()
    }
    void nextTick(() => window.scrollTo(0, 0))
  }

  function goHome() {
    if (window.location.pathname === '/profissionais') void router.replace('/')
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
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    customerVerificationPollTimer = undefined
    showCustomerLoginDialog.value = false
    void router.replace(window.location.pathname)
    void nextTick(() => window.scrollTo(0, 0))
  }

  function closeCustomerSignup() {
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
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
      requestStep.value = 5
      customerLoginMethod.value = 'whatsapp'
      customerLoginStatus.value =
        'Cadastro confirmado. Entre para retornar à revisão da solicitação.'
      void router.replace(window.location.pathname)
      void nextTick(() => window.scrollTo(0, 0))
      return
    }
    customerVerificationComplete.value = false
    goHome()
  }

  function scheduleCustomerVerificationPoll(delayMs = 10_000) {
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    customerVerificationPollTimer = window.setTimeout(
      () => void pollCustomerVerification(),
      delayMs,
    )
  }

  async function pollCustomerVerification() {
    if (
      !customerVerificationCode.value ||
      !customerForm.whatsapp ||
      customerVerificationComplete.value
    )
      return
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(`${endpoint}/api/customers/verification-status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: customerVerificationCode.value,
          whatsapp: customerForm.whatsapp,
        }),
      })
      const body = (await response.json()) as {
        verified?: boolean
        expired?: boolean
        name?: string
        error?: string
      }
      if (response.ok && body.verified === true) {
        customerVerificationComplete.value = true
        if (body.name?.trim()) customerForm.name = body.name.trim()
        customerStatus.value = `WhatsApp confirmado! ${body.name?.trim() ? `Bem-vindo(a), ${body.name.trim().split(/\s+/)[0]}!` : 'Cadastro ativo.'}`
        return
      }
      if (response.ok && body.expired) {
        customerStatus.value =
          'O link de confirmação expirou. Volte ao formulário e inicie o cadastro novamente.'
        customerVerificationLink.value = ''
        return
      }
    } catch {
      // Falhas momentâneas de rede não interrompem a verificação automática.
    }
    if (Date.now() - customerVerificationPollStartedAt >= 15 * 60 * 1000) {
      customerStatus.value =
        'O prazo de confirmação terminou. Confira seus dados e envie um novo cadastro para gerar outro link.'
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
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
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
      const body = (await response.json()) as {
        registered?: boolean
        verificationCode?: string
        error?: string
      }
      if (!response.ok || body.registered !== true || !body.verificationCode) {
        throw new Error(body.error || 'Não foi possível registrar o cadastro agora.')
      }
      const message = `Confirmar cadastro FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}${name ? `\nNome: ${name}` : ''}`
      customerVerificationCode.value = body.verificationCode
      customerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
      customerStatus.value = name
        ? 'Envie a mensagem para a Beta e volte a esta tela para confirmar seu cadastro.'
        : 'Envie a mensagem para a Beta. Ela identificará o nome exibido no seu WhatsApp e o encaminhará com o número e o código para concluir o cadastro.'
      customerVerificationPollStartedAt = Date.now()
      scheduleCustomerVerificationPoll(1_000)
    } catch (error) {
      customerStatus.value =
        error instanceof Error ? error.message : 'Não foi possível registrar o cadastro agora.'
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
        if (!['instagram.com', 'www.instagram.com'].includes(profileUrl.hostname.toLowerCase()))
          return ''
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
    const reservedSlugs = [
      'www',
      'api',
      'mail',
      'ftp',
      'admin',
      'app',
      'beta',
      'fitpeso',
      'suporte',
      'ajuda',
      'develop',
      'test',
      'homologacao',
    ]
    let validationError = ''
    if (!name) validationError = 'Informe seu nome completo.'
    else if (sex !== 'masculino' && sex !== 'feminino')
      validationError = 'Selecione Masculino ou Feminino.'
    else if (!phone) validationError = 'Informe um WhatsApp válido com DDD.'
    else if (dateOfBirth && !isValidLoginBirthDate(dateOfBirth))
      validationError = 'Informe uma data de nascimento válida ou deixe em branco.'
    else if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) || reservedSlugs.includes(slug)) {
      validationError =
        'O subdomínio deve ter de 3 a 40 caracteres, usando letras minúsculas, números ou hífen.'
    } else if (trainerForm.cities.length < 1 || trainerForm.cities.length > 2) {
      validationError = 'Escolha uma ou duas cidades de atuação.'
    } else if (!instagram) {
      validationError = 'Informe um Instagram válido: @usuario, usuario ou instagram.com/usuario.'
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationError = 'Confira o endereço de e-mail ou deixe o campo vazio.'
    } else if (cref && !/^[\p{L}\p{M}0-9 ./-]{1,40}$/u.test(cref)) {
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
        body: JSON.stringify({
          name,
          sex,
          slug,
          whatsapp: phone,
          ...(dateOfBirth ? { dateOfBirth } : {}),
          ...(email ? { email } : {}),
          cities: trainerForm.cities,
          academias: trainerForm.academias,
          instagram,
          ...(cref ? { cref } : {}),
        }),
      })
      const body = (await response.json()) as {
        registered?: boolean
        error?: string
        slug?: string
        verificationCode?: string
      }
      if (!response.ok || body.registered !== true) {
        throw new Error(body.error || 'Não foi possível registrar seu cadastro agora.')
      }
      if (!body.verificationCode)
        throw new Error(
          'Cadastro recebido, mas não foi possível gerar o código de confirmação. Tente novamente.',
        )
      const message = `Confirmar personal Fitpeso ${body.verificationCode}\nWhatsApp: ${phone}\nNome: ${name}`
      trainerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
      trainerStatus.value = `Cadastro salvo. Envie a confirmação pelo WhatsApp em até 15 minutos. Após confirmar, seu perfil será ativado em https://${body.slug || slug}.fitpeso.com.br.`
    } catch (error) {
      trainerStatus.value =
        error instanceof Error ? error.message : 'Não foi possível registrar seu cadastro agora.'
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
    if (
      !Number.isInteger(weight) ||
      weight < 50 ||
      weight > 150 ||
      !Number.isInteger(heightCm) ||
      heightCm < 140 ||
      heightCm > 190
    ) {
      status.value = 'Confira o peso e a altura informados.'
      return
    }

    const nextResult: ImcResult = {
      weight,
      heightCm,
      imc: Number((weight / (heightCm / 100) ** 2).toFixed(1)),
    }
    if (form.calculateBodyFat) {
      const waistCm = Number(form.waist)
      const age = Number(form.bodyFatAge)
      if (
        !Number.isInteger(waistCm) ||
        waistCm < 40 ||
        waistCm > 160 ||
        !Number.isInteger(age) ||
        age < 20 ||
        age > 120
      ) {
        status.value =
          'Para calcular a gordura corporal, confira a cintura e informe a idade (mínimo de 20 anos).'
        return
      }
      const bodyFatPercent = Number(
        ((form.sex === 'masculino' ? 64 : 76) - 20 * (heightCm / waistCm)).toFixed(1),
      )
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

  async function loadTrainerProfile() {
    if (!trainerIdFromPath && !trainerSlugFromHost) return
    try {
      const endpoint = await getRequestApiEndpoint()
      const profilePath = trainerSlugFromHost
        ? `/api/trainers/by-slug/${encodeURIComponent(trainerSlugFromHost)}`
        : `/api/trainers/${encodeURIComponent(trainerIdFromPath)}`
      const response = await fetch(`${endpoint}${profilePath}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Trainer profile unavailable')
      const body = (await response.json()) as { trainer?: { name?: unknown } }
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
      const response = await fetch(
        `${endpoint}/api/requests/trainer-view?token=${encodeURIComponent(trainerRequestToken)}`,
        { cache: 'no-store' },
      )
      const body = (await response.json()) as {
        request?: TrainerRequestDetails
        expired?: boolean
        error?: string
      }
      if (response.status === 410 || body.expired) {
        trainerRequestStatus.value = 'Esta solicitação expirou e não pode mais ser visualizada.'
        return
      }
      if (!response.ok || !body.request) throw new Error(body.error || 'Solicitação indisponível.')
      trainerRequest.value = body.request
      trainerRequestStatus.value = ''
    } catch (error) {
      trainerRequestStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar esta solicitação.'
    }
  }

  async function submitTrainerProposal() {
    if (!trainerRequestToken || !trainerProposalPrice.value || trainerProposalSubmitting.value)
      return
    trainerProposalSubmitting.value = true
    trainerRequestStatus.value = 'Enviando proposta…'
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(`${endpoint}/api/requests/proposals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: trainerRequestToken,
          monthlyPrice: Number(trainerProposalPrice.value),
          message: trainerProposalMessage.value,
        }),
      })
      const body = (await response.json()) as { submitted?: boolean; error?: string }
      if (!response.ok || body.submitted !== true)
        throw new Error(body.error || 'Não foi possível enviar a proposta.')
      if (trainerRequest.value) trainerRequest.value.proposalAlreadySent = true
      trainerRequestStatus.value =
        'Proposta enviada. O usuário poderá conversar com os profissionais e escolher uma proposta pelo painel.'
    } catch (error) {
      trainerRequestStatus.value =
        error instanceof Error ? error.message : 'Não foi possível enviar a proposta agora.'
    } finally {
      trainerProposalSubmitting.value = false
    }
  }

  const supportedRequestCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'] as const
  const detectingRequestCity = ref(false)
  const requestCityLocationMessage = ref('')
  const homeCity = ref('')
  const storedHomeCity = readNavigationPreference(NAV_CITY)
  const homeCityManuallySelected = ref(
    storedHomeCity !== '' && supportedRequestCities.some((city) => city === storedHomeCity),
  )
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
        if (
          Number.isInteger(cached.count) &&
          Number(cached.count) >= 0 &&
          Number(cached.expiresAt) > Date.now()
        ) {
          homeTrainerCount.value = Number(cached.count)
          homeTrainerCountLoading.value = false
          return
        }
      }
    } catch {
      /* Storage may be unavailable; fall back to the API. */
    }

    homeTrainerCount.value = null
    homeTrainerCountLoading.value = true
    try {
      let pending = homeTrainerCountRequests.get(city)
      if (!pending) {
        pending = (async () => {
          const endpoint = await getRequestApiEndpoint()
          const query = new URLSearchParams({ city, gender: 'indiferente' })
          const response = await fetch(`${endpoint}/api/trainers/eligible?${query}`)
          const body = (await response.json()) as { count?: number; trainers?: EligibleTrainer[] }
          if (!response.ok) throw new Error('Unavailable')
          const count = Number.isInteger(body.count)
            ? Number(body.count)
            : Array.isArray(body.trainers)
              ? body.trainers.length
              : NaN
          if (!Number.isInteger(count) || count < 0) throw new Error('Invalid count')
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ count, expiresAt: Date.now() + HOME_TRAINER_COUNT_TTL_MS }),
            )
          } catch {
            /* Optional cache */
          }
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
    if (!supportedRequestCities.some((item) => item === city)) return
    homeCityManuallySelected.value = true
    homeCity.value = city
    saveNavigationPreference(NAV_CITY, city)
    void loadHomeTrainerCount(city)
  }

  watch(homeAcademy, (academy) => saveNavigationPreference(NAV_ACADEMY, academy))

  watch(homeCity, (city) => {
    homeSelectedTrainerIds.value = []
    if (city && viewMode.value === 'public-trainers') searchHomeTrainers()
  })

  let requestCityLookupId = 0

  function matchSupportedRequestCity(value: string): string {
    const normalized = value
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .trim()
      .toLowerCase()
    return (
      supportedRequestCities.find(
        (city) =>
          city
            .normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '')
            .toLowerCase() === normalized,
      ) ?? ''
    )
  }

  async function detectRequestCity(cityDetectionScope: 'request' | 'home' = 'request') {
    if (!navigator.geolocation) {
      requestCityLocationMessage.value = 'Selecione sua cidade na lista.'
      return
    }
    const lookupId = ++requestCityLookupId
    if (cityDetectionScope === 'request') detectingRequestCity.value = true
    if (cityDetectionScope === 'request')
      requestCityLocationMessage.value = 'Identificando sua cidade…'
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Reverse geocoding is used only to obtain the municipality; coordinates are not stored.
          const params = new URLSearchParams({
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
            localityLanguage: 'pt',
          })
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
            {
              signal: AbortSignal.timeout(8000),
            },
          )
          if (!response.ok) throw new Error('Geocoding unavailable')
          const location = (await response.json()) as {
            city?: string
            locality?: string
            localityInfo?: { administrative?: Array<{ name?: string; adminLevel?: number }> }
          }
          if (
            cityDetectionScope === 'request' &&
            (lookupId !== requestCityLookupId || !showRequestForm.value || requestStep.value > 3)
          )
            return
          const candidates = [
            location.city ?? '',
            location.locality ?? '',
            ...(location.localityInfo?.administrative ?? []).map((item) => item.name ?? ''),
          ]
          const city = candidates.map(matchSupportedRequestCity).find(Boolean) ?? ''
          if (city) {
            updateHomeCity(city)
            if (cityDetectionScope === 'request') {
              if (!form.city) form.city = city
              requestCityLocationMessage.value =
                'Cidade sugerida pela localização. Você pode alterá-la.'
            }
          } else if (cityDetectionScope === 'request') {
            requestCityLocationMessage.value =
              'Sua cidade não está entre as atendidas. Selecione uma cidade da lista.'
          }
        } catch {
          if (cityDetectionScope === 'request' && lookupId === requestCityLookupId)
            requestCityLocationMessage.value =
              'Não foi possível identificar sua cidade. Selecione na lista.'
        } finally {
          if (cityDetectionScope === 'request' && lookupId === requestCityLookupId)
            detectingRequestCity.value = false
        }
      },
      () => {
        if (cityDetectionScope === 'request' && lookupId !== requestCityLookupId) return
        if (cityDetectionScope === 'request') detectingRequestCity.value = false
        if (cityDetectionScope === 'request')
          requestCityLocationMessage.value =
            'Localização indisponível. Selecione sua cidade na lista.'
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
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
    requestStep.value = 5
    showCustomerLogin.value = false
    await nextTick()
    window.scrollTo(0, 0)
  }

  function defaultAcademyForCity(city: string): string {
    if (!isMesquita(city)) return ''
    return (
      publicTrainerAcademies.value.find(
        (name) => name.trim().toLocaleLowerCase('pt-BR') === 'aquatic center — vila emil',
      ) ??
      publicTrainerAcademies.value.find(
        (name) => /aquatic\s*center/i.test(name) && /vila\s*emil/i.test(name),
      ) ??
      ''
    )
  }
  watch(publicTrainerAcademies, () => {
    if (viewMode.value === 'contact' && !form.gymName) {
      form.gymName = defaultAcademyForCity(form.city)
      form.attendsGym = Boolean(form.gymName)
    }
  })
  const otherGymName = ref('')
  watch(
    () => form.city,
    (city) => {
      if (viewMode.value !== 'contact' || requestStep.value > 3) return
      form.gymName = defaultAcademyForCity(city)
      form.attendsGym = Boolean(form.gymName)
      otherGymName.value = ''
      publicTrainerCity.value = city
      if (city) void loadPublicTrainers()
    },
  )

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
      if (!form.objective) {
        status.value = 'Selecione seu objetivo.'
        return
      }
      if (!Number.isInteger(sessions) || sessions < 1 || sessions > 4) {
        status.value = 'Selecione de 1 a 4 aulas por semana.'
        return
      }
    } else if (requestStep.value === 2) {
      if (!form.gymName) {
        status.value = 'Selecione uma academia.'
        return
      }
      if (form.gymName === 'Outros' && !otherGymName.value.trim()) {
        status.value = 'Informe o lugar onde pretende treinar.'
        return
      }
      form.attendsGym = true
      if (!form.trainingDays.length) {
        status.value = 'Selecione pelo menos um dia da semana.'
        return
      }
      if (trainingStartMinutes.value >= trainingEndMinutes.value) {
        status.value = 'Informe uma faixa de horário válida.'
        return
      }
      const selectedCity = matchSupportedRequestCity(form.city)
      if (!selectedCity) {
        status.value = 'Selecione uma cidade atendida.'
        return
      }
      form.city = selectedCity
    }
    if (requestStep.value === 3) {
      await selectTrainersForDraft()
      return
    }
    if (requestStep.value < 3) requestStep.value += 1
    await nextTick()
    window.scrollTo(0, 0)
  }

  async function selectTrainersForDraft() {
    if (!matchSupportedRequestCity(form.city)) {
      status.value = 'Selecione uma cidade atendida antes de escolher os profissionais.'
      requestStep.value = 2
      return
    }
    status.value = ''
    selectingTrainersForDraft.value = true
    sharingRequestMessage.value = ''
    publicTrainerCity.value = form.city
    publicTrainerAcademy.value = ''
    homeSelectedTrainerIds.value = [...selectedTrainerIds.value]
    viewMode.value = 'select-trainers'
    await loadPublicTrainers()
    await nextTick()
    window.scrollTo(0, 0)
  }
  async function returnToDraftSummary() {
    if (selectingTrainersForDraft.value && !homeSelectedTrainerIds.value.length) {
      sharingRequestMessage.value = 'Selecione pelo menos um personal para continuar.'
      return
    }
    selectedTrainerIds.value = [...homeSelectedTrainerIds.value]
    selectingTrainersForDraft.value = false
    viewMode.value = 'contact'
    requestStep.value = 5
    showRequestForm.value = true
    await nextTick()
    window.scrollTo(0, 0)
  }
  async function confirmServiceRequest() {
    if (!selectedTrainerIds.value.length) {
      status.value = 'Selecione pelo menos um personal antes de enviar a solicitação.'
      return
    }
    if (!/^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(String(form.age).trim())) {
      status.value = 'Informe sua idade (de 1 a 120 anos) antes de enviar.'
      return
    }
    if (!customerSignedInName.value) {
      await openCustomerLogin(true, 'whatsapp')
      return
    }
    form.shareContactConsent = true
    await sendResult()
  }

  function openSentRequests() {
    requestSent.value = false
    return openCustomerRequests()
  }

  async function openCustomerRequests() {
    viewMode.value = 'customer-requests'
    customerRequestsStatus.value = 'Carregando suas solicitações…'
    await nextTick()
    window.scrollTo(0, 0)
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) {
        customerRequestsStatus.value = 'Entre na sua conta para consultar suas propostas.'
        return
      }
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(`${endpoint}/api/customers/requests`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = (await response.json()) as { requests?: CustomerRequest[]; error?: string }
      if (!response.ok || !Array.isArray(body.requests))
        throw new Error(body.error || 'Não foi possível carregar suas solicitações.')
      customerRequests.value = body.requests.filter(
        (request) =>
          !request.requestExpired &&
          request.validUntil * 1000 > Date.now() &&
          request.lifecycle === 'OPEN',
      )
      customerRequestsStatus.value = customerRequests.value.length
        ? ''
        : 'Você não possui solicitações ativas.'
    } catch (error) {
      customerRequestsStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar suas solicitações.'
    }
  }

  async function changeRequestVisibility(
    request: CustomerRequest,
    action: 'deactivate' | 'reactivate',
  ) {
    if (
      changingRequestId.value ||
      request.requestExpired ||
      request.validUntil * 1000 <= Date.now()
    )
      return
    if (
      action === 'deactivate' &&
      (request.lifecycle !== 'OPEN' ||
        request.proposalCount !== 0 ||
        request.proposals.length !== 0)
    )
      return
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
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(
        `${endpoint}/api/requests/${encodeURIComponent(request.requestId)}/visibility`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ action }),
        },
      )
      const body = (await response.json()) as { updated?: boolean; error?: string }
      if (!response.ok || !body.updated)
        throw new Error(body.error || 'Não foi possível atualizar a solicitação.')
      requestActionDialog.value = null
      await openCustomerRequests()
      customerRequestsStatus.value =
        action === 'deactivate'
          ? 'Solicitação inativada. Você pode reativá-la até o vencimento.'
          : 'Solicitação reativada.'
    } catch (error) {
      requestActionError.value =
        error instanceof Error ? error.message : 'Não foi possível atualizar a solicitação.'
    } finally {
      changingRequestId.value = ''
    }
  }

  async function acceptProposal(request: CustomerRequest, proposal: CustomerProposal) {
    if (proposal.expired || proposal.status !== 'OPEN') return
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(
        `${endpoint}/api/requests/${encodeURIComponent(request.requestId)}/accept`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ trainerId: proposal.trainerId }),
        },
      )
      const body = (await response.json()) as { accepted?: boolean; error?: string }
      if (!response.ok || body.accepted !== true)
        throw new Error(body.error || 'Não foi possível aceitar esta proposta.')
      await openCustomerRequests()
      status.value = `Proposta de ${proposal.name} aceita. O profissional será avisado.`
    } catch (error) {
      status.value = error instanceof Error ? error.message : 'Não foi possível aceitar a proposta.'
    }
  }

  async function loadTrainerSession(
    token: string,
    signal?: AbortSignal,
  ): Promise<TrainerAccountProfile> {
    const endpoint = await getRequestApiEndpoint(signal)
    const response = await fetch(endpoint + '/api/trainers/profile', {
      signal,
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
    })
    const body = (await response.json()) as {
      authenticated?: boolean
      profile?: TrainerAccountProfile
      error?: string
    }
    if (!response.ok || body.authenticated !== true || !body.profile?.trainerId)
      throw new Error(body.error || 'Sessão inválida.')
    return body.profile
  }

  function applyTrainerSession(profile: TrainerAccountProfile) {
    trainerSignedInId.value = profile.trainerId
    trainerSignedInName.value = profile.name
    customerSignedInName.value = ''
    try {
      sessionStorage.removeItem('fitpeso-customer-session')
      sessionStorage.removeItem('fitpeso-google-session')
    } catch {
      /* armazenamento indisponível */
    }
  }

  function applyProfileForEditing(profile: {
    name: string
    whatsapp: string
    email?: string
    dateOfBirth?: string
    instagram?: string
    cref?: string
    slug?: string
    academias?: string[]
  }) {
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
        : (sessionStorage.getItem('fitpeso-customer-session') ??
          sessionStorage.getItem('fitpeso-google-session'))
      if (!token) throw new Error('Entre na sua conta para consultar o cadastro.')
      const profile = trainer ? await loadTrainerSession(token) : await loadCustomerProfile(token)
      if (sessionGeneration !== generation || viewMode.value !== 'my-profile') return
      applyProfileForEditing(profile)
      editingProfileStatus.value = ''
    } catch (error) {
      if (sessionGeneration === generation) {
        editingProfileStatus.value =
          error instanceof Error ? error.message : 'Não foi possível carregar seu cadastro.'
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
      editingProfileStatus.value =
        'Informe uma data de nascimento válida ou deixe em branco até solicitar atendimento.'
      return
    }
    const trainer = editingProfileType.value === 'trainer'
    const cref = editingProfile.cref.trim().toUpperCase()
    const instagram = editingProfile.instagram.trim()
    if (trainer && cref && !/^[0-9]{1,10}-[GP]\/[A-Z]{2}$/.test(cref)) {
      editingProfileStatus.value = 'Informe um CREF no formato 072573-G/RJ ou deixe em branco.'
      return
    }
    if (
      trainer &&
      instagram &&
      (!/^@[A-Za-z0-9._]{1,30}$/.test(instagram) ||
        instagram.includes('..') ||
        instagram.endsWith('.'))
    ) {
      editingProfileStatus.value = 'Informe o Instagram no formato @usuario.'
      return
    }
    editingProfileSaving.value = true
    editingProfileStatus.value = 'Salvando alterações…'
    const generation = sessionGeneration
    try {
      const token = trainer
        ? sessionStorage.getItem('fitpeso-trainer-session')
        : (sessionStorage.getItem('fitpeso-customer-session') ??
          sessionStorage.getItem('fitpeso-google-session'))
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
      const endpoint = await getRequestApiEndpoint()
      const resource = trainer ? 'trainers' : 'customers'
      const response = await fetch(endpoint + '/api/' + resource + '/update-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        cache: 'no-store',
        body: JSON.stringify(
          trainer
            ? { name, dateOfBirth: birth, instagram, cref, academias: editingProfile.academias }
            : { name, ...(birth ? { dateOfBirth: birth } : {}) },
        ),
      })
      const body = (await response.json()) as {
        authenticated?: boolean
        profile?: TrainerAccountProfile & { dateOfBirth?: string; email?: string }
        error?: string
      }
      if (!response.ok || !body.authenticated || !body.profile)
        throw new Error(body.error || 'Não foi possível salvar o cadastro.')
      if (sessionGeneration !== generation || viewMode.value !== 'my-profile') return
      applyProfileForEditing(body.profile)
      if (trainer) applyTrainerSession(body.profile)
      else
        applyCustomerProfile({
          name: body.profile.name,
          whatsapp: body.profile.whatsapp,
          email: body.profile.email ?? '',
          dateOfBirth: body.profile.dateOfBirth,
        })
      editingProfileStatus.value = 'Cadastro atualizado com sucesso.'
      if (
        !trainer &&
        requestStep.value === 5 &&
        showRequestForm.value &&
        isValidLoginBirthDate(customerForm.dateOfBirth)
      ) {
        viewMode.value = 'contact'
        status.value = 'Cadastro completo. Agora você pode confirmar sua solicitação.'
        await nextTick()
        window.scrollTo(0, 0)
      }
    } catch (error) {
      if (sessionGeneration === generation)
        editingProfileStatus.value =
          error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'
    } finally {
      if (sessionGeneration === generation) editingProfileSaving.value = false
    }
  }

  // The progress measures a fifteen-second waiting window, never authentication success.

  const pendingWhatsAppKey = 'fitpeso-pending-whatsapp-login'
  const whatsappProgressDurationMs = 15_000
  const pendingWhatsAppLogin = ref<PendingWhatsAppLogin | null>(null)
  const whatsappClock = ref(Date.now())
  const whatsappChecking = ref(false)
  const whatsappConfirmed = ref(false)
  const whatsappNetworkError = ref(false)
  const whatsappProgressStartedAt = computed(
    () => pendingWhatsAppLogin.value?.progressStartedAt ?? 0,
  )
  const whatsappProgress = computed(() =>
    whatsappConfirmed.value
      ? 100
      : whatsappProgressStartedAt.value
        ? Math.min(
            100,
            Math.max(
              0,
              Math.floor(
                ((whatsappClock.value - whatsappProgressStartedAt.value) /
                  whatsappProgressDurationMs) *
                  100,
              ),
            ),
          )
        : 0,
  )
  const whatsappSecondsRemaining = computed(() =>
    Math.max(
      0,
      Math.ceil(
        (whatsappProgressDurationMs - (whatsappClock.value - whatsappProgressStartedAt.value)) /
          1000,
      ),
    ),
  )
  let whatsappCheckTimer: number | undefined
  let whatsappClockTimer: number | undefined
  let whatsappRequest: AbortController | undefined
  let whatsappAttemptGeneration = 0
  let whatsappLeftPage = false

  function persistWhatsAppAttempt() {
    try {
      if (pendingWhatsAppLogin.value)
        sessionStorage.setItem(pendingWhatsAppKey, JSON.stringify(pendingWhatsAppLogin.value))
      else sessionStorage.removeItem(pendingWhatsAppKey)
    } catch {
      /* The current attempt still works when storage is unavailable. */
    }
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

  function saveNewWhatsAppAttempt(
    role: PendingWhatsAppLogin['role'],
    whatsapp: string,
    code: string,
    token: string,
    expiresAt?: number,
  ) {
    clearPendingWhatsAppLogin()
    pendingWhatsAppLogin.value = {
      role,
      whatsapp,
      code,
      token,
      expiresAt: expiresAt ? expiresAt * 1000 : Date.now() + 15 * 60_000,
      progressStartedAt: 0,
      awaitingReturn: false,
    }
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
      if (pendingWhatsAppLogin.value && Date.now() >= pendingWhatsAppLogin.value.expiresAt)
        expireWhatsAppAttempt()
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
      if (
        !a ||
        !['customer', 'trainer'].includes(a.role) ||
        !/^\+55\d{10,11}$/.test(a.whatsapp) ||
        !/^[A-Za-z0-9_-]{22}$/.test(a.code) ||
        !/^[A-Za-z0-9_-]{43}$/.test(a.token) ||
        !Number.isFinite(a.expiresAt) ||
        !Number.isFinite(a.progressStartedAt) ||
        a.progressStartedAt < 0 ||
        a.progressStartedAt > Date.now() ||
        typeof a.awaitingReturn !== 'boolean' ||
        a.expiresAt > Date.now() + 15 * 60_000
      ) {
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
      const link =
        'https://wa.me/5521971118383?text=' +
        encodeURIComponent(`Confirmar login FitPeso ${a.code}\nWhatsApp: ${a.whatsapp}`)
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
      if (Date.now() >= a.expiresAt) {
        expireWhatsAppAttempt()
        return
      }
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
    if (Date.now() >= attempt.expiresAt) {
      expireWhatsAppAttempt()
      return
    }
    window.clearTimeout(whatsappCheckTimer)
    const controller = new AbortController()
    whatsappRequest = controller
    whatsappChecking.value = true
    const isCurrent = () => pendingWhatsAppLogin.value === attempt && !controller.signal.aborted
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    try {
      const endpoint = await getRequestApiEndpoint(controller.signal)
      if (!isCurrent()) return
      const response = await fetch(
        `${endpoint}/api/${attempt.role === 'trainer' ? 'trainers' : 'customers'}/login-status`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            whatsapp: attempt.whatsapp,
            code: attempt.code,
            sessionToken: attempt.token,
          }),
        },
      )
      const body = (await response.json()) as {
        authenticated?: boolean
        expired?: boolean
        confirmed?: boolean
      }
      if (!isCurrent()) return
      if (!response.ok) throw new Error('Status unavailable')
      whatsappNetworkError.value = false
      if (body.expired) {
        expireWhatsAppAttempt()
        return
      }
      if (body.authenticated) {
        whatsappConfirmed.value = true
        window.clearInterval(whatsappClockTimer)
        if (attempt.role === 'trainer') {
          const profile = await loadTrainerSession(attempt.token, controller.signal)
          if (!isCurrent()) return
          try {
            sessionStorage.setItem('fitpeso-trainer-session', attempt.token)
          } catch {
            /* Session remains in memory. */
          }
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
          } catch {
            /* Session remains in memory. */
          }
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
        customerLoginError.value =
          'Não foi possível confirmar o login. Confira o WhatsApp e tente novamente.'
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
    if (!requestLoginReturn.value)
      saveNavigationPreference(NAV_ROLE, loginAsTrainer.value ? 'trainer' : 'customer')
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
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date &&
      date >= '1900-01-01' &&
      date <= new Date().toISOString().slice(0, 10)
    )
  }

  async function startTrainerWhatsAppLogin() {
    if (trainerLoginSubmitting.value) return
    const whatsapp = normalizeBrazilianPhone(customerLoginWhatsApp.value)
    if (!whatsapp) {
      trainerLoginError.value = 'Informe um WhatsApp válido com DDD.'
      return
    }
    trainerLoginSubmitting.value = true
    trainerLoginError.value = ''
    trainerLoginStatus.value = 'Preparando acesso…'
    const generation = whatsappAttemptGeneration
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/trainers/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ whatsapp, sessionToken: token }),
      })
      const body = (await response.json()) as {
        started?: boolean
        verificationCode?: string
        expiresAt?: number
        error?: string
      }
      if (generation !== whatsappAttemptGeneration) return
      if (!response.ok || !body.started || !body.verificationCode)
        throw new Error(body.error || 'Não foi possível iniciar o login.')
      trainerLoginCode.value = body.verificationCode
      trainerLoginToken.value = token
      trainerLoginLink.value =
        'https://wa.me/5521971118383?text=' +
        encodeURIComponent(
          'Confirmar login FitPeso ' + body.verificationCode + '\nWhatsApp: ' + whatsapp,
        )
      trainerLoginDialog.value = true
      saveNewWhatsAppAttempt('trainer', whatsapp, body.verificationCode, token, body.expiresAt)
      trainerLoginStatus.value =
        'Toque no botão da janela para enviar a mensagem à Beta pelo WhatsApp. Depois, aguarde a confirmação automática.'
      scheduleWhatsAppLoginCheck(1000)
    } catch (error) {
      trainerLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login.'
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
        headers: { authorization: 'Bearer ' + token },
        cache: 'no-store',
      })
      const body = (await response.json()) as {
        requests?: TrainerReceivedRequest[]
        error?: string
      }
      if (!response.ok || !Array.isArray(body.requests))
        throw new Error(body.error || 'Não foi possível carregar as solicitações.')
      trainerReceivedRequests.value = body.requests
      trainerRequestsStatus.value = body.requests.length
        ? ''
        : 'Nenhuma solicitação recebida no momento.'
    } catch (error) {
      trainerRequestsStatus.value =
        error instanceof Error ? error.message : 'Não foi possível consultar as solicitações.'
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
      const sessionToken = btoa(
        Array.from(randomBytes, (byte) => String.fromCharCode(byte)).join(''),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(`${endpoint}/api/customers/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ whatsapp, sessionToken }),
      })
      const body = (await response.json()) as {
        started?: boolean
        verificationCode?: string
        expiresAt?: number
        error?: string
      }
      if (generation !== whatsappAttemptGeneration) return
      if (!response.ok || body.started !== true || !body.verificationCode)
        throw new Error(body.error || 'Não foi possível iniciar o login agora.')
      customerLoginWhatsApp.value = whatsapp
      customerLoginCode.value = body.verificationCode
      customerLoginSessionToken.value = sessionToken
      customerLoginVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(`Confirmar login FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}`)}`
      saveNewWhatsAppAttempt(
        'customer',
        whatsapp,
        body.verificationCode,
        sessionToken,
        body.expiresAt,
      )
      customerLoginStatus.value =
        'Envie o código pelo WhatsApp. Depois, mantenha esta tela aberta: o login será confirmado automaticamente.'
      showCustomerLoginDialog.value = true
      scheduleCustomerLoginPoll(1_000)
    } catch (error) {
      customerLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login agora.'
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
      const token = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/customers/start-email-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: loginIdentifier.value,
          sessionToken: token,
          asTrainer: loginAsTrainer.value,
        }),
      })
      const body = (await response.json()) as { started?: boolean; error?: string }
      if (!response.ok || body.started !== true)
        throw new Error(body.error || 'Não foi possível enviar a confirmação.')
      emailLoginSessionToken.value = token
      emailLoginPending.value = true
      emailLoginStartedAt = Date.now()
      scheduleEmailLoginPoll(1500)
    } catch (error) {
      emailLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login por e-mail.'
    } finally {
      emailLoginSubmitting.value = false
    }
  }

  function scheduleEmailLoginPoll(delayMs = 3000) {
    if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
    emailLoginPollTimer = window.setTimeout(() => void pollEmailLogin(), delayMs)
  }

  async function pollEmailLogin() {
    if (!showCustomerLogin.value || !emailLoginPending.value || !emailLoginSessionToken.value)
      return
    const token = emailLoginSessionToken.value
    const trainer = loginAsTrainer.value
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(endpoint + '/api/customers/email-login-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ sessionToken: token, role: trainer ? 'trainer' : 'customer' }),
      })
      const body = (await response.json()) as { authenticated?: boolean; error?: string }
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
    void router.replace(`${window.location.pathname}#cadastro-cliente`)
  }

  async function finishEmailLoginFromLink() {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('emailLoginCode')
    if (!code) return
    // Remove the one-time code from history before making network requests.
    url.searchParams.delete('emailLoginCode')
    void router.replace(url.pathname + url.search + url.hash)
    try {
      const endpoint = await getRequestApiEndpoint()
      const response = await fetch(
        endpoint + '/api/customers/verify-email-login?code=' + encodeURIComponent(code),
        {
          method: 'POST',
          cache: 'no-store',
        },
      )
      const result = (await response.json()) as {
        authenticated?: boolean
        sessionToken?: string
        role?: string
        error?: string
      }
      if (!response.ok || !result.authenticated || !result.sessionToken)
        throw new Error(result.error || 'Não foi possível confirmar o e-mail.')
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
      emailLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível confirmar o login.'
      showCustomerLogin.value = true
    }
  }

  function closeHamburgerOnOutsideClick(event: PointerEvent) {
    const menu = document.querySelector<HTMLDetailsElement>('.main-hamburger-menu[open]')
    if (menu && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
  }

  function closeHamburgerOnSelection(event: MouseEvent) {
    const menu = document.querySelector<HTMLDetailsElement>('.main-hamburger-menu[open]')
    if (
      menu &&
      event.target instanceof Element &&
      event.target.closest('.account-dropdown-panel button')
    )
      menu.open = false
  }

  usePublicNavigation(
    viewMode,
    () => {
      selectingTrainersForDraft.value = false
      publicTrainerCity.value = homeCity.value || ''
      publicTrainerAcademy.value = ''
      viewMode.value = 'public-trainers'
      if (publicTrainerCity.value) void loadPublicTrainers()
    },
    () => {
      viewMode.value = 'home'
      selectingTrainersForDraft.value = false
    },
  )

  watch(
    viewMode,
    (mode) =>
      updatePageSeo(
        mode === 'home' ? 'home' : mode === 'public-trainers' ? 'directory' : 'private',
      ),
    { immediate: true },
  )

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
    if (trainerRequestToken)
      void router.replace(`${window.location.pathname}${window.location.hash}`)
    void loadTrainerProfile()
    void loadTrainerRequest()
    if (isRootHome && !homeCityManuallySelected.value) void detectRequestCity('home')
    if (homeCity.value) void loadHomeTrainerCount(homeCity.value)
    try {
      const trainerToken = sessionStorage.getItem('fitpeso-trainer-session')
      if (trainerToken) {
        const generation = sessionGeneration
        void loadTrainerSession(trainerToken)
          .then((profile) => {
            if (
              sessionGeneration === generation &&
              sessionStorage.getItem('fitpeso-trainer-session') === trainerToken
            ) {
              applyTrainerSession(profile)
            }
          })
          .catch(() => {
            if (sessionGeneration !== generation) return
            sessionStorage.removeItem('fitpeso-trainer-session')
            trainerSignedInId.value = ''
            trainerSignedInName.value = ''
          })
      }
    } catch {
      /* armazenamento indisponível */
    }
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session')
      if (token) {
        const generation = sessionGeneration
        void loadCustomerProfile(token)
          .then((profile) => {
            const storedToken =
              sessionStorage.getItem('fitpeso-customer-session') ??
              sessionStorage.getItem('fitpeso-google-session')
            if (sessionGeneration === generation && storedToken === token)
              applyCustomerProfile(profile)
          })
          .catch(() => {
            if (sessionGeneration !== generation) return
            sessionStorage.removeItem('fitpeso-google-session')
            sessionStorage.removeItem('fitpeso-customer-session')
            customerSignedInName.value = ''
          })
      }
    } catch {
      /* Sessão temporária indisponível; ainda é possível entrar novamente. */
    }
    restoreWhatsAppAttempt()
    document.addEventListener('visibilitychange', onWhatsAppVisibilityChange)
    window.addEventListener('focus', onWhatsAppReturn)
    window.addEventListener('blur', onWhatsAppBlur)
  })

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
    const validName =
      clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
    const validCity = Boolean(matchSupportedRequestCity(city))
    const validAge = age !== undefined && Number.isInteger(age) && age >= 1 && age <= 120
    const normalizedPhoneDigits = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`
    const validPhone = /^55[1-9]{2}9?\d{8}$/.test(normalizedPhoneDigits)

    if (!validName || !validCity || !validAge || !validPhone) {
      status.value = 'Confira o nome, o WhatsApp, a cidade e informe sua idade (de 1 a 120 anos).'
      return
    }
    if (!selectedTrainerIds.value.length) {
      status.value = 'Selecione pelo menos um personal.'
      return
    }
    if (
      !Number.isInteger(Number(form.sessionsPerWeek)) ||
      Number(form.sessionsPerWeek) < 1 ||
      Number(form.sessionsPerWeek) > 4 ||
      !form.trainingDays.length ||
      trainingStartMinutes.value >= trainingEndMinutes.value
    ) {
      status.value = 'Informe as aulas por semana, pelo menos um dia e uma faixa de horário válida.'
      return
    }
    const trainingDays = form.trainingDays
    const trainingShifts = trainingTimeShifts.value

    submittingRequest.value = true
    status.value = 'Enviando sua solicitação para a Beta…'

    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) throw new Error('Entre na sua conta para solicitar atendimento.')
      const createdRequestId = await createFitpesoRequest(
        {
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
          ...(form.attendsGym && form.gymName.trim()
            ? {
                gymName:
                  form.gymName === 'Outros' ? otherGymName.value.trim() : form.gymName.trim(),
              }
            : {}),
          objective: form.objective,
          ...(form.sessionsPerWeek ? { sessionsPerWeek: Number(form.sessionsPerWeek) } : {}),
          trainingDays,
          trainingShifts,
          trainingStartTime: minutesToTime(trainingStartMinutes.value),
          trainingEndTime: minutesToTime(trainingEndMinutes.value),
          selectedTrainerIds: selectedTrainerIds.value,
          consent: form.shareContactConsent,
        },
        token,
      )
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
      status.value =
        error instanceof Error ? error.message : 'Não foi possível preparar a solicitação agora.'
      submittingRequest.value = false
      return
    }

    status.value = ''
    submittingRequest.value = false
  }

  return {
    setGoogleButtonContainer,
    ConsultarProfissionaisView,
    SelecionarProfissionaisView,
    isRootHome,
    showHomeTopbar,
    viewMode,
    showRequestForm,
    requestSent,
    selectingTrainersForDraft,
    publicTrainerCity,
    publicTrainerAcademy,
    homeSelectedTrainerIds,
    sharingRequestId,
    sharingRequestMessage,
    sharingRequestBusy,
    activeCustomerRequest,
    checkingCustomerRequests,
    customerRequestsLookupError,
    searchHomeTrainers,
    requestProposalFromHome,
    refreshShareableRequests,
    publicTrainersLoading,
    publicTrainersError,
    publicTrainerAcademies,
    publicFilteredTrainers,
    openPublicTrainers,
    selectedTrainerIds,
    customerRequests,
    changingRequestId,
    requestActionDialog,
    requestActionError,
    showTrainerSignup,
    showCustomerSignup,
    showCustomerLogin,
    customerSignedInName,
    customerIsAdmin,
    form,
    result,
    evaluating,
    evaluationProgress,
    status,
    goHome,
    openRequestForm,
    returnToDraftSummary,
    openSentRequests,
    openCustomerRequests,
    confirmRequestVisibilityChange,
    availableCities,
    adminTrainerForm,
    adminTrainerStatus,
    adminTrainerBusy,
    saveAdminTrainer,
    adminTrainerSearch,
    selectedAdminTrainerId,
    adminTrainersStatus,
    adminTrainersLoading,
    adminTrainerEditBusy,
    adminTrainerEditForm,
    filteredAdminTrainers,
    selectAdminTrainer,
    saveAdminTrainerEdit,
    openTrainersForRequest,
    customerRequestsStatus,
    changeRequestVisibility,
    acceptProposal,
    academyOptions,
    addAcademy,
    profileAcademyChoice,
    profileOtherAcademy,
    editingProfile,
    editingProfileType,
    editingProfileStatus,
    editingProfileLoading,
    editingProfileSaving,
    saveMyProfile,
    trainerRequest,
    trainerProposalPrice,
    trainerProposalMessage,
    trainerProposalSubmitting,
    trainerRequestStatus,
    submitTrainerProposal,
    trainerReceivedRequests,
    trainerRequestsStatus,
    openTrainerReceivedRequests,
    adjustMeasurement,
    calculateImc,
    classification,
    classificationEmoji,
    silhouetteImage,
    silhouettePositions,
    silhouetteGenderLabel,
    bmiScale,
    scalePosition,
    bodyFatReference,
    bmiSilhouettes,
    activeSilhouette,
    weightGoalAmount,
    referenceWeightRange,
    editMeasurement,
    minutesToTime,
    trainingTimeRanges,
    requestStep,
    selectedTrainerNames,
    trainingDayOptions,
    trainingStartMinutes,
    trainingEndMinutes,
    selectTrainingTimeRange,
    submittingRequest,
    otherGymName,
    modifyRequestDetails,
    continueToTrainerSelection,
    selectTrainersForDraft,
    confirmServiceRequest,
    sendResult,
    theme,
    customerForm,
    signupContact,
    signupStep,
    customerStatus,
    customerVerificationLink,
    customerVerificationComplete,
    customerSubmitting,
    goBackFromTitle,
    closeCustomerSignup,
    pollCustomerVerification,
    continueSignupContact,
    sendCustomerSignup,
    ref,
    loginAsTrainer,
    customerLoginError,
    loginIdentifier,
    loginStep,
    loginIdentifierKind,
    emailLoginPending,
    emailLoginSubmitting,
    emailLoginError,
    customerLoginVerificationLink,
    showCustomerLoginDialog,
    customerLoginSubmitting,
    trainerLoginError,
    trainerLoginLink,
    trainerLoginDialog,
    trainerLoginSubmitting,
    requestLoginReturn,
    googleButtonContainer,
    whatsappChecking,
    whatsappConfirmed,
    whatsappNetworkError,
    whatsappProgressStartedAt,
    whatsappProgress,
    whatsappSecondsRemaining,
    markWhatsAppOpened,
    changeLoginProfile,
    pollTrainerWhatsAppLogin,
    pollCustomerLogin,
    continueLoginIdentifier,
    returnToLoginIdentifier,
    submitIdentityLogin,
    pollEmailLogin,
    openCustomerSignupFromLogin,
    signupAcademyChoice,
    signupOtherAcademy,
    trainerForm,
    trainerStatus,
    trainerVerificationLink,
    trainerSubmitting,
    googleProfileStatus,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    openAdminTrainers,
    trainerSignedInName,
    trainerSignedInId,
    logout,
    openProfessionalRegistration,
    supportedRequestCities,
    homeCity,
    selectHomeCity,
    openCustomerLogin,
    openMyProfile,
    rootHomePersonalImage,
    trainerIdFromPath,
    trainerSlugFromHost,
    personalBrandFirstName,
    trainerProfileFailed,
  }
}
