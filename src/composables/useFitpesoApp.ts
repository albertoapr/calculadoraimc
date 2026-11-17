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
import { useApplicationNavigation } from './useApplicationNavigation'
import { safeReturnPath, type AppScreen } from '../router/screens'
import { useAssessment } from './useAssessment'
import { usePublicTrainerProfile } from './usePublicTrainerProfile'
import { useHome } from './useHome'
import { useTrainingRequest } from './useTrainingRequest'
import type { AppViewMode } from '../types/navigation'
import { useSessionBootstrap } from './useSessionBootstrap'
import { useTrainerSelection } from '../stores/trainerSelection'
import { storeToRefs } from 'pinia'
import { listTrainerReceivedRequests } from '../services/trainerRequestsService'
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
  const { customerSignedInName, customerPhotoUrl, customerIsAdmin, trainerSignedInName, trainerSignedInId } =
    storeToRefs(useAccountSession())
  // OAuth client IDs are public in browser apps; restrict this one to the app origin in Google Cloud.
  const googleClientId = '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com'

  const { theme } = useTheme()

  const trainerRequestToken = (() => {
    const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
    try {
      if (token) sessionStorage.setItem('fitpeso:trainer-request-token:v1', token)
      return (
        token ||
        (router.currentRoute.value.path === '/proposta'
          ? (sessionStorage.getItem('fitpeso:trainer-request-token:v1') ?? '')
          : '')
      )
    } catch {
      return token
    }
  })()
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

  const viewMode = ref<AppViewMode>(
    trainerRequestToken
      ? 'trainer-request'
      : router.currentRoute.value.path === '/profissionais'
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
  const NAV_ROLE = 'fitpeso:preferred-role:v1'

  const trainingDraft = useTrainingDraft()
  const { form } = trainingDraft
  const { trainingStartMinutes, trainingEndMinutes, selectedTrainerIds } =
    storeToRefs(trainingDraft)

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
    viewMode,
    isRootHome,
    form,
    showRequestForm,
    requestStep,
    selectingTrainersForDraft,
    selectedTrainerIds,
    homeSelectedTrainerIds,
    sharingRequestId,
    sharingRequestMessage,
    openRequestForm: () => openRequestForm(),
    sendRequestToSelectedTrainers: () => sendRequestToSelectedTrainers(),
    readNavigationPreference,
    saveNavigationPreference,
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
    selectHomeCity,
    detectRequestCity,
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
    adminTrainerActivityFilter,
    adminAcademies,
    availableAcademiesForTrainer,
    selectedAdminTrainerId,
    adminTrainerFormVisible,
    adminTrainersStatus,
    adminTrainersLoading,
    adminTrainerEditBusy,
    adminTrainerEditForm,
    filteredAdminTrainers,
    selectAdminTrainer,
    startNewAdminTrainer,
    cancelAdminTrainerEdit,
    openAdminTrainers,
    saveAdminTrainerEdit,
    deactivateAdminTrainer,
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
    viewMode,
    showRequestForm,
    requestStep,
    selectingTrainersForDraft,
    selectedTrainerIds,
    homeSelectedTrainerIds,
    sharingRequestId,
    sharingRequestMessage,
    customerSignedInName,
    form,
    trainingStartMinutes,
    trainingEndMinutes,
    status,
    refreshShareableRequests,
    home: homeController,
    openCustomerLogin: (fromRequest, method) => openCustomerLogin(fromRequest, method),
    onContactReset: () => {
      googleProfileStatus.value = ''
      trainingDraft.clearDraft()
    },
    otherGymName: storeToRefs(trainingDraft).otherGymName,
    onDraftStarted: () => {
      trainingDraft.hasDraft = true
    },
    onDraftSubmitted: () => trainingDraft.clearDraft(),
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
    resetContactDetails: () => {
      showRequestForm.value = false
      form.shareContactConsent = false
      googleProfileStatus.value = ''
    },
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
    googlePhotoUrl?: string
  }) {
    customerPhotoUrl.value = profile.googlePhotoUrl ?? ''
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
    customerPhotoUrl.value = ''
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
    const returnPath = safeReturnPath(router.currentRoute.value.query.redirect)
    if (returnPath && (customerSignedInName.value || trainerSignedInId.value)) {
      void router.replace(returnPath)
      return
    }
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
    void router.push('/')
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
    const returnPath = safeReturnPath(router.currentRoute.value.query.redirect)
    if (returnPath && !returnPath.startsWith('/solicitar-treinamento')) {
      requestLoginReturn.value = false
      await router.replace(returnPath)
      return
    }
    if (!requestLoginReturn.value) {
      goHome()
      return
    }
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
    customerPhotoUrl.value = ''
    try {
      sessionStorage.removeItem('fitpeso-customer-session')
      sessionStorage.removeItem('fitpeso-google-session')
    } catch {
      /* armazenamento indisponível */
    }
  }

  const { restoreSessions, sessionRestoring } = useSessionBootstrap({
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
      const requests = await listTrainerReceivedRequests(token)
      trainerReceivedRequests.value = requests
      trainerRequestsStatus.value = requests.length
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

  async function enterRoute(screen: AppScreen) {
    if (screen === 'contact') {
      if (!trainingDraft.hasDraft && !homeCity.value) {
        status.value = 'Escolha sua cidade na tela inicial para definir seu treinamento.'
        await router.replace('/')
        return
      }
      if (!trainingDraft.hasDraft) await openRequestForm()
      else {
        showRequestForm.value = true
        requestStep.value = 5
        publicTrainerCity.value = form.city
        if (form.city) void loadPublicTrainers()
      }
    } else if (screen === 'select-trainers') {
      if (!trainingDraft.hasDraft || !homeController.matchSupportedRequestCity(form.city)) {
        await router.replace('/solicitar-treinamento')
      } else {
        await selectTrainersForDraft()
      }
    } else if (screen === 'public-trainers') {
      selectingTrainersForDraft.value = false
      publicTrainerCity.value = homeCity.value
      if (publicTrainerCity.value) void loadPublicTrainers()
    } else if (screen === 'customer-requests') {
      await openCustomerRequests()
    } else if (screen === 'trainer-requests') {
      await openTrainerReceivedRequests()
    } else if (screen === 'my-profile') {
      await openMyProfile()
    } else if (screen === 'admin-trainers') {
      await openAdminTrainers()
      if (router.currentRoute.value.path.endsWith('/novo')) startNewAdminTrainer()
    }
  }

  const { navigationPending } = useApplicationNavigation({
    viewMode,
    showCustomerLogin,
    showCustomerSignup,
    showTrainerSignup,
    showRequestForm,
    requestLoginReturn,
    loginAsTrainer,
    sessionRestoring,
    customerSignedInName,
    trainerSignedInId,
    customerIsAdmin,
    onEnter: enterRoute,
  })
  function navigateTo(path: string) {
    const redirect = safeReturnPath(router.currentRoute.value.query.redirect)
    const authentication = path === '/entrar' || path.startsWith('/cadastro/')
    void router.push({ path, query: authentication && redirect ? { redirect } : undefined })
  }

  watch(
    () => router.currentRoute.value.path,
    (path) =>
      updatePageSeo(
        path === '/' || path.startsWith('/personal/') || path.startsWith('/p/')
          ? 'home'
          : path === '/profissionais'
            ? 'directory'
            : 'private',
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
    if (trainerRequestToken) {
      const query = { ...router.currentRoute.value.query }
      delete query.token
      void router.replace({ path: '/proposta', query })
    }
    void loadTrainerRequest()
    if (isRootHome.value && !homeCityManuallySelected.value) void detectRequestCity('home')
    void restoreSessions()
    startAuthentication()
  })

  return {
    setGoogleButtonContainer,
    navigationPending,
    navigateTo,
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
    customerPhotoUrl,
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
    adminTrainerActivityFilter,
    adminAcademies,
    availableAcademiesForTrainer,
    selectedAdminTrainerId,
    adminTrainerFormVisible,
    adminTrainersStatus,
    adminTrainersLoading,
    adminTrainerEditBusy,
    adminTrainerEditForm,
    filteredAdminTrainers,
    selectAdminTrainer,
    startNewAdminTrainer,
    cancelAdminTrainerEdit,
    saveAdminTrainerEdit,
    deactivateAdminTrainer,
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
