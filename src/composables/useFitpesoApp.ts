import { useCustomerSignup } from './useCustomerSignup'
import { useTrainerSignup } from './useTrainerSignup'
import { isValidBirthDate } from '../utils/validation'
import { useAuthentication } from './useAuthentication'
import { loadCustomerProfile } from '../services/authenticationService'
import { useAccountProfile } from './useAccountProfile'
import { useCustomerRequests } from './useCustomerRequests'
import { useAdminTrainers } from './useAdminTrainers'
import { useTrainerProposal } from './useTrainerProposal'
import { useAccountSession } from '../stores/accountSession'
import { useRouter } from 'vue-router'
import { useTrainingDraft } from '../stores/trainingDraft'
import { useTheme } from './useTheme'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { updatePageSeo } from '../services/seo'
import ConsultarProfissionaisView from '../views/profissionais/ConsultarProfissionaisView.vue'
import SelecionarProfissionaisView from '../views/atendimento/SelecionarProfissionaisView.vue'
import { usePublicNavigation } from './usePublicNavigation'
import { useAssessment } from './useAssessment'
import { usePublicTrainerProfile } from './usePublicTrainerProfile'
import { useHome } from './useHome'
import { useTrainingRequest } from './useTrainingRequest'
import type { AppViewMode } from '../types/navigation'
import { useSessionBootstrap } from './useSessionBootstrap'
import { useTrainerSelection } from '../stores/trainerSelection'
import { storeToRefs } from 'pinia'
import { getRequestApiEndpoint } from '../services/api'
import { minutesToTime } from '../utils/time'
import { trainingTimeRanges } from '../constants/training'
import type {
  GoogleCredentialResponse,
  GoogleIdentityApi,
  TrainerReceivedRequest,
  TrainerAccountProfile,
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
  const { trainerIdFromPath, trainerSlugFromPath, personalBrandFirstName, trainerProfileFailed } =
    usePublicTrainerProfile(router)
  const isRootHome = computed(() => router.currentRoute.value.path === '/')

  const viewMode = ref<AppViewMode>(trainerRequestToken ? 'trainer-request' : router.currentRoute.value.path === '/profissionais' ? 'public-trainers' : 'home')
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
  const NAV_ROLE = 'fitpeso:preferred-role:v1'

  const trainingDraft = useTrainingDraft()
  const { form } = trainingDraft
  const { trainingStartMinutes, trainingEndMinutes } = storeToRefs(trainingDraft)
  const selectedTrainerIds = ref<string[]>([])

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
  const homeController = useHome({
    viewMode, isRootHome, form, showRequestForm, requestStep, selectingTrainersForDraft,
    selectedTrainerIds, homeSelectedTrainerIds, sharingRequestId, sharingRequestMessage,
    openRequestForm: () => openRequestForm(),
    sendRequestToSelectedTrainers: () => sendRequestToSelectedTrainers(),
    readNavigationPreference, saveNavigationPreference,
  })
  const {
    publicTrainers,
    publicTrainerCity,
    publicTrainerAcademy,
    homeAcademySelected,
    publicTrainerAcademies,
    publicFilteredTrainers,
    publicTrainersLoading,
    publicTrainersError,
    searchHomeTrainers,
    loadPublicTrainers,
    openPublicTrainers,
    openRequestForTrainer,
    startTrainingRequestFromHome,
    requestProposalFromHome,
    openTrainersForRequest,
    supportedRequestCities,
    homeCity,
    homeCityManuallySelected,
    matchSupportedRequestCity,
    selectHomeCity,
    detectRequestCity,
    cancelRequestCityDetection,
  } = homeController

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
    adminAcademies,
    loadAdminAcademyOptions,
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

  function openAdminTrainer() {
    if (!customerIsAdmin.value) return
    viewMode.value = 'admin-trainer'
    void loadAdminAcademyOptions()
    void nextTick(() => window.scrollTo(0, 0))
  }

  function openAdminAcademies() {
    if (!customerIsAdmin.value) return
    viewMode.value = 'admin-academies'
    void nextTick(() => window.scrollTo(0, 0))
  }

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

  const status = ref('')
  const googleButtonContainer = ref<HTMLDivElement | null>(null)
  function setGoogleButtonContainer(element: unknown) {
    googleButtonContainer.value = element instanceof HTMLDivElement ? element : null
  }
  const googleProfileStatus = ref('')
  let googleIdentityScriptPromise: Promise<void> | null = null
  const {
    trainingDayOptions,
    selectTrainingTimeRange,
    submittingRequest,
    otherGymName,
    selectedTrainerNames,
    clearContactDetails,
    openRequestForm,
    modifyRequestDetails,
    continueToTrainerSelection,
    selectTrainersForDraft,
    returnToDraftSummary,
    confirmServiceRequest,
    sendResult,
  } = useTrainingRequest({
    viewMode, showRequestForm, requestStep, selectingTrainersForDraft, selectedTrainerIds, homeSelectedTrainerIds, sharingRequestId, sharingRequestMessage, customerSignedInName, form, trainingStartMinutes, trainingEndMinutes, status, refreshShareableRequests,
    home: homeController,
    openCustomerLogin: (fromRequest, method) => openCustomerLogin(fromRequest, method),
    onContactReset: () => { googleProfileStatus.value = '' },
  })
  const contactAge = computed(() => {
    if (!showRequestForm.value || form.age === '') return undefined
    const age = Number(String(form.age))
    return Number.isInteger(age) ? age : undefined
  })
  const {
    result,
    evaluating,
    evaluationProgress,
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
  } = useAssessment({
    form,
    contactAge,
    status,
    resetContactDetails: clearContactDetails,
    openAssessment: () => {
      viewMode.value = 'assessment'
    },
  })

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
      // A consulta pública já está na tela inicial.
      goHome()
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

  const { restoreSessions } = useSessionBootstrap({
    getGeneration: () => sessionGeneration,
    customerSignedInName,
    trainerSignedInId,
    trainerSignedInName,
    applyCustomerProfile,
    applyTrainerSession,
  })

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
      viewMode.value = 'public-trainers'
      publicTrainerCity.value = homeCity.value
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
    restoreSessions()
    startAuthentication()
  })

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
    homeAcademySelected,
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
    publicTrainers,
    startTrainingRequestFromHome,
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
    adminAcademies,
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
    openAdminTrainer,
    openAdminAcademies,
    trainerSignedInName,
    trainerSignedInId,
    logout,
    openProfessionalRegistration,
    supportedRequestCities,
    homeCity,
    selectHomeCity,
    openCustomerLogin,
    openMyProfile,
    trainerIdFromPath,
    trainerSlugFromPath,
    personalBrandFirstName,
    trainerProfileFailed,
  }
}
