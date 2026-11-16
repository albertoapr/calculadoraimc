import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import { getCachedEligibleTrainers, listEligibleTrainers } from '../services/profissionaisService'
import { listAcademies, type Academy } from '../services/academiesService'
import { useTrainerDirectory } from './useTrainerDirectory'
import { useSupportedCity } from './useSupportedCity'
import type { CustomerRequest, EligibleTrainer } from '../types/domain'
import type { AppViewMode } from '../types/navigation'
import type { useTrainingDraft } from '../stores/trainingDraft'

export function useHome(options: {
  viewMode: Ref<AppViewMode>
  isRootHome: ComputedRef<boolean>
  form: ReturnType<typeof useTrainingDraft>['form']
  showRequestForm: Ref<boolean>
  requestStep: Ref<number>
  selectingTrainersForDraft: Ref<boolean>
  selectedTrainerIds: Ref<string[]>
  homeSelectedTrainerIds: Ref<string[]>
  sharingRequestId: Ref<string>
  sharingRequestMessage: Ref<string>
  openRequestForm: () => Promise<void>
  sendRequestToSelectedTrainers: () => unknown
  readNavigationPreference: (key: string) => string
  saveNavigationPreference: (key: string, value: string) => void
}) {
  const {
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
    openRequestForm,
    sendRequestToSelectedTrainers,
    readNavigationPreference,
    saveNavigationPreference,
  } = options
  const NAV_CITY = 'fitpeso:preferred-city:v1'
  const publicTrainers = ref<EligibleTrainer[]>([])
  const publicTrainerCity = ref('')
  const publicTrainerAcademy = ref('')
  // A escolha da academia na home dura apenas a sessão atual do navegador.
  const HOME_ACADEMY_SESSION = 'fitpeso:home-academy-session:v1'
  const HOME_ACADEMY_CITY_SESSION = 'fitpeso:home-academy-city-session:v1'
  const homeAcademySelected = computed(() =>
    Boolean(
      publicTrainerAcademy.value &&
      publicTrainerAcademies.value.includes(publicTrainerAcademy.value),
    ),
  )
  function restoreHomeAcademy(city: string, academies: string[]) {
    if (!city || !academies.length || publicTrainerAcademy.value) return
    try {
      if (sessionStorage.getItem(HOME_ACADEMY_CITY_SESSION) !== city) return
      const saved = sessionStorage.getItem(HOME_ACADEMY_SESSION) ?? ''
      if (saved && academies.includes(saved)) publicTrainerAcademy.value = saved
    } catch {
      /* navegação privada */
    }
  }

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

  async function startTrainingRequestFromHome() {
    // A home usa os mesmos filtros e a mesma seleção de profissionais da listagem.
    const chosenTrainers = [...homeSelectedTrainerIds.value]
    await openRequestForm()
    selectedTrainerIds.value = chosenTrainers
    homeSelectedTrainerIds.value = chosenTrainers
    // Em "Todas as academias", o local é definido pelo cliente na solicitação.
    form.gymName = publicTrainerAcademy.value
    form.attendsGym = Boolean(publicTrainerAcademy.value)
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
  const registeredAcademies = ref<Academy[]>([])
  let academyLookupId = 0
  async function loadCityAcademies(city: string) {
    const id = ++academyLookupId
    if (!city) {
      registeredAcademies.value = []
      return
    }
    try {
      const result = await listAcademies(city)
      if (id === academyLookupId) registeredAcademies.value = result
    } catch {
      // Instalações antigas continuam apresentando as academias cadastradas pelos personais.
      if (id === academyLookupId) registeredAcademies.value = []
    }
  }
  watch(
    publicTrainerCity,
    (city) => {
      registeredAcademies.value = []
      void loadCityAcademies(city)
    },
    { immediate: true },
  )
  watch(viewMode, (mode) => {
    if (
      (mode === 'home' || mode === 'public-trainers' || mode === 'select-trainers') &&
      publicTrainerCity.value
    )
      void loadCityAcademies(publicTrainerCity.value)
  })
  const { academies: legacyTrainerAcademies, filtered: publicFilteredTrainers } =
    useTrainerDirectory({
      trainers: publicTrainers,
      registeredAcademies,
      academy: publicTrainerAcademy,
      city: publicTrainerCity,
      requestCity: computed(() => form.city),
      requestGender: computed(() => form.trainerGenderPreference),
      selectingForRequest: computed(() => viewMode.value === 'select-trainers'),
    })
  const publicTrainerAcademies = computed(() => {
    const canonical = registeredAcademies.value.map((item) => `${item.name} — ${item.neighborhood}`)
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[–—]/g, '-')
        .replace(/\s*-\s*/g, ' - ')
        .trim()
        .toLocaleLowerCase('pt-BR')
    const unregistered = legacyTrainerAcademies.value.filter(
      (name) =>
        !registeredAcademies.value.some(
          (item) =>
            normalize(name) === normalize(item.name) ||
            normalize(name) === normalize(`${item.name} — ${item.neighborhood}`),
        ),
    )
    return [...new Set([...canonical, ...unregistered])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  })
  // Sem seleção, a lista pode carregar opções para o combo, mas não exibe resultados.
  watch(
    [publicTrainerAcademies, publicTrainerCity],
    ([academies, city], previousValues) => {
      const previousCity = previousValues?.[1]
      if (
        city !== previousCity ||
        (publicTrainerAcademy.value &&
          academies.length &&
          !academies.includes(publicTrainerAcademy.value))
      ) {
        publicTrainerAcademy.value = ''
      }
      if (viewMode.value === 'home' && isRootHome.value) restoreHomeAcademy(city, academies)
    },
    { immediate: true },
  )
  watch(publicTrainerAcademy, (academy, previousAcademy) => {
    if (viewMode.value === 'home' && isRootHome.value && academy) {
      try {
        sessionStorage.setItem(HOME_ACADEMY_SESSION, academy)
        sessionStorage.setItem(HOME_ACADEMY_CITY_SESSION, publicTrainerCity.value)
      } catch {
        /* navegação privada */
      }
    }
    if (viewMode.value === 'home' && academy !== previousAcademy) {
      homeSelectedTrainerIds.value = []
    }
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
    publicTrainerCity.value = homeCity.value
    publicTrainerAcademy.value = ''
    viewMode.value = 'public-trainers'
    if (publicTrainerCity.value) void loadPublicTrainers()
    void nextTick(() => window.scrollTo(0, 0))
  }
  const {
    supportedRequestCities,
    homeCity,
    homeCityManuallySelected,
    matchSupportedRequestCity,
    selectHomeCity,
    detectRequestCity,
    cancelRequestCityDetection,
  } = useSupportedCity({
    viewMode,
    isRootHome,
    publicTrainerCity,
    sharingRequestMessage,
    selectedTrainerIds: homeSelectedTrainerIds,
    showRequestForm,
    requestStep,
    form,
    readPreference: readNavigationPreference,
    savePreference: saveNavigationPreference,
    cityPreferenceKey: NAV_CITY,
    loadPublicTrainers,
    searchHomeTrainers,
  })

  return {
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
  }
}
