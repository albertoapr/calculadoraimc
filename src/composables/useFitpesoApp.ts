import { listAcademies, type Academy } from '../services/academiesService'
import { useCustomerSignup } from './useCustomerSignup'
import { useTrainerSignup } from './useTrainerSignup'
import { isValidBirthDate } from '../utils/validation'
import { useAuthentication } from './useAuthentication'
import { loadCustomerProfile, loadTrainerSession, switchProfileSession } from '../services/authenticationService'
import { ApiError } from '../services/http/apiClient'
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
import { parseAcademyPath } from '../router/academyRoutes'
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
  IdentityRole,
} from '../types/domain'

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

/** Coordinates screen flows. Domain controllers can be extracted independently from this boundary. */
export function useFitpesoApp() {
  const router = useRouter()
  const { customerSignedInName, customerPhotoUrl, customerIsAdmin, trainerSignedInName, trainerSignedInId,
    pessoaId, availableProfiles, identityStatus, activeRole } = storeToRefs(useAccountSession())
  // OAuth client IDs are public in browser apps; restrict this one to the app origin in Google Cloud.
  const googleClientId = '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com'
  const profileChooserOpen = ref(false)
  const profileChoiceRequired = ref(false)
  const profileSwitchBusy = ref(false)
  const profileSwitchError = ref('')
  // ADMIN e uma permissao distinta, mas utiliza o mesmo cadastro legado de CLIENTE.
  const selectableProfiles = computed(() => availableProfiles.value.filter(profile => {
    if (profile.tipo === 'CLIENTE') return Boolean(profile.clienteId)
    if (profile.tipo === 'PERSONAL') return Boolean(profile.personalId)
    return availableProfiles.value.some(user => user.tipo === 'CLIENTE' && user.clienteId)
  }))

  function requireProfileSelection() {
    profileSwitchError.value = ''
    profileChoiceRequired.value = selectableProfiles.value.length > 1
    profileChooserOpen.value = profileChoiceRequired.value
  }

  function openProfileChooser() {
    if (selectableProfiles.value.length < 2) return
    profileSwitchError.value = ''
    profileChoiceRequired.value = false
    profileChooserOpen.value = true
  }

  function closeProfileChooser() {
    if (profileSwitchBusy.value || profileChoiceRequired.value) return
    profileChooserOpen.value = false
  }

  async function selectIdentityProfile(role: IdentityRole) {
    if (profileSwitchBusy.value) return
    if (!selectableProfiles.value.some(profile => profile.tipo === role)) {
      profileSwitchError.value = 'Esse perfil não está disponível para sua conta.'
      return
    }
    profileSwitchBusy.value = true
    profileSwitchError.value = ''
    try {
      const alreadyActive =
        (role === 'CLIENTE' && Boolean(customerSignedInName.value)) ||
        (role === 'PERSONAL' && Boolean(trainerSignedInId.value))
      if (!alreadyActive) {
        const currentToken = trainerSignedInId.value
          ? (sessionStorage.getItem('fitpeso-trainer-session') ?? '')
          : (sessionStorage.getItem('fitpeso-customer-session') ??
            sessionStorage.getItem('fitpeso-google-session') ?? '')
        if (!currentToken) throw new Error('Sua sessão expirou. Entre novamente.')
        const issuedToken = await switchProfileSession(currentToken, role)
        // Carrega e valida o perfil novo antes de trocar a sessao local.
        if (role === 'PERSONAL') {
          const profile = await loadTrainerSession(issuedToken)
          sessionStorage.setItem('fitpeso-trainer-session', issuedToken)
          applyTrainerSession(profile)
        } else {
          const profile = await loadCustomerProfile(issuedToken)
          sessionStorage.setItem('fitpeso-customer-session', issuedToken)
          applyCustomerProfile(profile)
          if (role === 'ADMIN' && !customerIsAdmin.value) throw new Error('Perfil de administrador indisponível.')
        }
      }
      activeRole.value = role
      try { sessionStorage.setItem('fitpeso-active-profile-role', role) } catch { /* sessao em memoria */ }
      profileChooserOpen.value = false
      profileChoiceRequired.value = false
      goHome()
    } catch (error) {
      profileSwitchError.value = error instanceof Error ? error.message : 'Não foi possível alterar o perfil.'
    } finally {
      profileSwitchBusy.value = false
    }
  }

  // Administracao depende do perfil selecionado, nao somente da permissao legada.
  // Contas antigas ainda nao migradas preservam a autorizacao administrativa.
  const actingAsAdmin = computed(() => customerIsAdmin.value &&
    (activeRole.value === 'ADMIN' || !selectableProfiles.value.some(profile => profile.tipo === 'ADMIN')))

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
  const { trainerIdFromPath, trainerSlugFromPath, personalBrandFirstName, publicTrainer, publicTrainerBanner, trainerProfileFailed } =
    usePublicTrainerProfile(router)
  const isRootHome = computed(() => router.currentRoute.value.path === '/')

  const viewMode = ref<AppViewMode>(
    trainerRequestToken
      ? 'trainer-request'
      : router.currentRoute.value.path === '/profissionais' ||
          parseAcademyPath(router.currentRoute.value.path)
        ? 'public-trainers'
        : 'home',
  )
  const showRequestForm = ref(false)
  const requestSent = ref(false)
  const requestStep = ref(1)
  const selectingTrainersForDraft = ref(false)
  const registeredAcademies = ref<Academy[]>([])
  const academiesLoading = ref(false)
  const academiesError = ref('')
  async function refreshRegisteredAcademies() {
    academiesLoading.value = true
    academiesError.value = ''
    try {
      registeredAcademies.value = (await listAcademies()).filter(academy => academy.active)
    } catch (error) {
      registeredAcademies.value = []
      academiesError.value = error instanceof Error ? error.message : 'Não foi possível consultar as academias cadastradas.'
    } finally {
      academiesLoading.value = false
    }
  }
  const academyOptions = computed(() => registeredAcademies.value
    .filter(academy => trainerForm.cities.includes(academy.city))
    .map(academy => `${academy.name} — ${academy.neighborhood}`)
    .sort((a, b) => a.localeCompare(b, 'pt-BR')))
  const profileAcademyOptions = computed(() => registeredAcademies.value
    .filter(academy => editingProfile.cities.includes(academy.city))
    .map(academy => ({
      id: academy.academyId,
      label: `${academy.name} — ${academy.neighborhood}`,
      city: academy.city,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')))
  function addProfileAcademy(academyId: string) {
    const academy = profileAcademyOptions.value.find(item => item.id === academyId)
    if (!academy || editingProfile.academyIds.includes(academyId) ||
        editingProfile.academias.length >= 5) return
    if (!editingProfile.academias.includes(academy.label)) editingProfile.academias.push(academy.label)
    editingProfile.academyIds.push(academyId)
    profileAcademyChoice.value = ''
  }
  function removeProfileAcademy(index: number) {
    const name = editingProfile.academias[index]
    const registered = registeredAcademies.value.find(academy =>
      `${academy.name} — ${academy.neighborhood}` === name &&
      editingProfile.academyIds.includes(academy.academyId))
    if (registered) editingProfile.academyIds.splice(editingProfile.academyIds.indexOf(registered.academyId), 1)
    editingProfile.academias.splice(index, 1)
  }
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
    publicTrainerAcademyDetails,
    academyRouteLoading,
    academyRouteError,
    changePublicAcademy,
    retryPublicTrainers,
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
    finishWhatsAppLoginFromLink,
    stopEmailLoginPoll,
    startAuthentication,
  } = useAuthentication({
    initialRole: readNavigationPreference(NAV_ROLE),
    showCustomerSignup,
    showTrainerSignup,
    saveRole: (role) => saveNavigationPreference(NAV_ROLE, role),
    applyCustomerProfile: (profile) => {
      applyCustomerProfile(profile)
      requireProfileSelection()
    },
    applyTrainerSession: (profile) => {
      applyTrainerSession(profile)
      requireProfileSelection()
    },
    renderGoogleButton,
    beginCustomerSignup: (contact) => openCustomerSignupFromLogin(contact),
    goHome,
    returnToRequestFormAfterLogin,
    replaceUrl: (url) => router.replace(url),
  })

  const {
    customerForm,
    signupContact,
    signupGooglePhotoUrl,
    signupGoogleCredential,
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
    onGoogleAuthenticated: async (credential) => {
      // O índice CustomerByEmail é eventualmente consistente após o primeiro cadastro.
      // Repetir apenas o 404 evita mostrar erro apesar do cadastro ter sido salvo.
      let profile: Awaited<ReturnType<typeof loadCustomerProfile>> | undefined
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          profile = await loadCustomerProfile(credential)
          break
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404 || attempt === 4) throw error
          await new Promise<void>(resolve => window.setTimeout(resolve, 400))
        }
      }
      if (!profile) throw new Error('Não foi possível carregar o cadastro agora.')
      sessionStorage.setItem('fitpeso-google-session', credential)
      applyCustomerProfile(profile)
      requireProfileSelection()
    },
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
    linkedAccount,
    trainerStatus,
    betaTrainerSignupToken,
    betaAcademyHint,
    startBetaTrainerSignupFromLink,
    trainerVerificationLink,
    trainerSubmitting,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    stopTrainerRegistration,
  } = useTrainerSignup({
    linkedAccount: () => customerSignedInName.value ? {
      name: customerForm.name || customerSignedInName.value,
      email: customerForm.email,
      sex: customerForm.sex,
      whatsapp: customerForm.whatsapp,
      dateOfBirth: customerForm.dateOfBirth,
      googleCredential: sessionStorage.getItem('fitpeso-google-session') ?? '',
      photoUrl: customerPhotoUrl.value,
    } : null,
    onClose: goHome,
    active: showTrainerSignup,
    replaceUrl: (url) => router.replace(url),
    onAuthenticated: async (token) => {
      const profile = await loadTrainerSession(token)
      sessionStorage.setItem('fitpeso-trainer-session', token)
      applyTrainerSession(profile)
      requireProfileSelection()
      goHome()
    },
  })
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
    isAdmin: actingAsAdmin,
    getToken: () =>
      sessionStorage.getItem('fitpeso-customer-session') ??
      sessionStorage.getItem('fitpeso-google-session') ??
      '',
    onOpen: () => {
      viewMode.value = 'admin-trainers'
    },
  })

  function openAdminCustomers() {
    if (!actingAsAdmin.value) return
    viewMode.value = 'admin-customers'
    void nextTick(() => window.scrollTo(0, 0))
  }

  function openAdminAcademies() {
    if (!actingAsAdmin.value) return
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

  watch([showTrainerSignup, viewMode], ([signup, screen]) => {
    if (signup || screen === 'my-profile') void refreshRegisteredAcademies()
  }, { immediate: true })
  watch(() => [...trainerForm.cities], () => { signupAcademyChoice.value = '' })
  watch(() => editingProfile.city, () => { profileAcademyChoice.value = '' })


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
    identity?: { pessoaId: string; usuarios: import('../types/domain').IdentityProfile[] }
    identityStatus?: 'ready' | 'pending'
  }) {
    pessoaId.value = profile.identity?.pessoaId ?? ''
    availableProfiles.value = profile.identity?.usuarios ?? []
    identityStatus.value = profile.identityStatus ?? ''
    activeRole.value = profile.isAdmin && profile.identity?.usuarios.some(user => user.tipo === 'ADMIN') &&
      sessionStorage.getItem('fitpeso-active-profile-role') === 'ADMIN' ? 'ADMIN' : 'CLIENTE'
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
      customerLoginError.value = ''
      customerLoginStatus.value = 'Validando sua conta e buscando seu cadastro…'
      googleProfileStatus.value = ''
      try {
        const profile = await loadCustomerProfile(response.credential)
        sessionStorage.setItem('fitpeso-google-session', response.credential)
        applyCustomerProfile(profile)
        requireProfileSelection()
        customerLoginStatus.value = `Conectado como ${profile.email}. Seus dados foram preenchidos.`
        googleProfileStatus.value =
          'Cadastro carregado. Confira a disponibilidade e os dados antes de enviar.'
        showCustomerLogin.value = false
        await returnToRequestFormAfterLogin()
      } catch (error) {
        try {
          sessionStorage.removeItem('fitpeso-google-session')
        } catch {
          /* Storage pode estar desativado. */
        }
        if (error instanceof ApiError && error.status === 404) {
          // Google já validou a identidade; um cadastro novo ainda exige dados
          // complementares e confirmação do WhatsApp.
          try {
            const part = response.credential.split('.')[1]
            if (part) {
              const bytes = Uint8Array.from(
                atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')),
                (char) => char.charCodeAt(0),
              )
              const claims = JSON.parse(new TextDecoder().decode(bytes)) as { email?: string; name?: string; picture?: string }
              if (typeof claims.name === 'string') customerForm.name = claims.name.trim()
              if (typeof claims.email === 'string' && claims.email.trim()) {
                const email = claims.email.trim().toLowerCase()
                customerForm.whatsapp = ''
                openCustomerSignupFromLogin(email)
                signupGoogleCredential.value = response.credential
                signupGooglePhotoUrl.value = (() => {
                  try {
                    const url = new URL(claims.picture ?? '')
                    return url.protocol === 'https:' &&
                      (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) &&
                      !url.username && !url.password ? url.href : ''
                  } catch { return '' }
                })()
                customerStatus.value =
                  'Conta Google confirmada. Complete seu cadastro. O WhatsApp será solicitado ao enviar um pedido de treinamento.'
                await nextTick()
                document.getElementById('customer-name')?.focus()
                return
              }
            }
          } catch {
            // Não confiar em dados malformados no preenchimento do formulário.
          }
          customerLoginError.value =
            'Não foi possível ler os dados do Google. Tente novamente ou informe seu e-mail.'
          customerLoginStatus.value = ''
          return
        }
        customerLoginError.value =
          error instanceof Error ? error.message : 'Não foi possível entrar com o Google.'
        customerLoginStatus.value = ''
        googleProfileStatus.value = customerLoginError.value
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

  watch(loginAsTrainer, async (trainer) => {
    if (trainer || !showCustomerLogin.value || loginStep.value !== 1) return
    await nextTick()
    await renderGoogleButton('client')
  })

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
    pessoaId.value = ''
    availableProfiles.value = []
    activeRole.value = ''
    profileChooserOpen.value = false
    profileChoiceRequired.value = false
    profileSwitchError.value = ''
    try { sessionStorage.removeItem('fitpeso-active-profile-role') } catch { /* sem storage */ }
    identityStatus.value = ''
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
    signupGooglePhotoUrl.value = ''
    signupGoogleCredential.value = ''
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
    // O perfil nao e escolhido antes do login; a API devolve os perfis habilitados.
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
    if (fromRequest) {
      // A origem da autenticação precisa estar também na URL. Caso contrário,
      // uma sincronização do roteador pode perder o retorno e abrir a home.
      await router.push({
        path: '/entrar',
        query: { redirect: '/solicitar-treinamento' },
      })
      showRequestForm.value = false
    }
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
    if (!requestLoginReturn.value && !returnPath.startsWith('/solicitar-treinamento')) {
      goHome()
      return
    }
    // Primeiro retorna à rota do rascunho, sem descartá-lo nem voltar à home.
    viewMode.value = 'contact'
    showRequestForm.value = true
    requestStep.value = 5
    await router.replace('/solicitar-treinamento')
    showCustomerLogin.value = false
    requestLoginReturn.value = false
    await nextTick()
    window.scrollTo(0, 0)
  }

  function openSentRequests() {
    requestSent.value = false
    return openCustomerRequests()
  }

  function applyTrainerSession(profile: TrainerAccountProfile) {
    pessoaId.value = profile.identity?.pessoaId ?? ''
    availableProfiles.value = profile.identity?.usuarios ?? []
    identityStatus.value = profile.identityStatus ?? ''
    activeRole.value = 'PERSONAL'
    trainerSignedInId.value = profile.trainerId
    trainerSignedInName.value = profile.name
    customerSignedInName.value = ''
    customerPhotoUrl.value = profile.googlePhotoUrl ?? ''
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

  function openCustomerSignupFromLogin(contact = loginIdentifier.value) {
    clearPendingWhatsAppLogin()
    const identifier = contact.trim()
    signupContact.value = identifier
    // O contato já foi validado na tela unificada; apresentar somente os dados
    // complementares do novo cadastro e manter a confirmação do WhatsApp.
    signupStep.value = identifier ? 2 : 1
    if (identifier.includes('@')) {
      customerForm.email = identifier
    } else if (identifier) {
      customerForm.whatsapp = identifier
      customerForm.email = ''
    }
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
      await homeController.enterPublicTrainersRoute(router.currentRoute.value.path)
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
    customerIsAdmin: actingAsAdmin,
    onEnter: enterRoute,
  })
  function navigateTo(path: string) {
    const redirect = safeReturnPath(router.currentRoute.value.query.redirect)
    const authentication = path === '/entrar' || path.startsWith('/cadastro/')
    void router.push({ path, query: authentication && redirect ? { redirect } : undefined })
  }

  watch(
    [() => router.currentRoute.value.path, publicTrainerAcademyDetails, publicTrainerCity, academyRouteError],
    ([path, details, city, routeError]) => {
      const directory = path === '/profissionais' || Boolean(parseAcademyPath(path))
      updatePageSeo(
        path === '/' || path.startsWith('/personal/') || path.startsWith('/p/')
          ? 'home'
          : directory
            ? 'directory'
            : 'private',
        directory
          ? {
              path,
              academy: parseAcademyPath(path) && !routeError ? details.name : '',
              city,
              notFound: Boolean(routeError),
            }
          : {},
      )
    },
    { immediate: true },
  )

  onMounted(() => {
    if (viewMode.value === 'home' && isRootHome.value && homeCity.value) {
      publicTrainerCity.value = homeCity.value
      void loadPublicTrainers()
    }
    document.addEventListener('pointerdown', closeHamburgerOnOutsideClick)
    document.addEventListener('click', closeHamburgerOnSelection)
    // Restore existing state first; redeemed links must win over an older session.
    void (async () => {
      await restoreSessions()
      const opened = new URL(window.location.href)
      if (opened.searchParams.has('betaSignupCode')) {
        await startBetaTrainerSignupFromLink()
      } else if (opened.searchParams.has('whatsappLoginCode')) {
        await finishWhatsAppLoginFromLink()
      } else {
        await finishEmailLoginFromLink()
      }
    })()
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    if (trainerRequestToken) {
      const query = { ...router.currentRoute.value.query }
      delete query.token
      void router.replace({ path: '/proposta', query })
    }
    void loadTrainerRequest()
    if (isRootHome.value && !homeCityManuallySelected.value) void detectRequestCity('home')
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
    publicTrainerAcademyDetails,
    academyRouteLoading,
    academyRouteError,
    changePublicAcademy,
    retryPublicTrainers,
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
    customerIsAdmin: actingAsAdmin,
    activeRole,
    selectableProfiles,
    profileChooserOpen,
    profileChoiceRequired,
    profileSwitchBusy,
    profileSwitchError,
    openProfileChooser,
    closeProfileChooser,
    selectIdentityProfile,
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
    profileAcademyOptions,
    addProfileAcademy,
    removeProfileAcademy,
    academiesLoading,
    academiesError,
    refreshRegisteredAcademies,
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
    signupGooglePhotoUrl,
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
    customerLoginStatus,
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
    linkedAccount,
    betaTrainerSignupToken,
    betaAcademyHint,
    trainerStatus,
    trainerVerificationLink,
    trainerSubmitting,
    googleProfileStatus,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    openAdminTrainers,
    openAdminCustomers,
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
    publicTrainer,
    publicTrainerBanner,
    trainerProfileFailed,
  }
}
