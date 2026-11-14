import { useCustomerSignup } from './useCustomerSignup'
import { useTrainerSignup } from './useTrainerSignup'
import {
  isValidAge,
  isValidBirthDate,
  isValidEmail,
  isValidPersonName,
  normalizeBrazilianPhone,
  normalizeEmail,
  normalizePersonName,
} from '../utils/validation'
import { useAuthentication } from './useAuthentication'
import { loadCustomerProfile, loadTrainerSession } from '../services/authenticationService'
import { useAccountProfile } from './useAccountProfile'
import { useCustomerRequests } from './useCustomerRequests'
import { useAdminTrainers } from './useAdminTrainers'
import { useTrainerProposal } from './useTrainerProposal'
import { useAccountSession } from '../stores/accountSession'
import { createFitpesoRequest } from '../services/atendimentoService'
import { useRouter } from 'vue-router'
import { useTrainingDraft } from '../stores/trainingDraft'
import { useTheme } from './useTheme'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  EligibleTrainer,
  TrainerReceivedRequest,
  TrainerAccountProfile,
  CustomerRequest,
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

  function getTrainerIdFromPath(path: string) {
    const match = path.match(/^\/p\/([^/]+)\/?$/)
    if (!match) return ''
    try {
      const id = decodeURIComponent(match[1]).trim()
      return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : ''
    } catch {
      return ''
    }
  }

  function getTrainerSlugFromPath(path: string) {
    const match = path.match(/^\/personal\/([^/]+)\/?$/)
    if (!match) return ''
    try {
      const slug = decodeURIComponent(match[1]).trim().toLowerCase()
      return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? slug : ''
    } catch {
      return ''
    }
  }

  const trainerRequestToken = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
  const {
    trainerRequest,
    trainerProposalPrice,
    trainerProposalMessage,
    trainerProposalSubmitting,
    trainerRequestStatus,
    loadTrainerRequest,
    submitTrainerProposal,
  } = useTrainerProposal(trainerRequestToken)
  const trainerIdFromPath = computed(() => getTrainerIdFromPath(router.currentRoute.value.path))
  const trainerSlugFromPath = computed(() => getTrainerSlugFromPath(router.currentRoute.value.path))
  const isRootHome = computed(() => router.currentRoute.value.path === '/')
  const personalName = ref('FitPeso')
  const personalBrandFirstName = computed(() =>
    personalName.value.endsWith(' Personal Trainer')
      ? personalName.value.slice(0, -' Personal Trainer'.length)
      : '',
  )
  const trainerProfileFailed = ref(false)
  let trainerProfileLookupId = 0

  const viewMode = ref<
    | 'home'
    | 'about'
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
      : router.currentRoute.value.path.replace(/\/$/, '') === '/profissionais'
        ? 'public-trainers'
        : 'home',
  )
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

  const {
    sharingRequestId,
    sharingRequestMessage,
    sharingRequestBusy,
    activeCustomerRequest,
    checkingCustomerRequests,
    customerRequestsLookupError,
    customerRequests,
    customerRequestsStatus,
    changingRequestId,
    requestActionDialog,
    requestActionError,
    refreshShareableRequests,
    sendRequestToSelectedTrainers,
    openCustomerRequests,
    changeRequestVisibility,
    confirmRequestVisibilityChange,
    acceptProposal,
  } = useCustomerRequests({
    signedInName: customerSignedInName,
    selectedTrainerIds: homeSelectedTrainerIds,
    getToken: () =>
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      '',
    onOpen: () => {
      viewMode.value = 'customer-requests'
    },
    onStatus: (message) => {
      status.value = message
    },
  })
  const pendingHomeTrainerIds = ref<string[]>([])

  function searchHomeTrainers() {
    if (!homeCity.value) return
    publicTrainerCity.value = homeCity.value
    void loadPublicTrainers()
  }
  async function openRequestForTrainer(trainerId: string) {
    if (!publicFilteredTrainers.value.some((trainer) => trainer.trainerId === trainerId)) return
    await openRequestForm()
    selectedTrainerIds.value = [trainerId]
    homeSelectedTrainerIds.value = [trainerId]
    if (publicTrainerAcademy.value) {
      form.gymName = publicTrainerAcademy.value
      form.attendsGym = true
    }
  }

  async function requestProposalFromHome() {
    if (sharingRequestId.value) {
      void sendRequestToSelectedTrainers()
      return
    }
    // Preserva as escolhas feitas nos checkboxes antes de abrir a solicitação.
    pendingHomeTrainerIds.value = [...homeSelectedTrainerIds.value]
    await openRequestForm()
    selectedTrainerIds.value = [...pendingHomeTrainerIds.value]
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
  // A tela inicial sempre mostra uma academia válida quando a lista da cidade está disponível.
  watch(
    [publicTrainerAcademies, publicTrainerCity],
    ([academies, city], previousValues) => {
      const previousCity = previousValues?.[1]
      if (city !== previousCity) publicTrainerAcademy.value = ''
      if (!academies.length || !city) return
      if (academies.includes(publicTrainerAcademy.value)) return
      const preferred = readNavigationPreference(NAV_ACADEMY)
      publicTrainerAcademy.value =
        academies.find((name) => name === preferred) ??
        (isMesquita(city)
          ? academies.find((name) => /aquatic\\s*center/i.test(name) && /vila\\s*emil/i.test(name))
          : undefined) ??
        academies[0]
    },
    { immediate: true },
  )
  watch(publicTrainerAcademy, (academy) => {
    if (academy) saveNavigationPreference(NAV_ACADEMY, academy)
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
    // Preserva a academia escolhida na tela inicial.
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

  const requestVerificationLink = ref('')
  const showTrainerSignup = ref(window.location.hash === '#cadastro-personal')
  const showCustomerSignup = ref(window.location.hash === '#cadastro-cliente')

  const {
    showCustomerLogin,
    loginAsTrainer,
    customerLoginStatus,
    customerLoginError,
    customerLoginMethod,
    loginIdentifier,
    loginStep,
    loginIdentifierKind,
    emailLoginPending,
    emailLoginSubmitting,
    emailLoginError,
    emailLoginSessionToken,
    customerLoginWhatsApp,
    customerLoginCode,
    customerLoginSessionToken,
    customerLoginVerificationLink,
    showCustomerLoginDialog,
    customerLoginSubmitting,
    trainerLoginCode,
    trainerLoginToken,
    trainerLoginStatus,
    trainerLoginError,
    trainerLoginLink,
    trainerLoginDialog,
    trainerLoginSubmitting,
    requestLoginReturn,
    whatsappChecking,
    whatsappConfirmed,
    whatsappNetworkError,
    whatsappProgressStartedAt,
    whatsappProgress,
    whatsappSecondsRemaining,
    clearPendingWhatsAppLogin,
    markWhatsAppOpened,
    changeLoginProfile,
    pollTrainerWhatsAppLogin,
    pollCustomerLogin,
    continueLoginIdentifier,
    returnToLoginIdentifier,
    submitIdentityLogin,
    pollEmailLogin,
    closeCustomerLogin,
    finishEmailLoginFromLink,
    stopEmailLoginPoll,
    startAuthentication,
  } = useAuthentication({
    initialRole: readNavigationPreference(NAV_ROLE),
    showCustomerSignup,
    showTrainerSignup,
    saveRole: (role) => saveNavigationPreference(NAV_ROLE, role),
    applyCustomerProfile,
    applyTrainerSession,
    renderGoogleButton,
    goHome,
    returnToRequestFormAfterLogin,
    replaceUrl: (url) => router.replace(url),
  })

  const {
    customerForm,
    signupContact,
    signupStep,
    customerStatus,
    customerVerificationLink,
    customerVerificationComplete,
    customerSubmitting,
    pollCustomerVerification,
    continueSignupContact,
    sendCustomerSignup,
    closeCustomerSignup,
    stopCustomerVerification,
  } = useCustomerSignup({
    onClose: onCustomerSignupClosed,
    onAuthenticated: (sessionToken, profile) => {
      try {
        sessionStorage.setItem('fitpeso-customer-session', sessionToken)
      } catch {
        /* armazenamento indisponível */
      }
      applyCustomerProfile(profile)
    },
    active: computed(
      () => showCustomerSignup.value && !showTrainerSignup.value && !showCustomerLogin.value,
    ),
  })
  const {
    availableCities,
    signupAcademyChoice,
    signupOtherAcademy,
    trainerForm,
    trainerStatus,
    trainerVerificationLink,
    trainerSubmitting,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    stopTrainerRegistration,
  } = useTrainerSignup({ onClose: goHome, active: showTrainerSignup })
  const requestBirthDate = ref('')

  const googleProfileTarget = ref<'client' | 'trainer' | 'customer'>('client')

  const {
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
    openAdminTrainers,
    saveAdminTrainerEdit,
  } = useAdminTrainers({
    isAdmin: customerIsAdmin,
    getToken: () =>
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      '',
    onOpen: () => {
      viewMode.value = 'admin-trainers'
    },
  })

  const {
    editingProfile,
    editingProfileType,
    editingProfileStatus,
    editingProfileLoading,
    editingProfileSaving,
    openMyProfile,
    saveMyProfile,
    resetAccountProfile,
  } = useAccountProfile({
    isTrainer: () => Boolean(trainerSignedInId.value),
    getToken: (type) =>
      type === 'trainer'
        ? (sessionStorage.getItem('fitpeso-trainer-session') ?? '')
        : (sessionStorage.getItem('fitpeso-customer-session') ??
          sessionStorage.getItem('fitpeso-google-session') ??
          ''),
    openView: () => {
      viewMode.value = 'my-profile'
    },
    isViewOpen: () => viewMode.value === 'my-profile',
    applyCustomerProfile,
    applyTrainerSession,
    afterCustomerSave: async () => {
      if (
        requestStep.value === 5 &&
        showRequestForm.value &&
        isValidBirthDate(customerForm.dateOfBirth)
      ) {
        viewMode.value = 'contact'
        status.value = 'Cadastro completo. Agora você pode confirmar sua solicitação.'
        await nextTick()
        window.scrollTo(0, 0)
      }
    },
  })

  const trainerReceivedRequests = ref<TrainerReceivedRequest[]>([])
  const trainerRequestsStatus = ref('')
  let sessionGeneration = 0

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
    stopEmailLoginPoll()
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
    resetAccountProfile()
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
      // Retorna à listagem sem perder a academia ou o filtro escolhido.
      showRequestForm.value = false
      selectingTrainersForDraft.value = false
      viewMode.value = 'public-trainers'
      status.value = ''
      sharingRequestMessage.value = ''
      if (publicTrainerCity.value) void loadPublicTrainers()
    } else if (viewMode.value === 'select-trainers') {
      if (selectingTrainersForDraft.value) {
        selectingTrainersForDraft.value = false
        viewMode.value = 'contact'
        requestStep.value = 5
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
    const leavingPublicDirectory = router.currentRoute.value.path === '/profissionais'
    const leavingPersonalProfile = Boolean(trainerIdFromPath.value || trainerSlugFromPath.value)
    clearPendingWhatsAppLogin()
    showTrainerSignup.value = false
    showCustomerSignup.value = false
    showCustomerLogin.value = false
    loginStep.value = 1
    emailLoginPending.value = false
    emailLoginError.value = ''
    stopEmailLoginPoll()
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
    stopCustomerVerification()
    stopTrainerRegistration()
    showCustomerLoginDialog.value = false
    // The public-navigation watcher owns the /profissionais -> / transition.
    // Personalized pages must return to the main URL; other screens only clear the hash.
    if (leavingPersonalProfile) void router.replace('/')
    else if (!leavingPublicDirectory) void router.replace(router.currentRoute.value.path)
    void nextTick(() => window.scrollTo(0, 0))
  }

  function onCustomerSignupClosed(confirmed: boolean) {
    if (requestLoginReturn.value && confirmed) {
      showCustomerSignup.value = false
      showRequestForm.value = true
      viewMode.value = 'contact'
      requestStep.value = 5
      if (customerSignedInName.value) {
        showCustomerLogin.value = false
        customerLoginStatus.value = 'Cadastro confirmado. Você já está conectado.'
      } else {
        showCustomerLogin.value = true
        customerLoginMethod.value = 'whatsapp'
        customerLoginStatus.value =
          'Cadastro confirmado. Entre para retornar à revisão da solicitação.'
      }
      void router.replace(window.location.pathname)
      void nextTick(() => window.scrollTo(0, 0))
      return
    }
    goHome()
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
    const lookupId = ++trainerProfileLookupId
    personalName.value = 'FitPeso'
    trainerProfileFailed.value = false
    const trainerId = trainerIdFromPath.value
    const trainerSlug = trainerSlugFromPath.value
    if (!trainerId && !trainerSlug) return
    try {
      const endpoint = await getRequestApiEndpoint()
      const profilePath = trainerSlug
        ? `/api/trainers/by-slug/${encodeURIComponent(trainerSlug)}`
        : `/api/trainers/${encodeURIComponent(trainerId)}`
      const response = await fetch(`${endpoint}${profilePath}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Trainer profile unavailable')
      const body = (await response.json()) as { trainer?: { name?: unknown } }
      const name = typeof body.trainer?.name === 'string' ? body.trainer.name.trim() : ''
      if (!name) throw new Error('Invalid trainer profile')
      if (lookupId !== trainerProfileLookupId) return
      const firstName = name.split(/\s+/)[0]
      personalName.value = `${firstName} Personal Trainer`
    } catch {
      if (lookupId === trainerProfileLookupId) trainerProfileFailed.value = true
    }
  }

  watch([trainerIdFromPath, trainerSlugFromPath], () => void loadTrainerProfile(), {
    immediate: true,
  })

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
    else if (city && viewMode.value === 'home' && isRootHome.value) {
      publicTrainerCity.value = city
      void loadPublicTrainers()
    }
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
    requestStep.value = 5
    selectingTrainersForDraft.value = false
    ++requestCityLookupId
    form.city = homeCity.value
    // O controle deslizante precisa sempre começar com uma idade válida.
    if (!Number.isInteger(Number(form.age)) || Number(form.age) < 15 || Number(form.age) > 100) {
      form.age = '35'
    }
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
    form.gymName = publicTrainerAcademy.value || defaultAcademyForCity(form.city)
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
      if (viewMode.value !== 'contact') return
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
      if (!isValidAge(form.age)) {
        status.value = 'Informe sua idade (de 15 a 100 anos).'
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
      requestStep.value = 5
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
    if (!isValidAge(form.age)) {
      status.value = 'Informe sua idade (de 15 a 100 anos) antes de enviar.'
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

  onUnmounted(() => {
    document.removeEventListener('pointerdown', closeHamburgerOnOutsideClick)
    document.removeEventListener('click', closeHamburgerOnSelection)
  })

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

  function openCustomerSignupFromLogin() {
    clearPendingWhatsAppLogin()
    signupStep.value = 1
    signupContact.value = loginIdentifier.value.trim()
    showCustomerLogin.value = false
    showCustomerSignup.value = true
    void router.replace(`${window.location.pathname}#cadastro-cliente`)
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
    if (viewMode.value === 'home' && isRootHome.value && homeCity.value) {
      publicTrainerCity.value = homeCity.value
      void loadPublicTrainers()
    }
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
    void loadTrainerRequest()
    if (isRootHome.value && !homeCityManuallySelected.value) void detectRequestCity('home')
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
    startAuthentication()
  })

  async function sendResult() {
    if (!form.shareContactConsent || submittingRequest.value) return
    status.value = ''

    const clientName = normalizePersonName(form.name)
    const normalizedPhone = normalizeBrazilianPhone(form.phone)
    const email = normalizeEmail(form.email)
    const city = form.city.trim().replace(/\s+/g, ' ')
    const ageInput = String(form.age).trim()
    const age = ageInput ? Number(ageInput) : undefined
    const validName = isValidPersonName(clientName)
    const validCity = Boolean(matchSupportedRequestCity(city))
    const validAge = isValidAge(ageInput)
    const validPhone = Boolean(normalizedPhone)
    const validEmail = isValidEmail(email, true)

    if (!validName || !validCity || !validAge || !validPhone || !validEmail) {
      status.value =
        'Confira o nome, o WhatsApp, o e-mail, a cidade e informe sua idade (de 15 a 100 anos).'
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
          clientPhone: normalizedPhone,
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
    viewMode,
    showRequestForm,
    requestSent,
    selectingTrainersForDraft,
    publicTrainerCity,
    publicTrainerAcademy,
    openRequestForTrainer,
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
    trainerSlugFromPath,
    personalBrandFirstName,
    trainerProfileFailed,
  }
}
