import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { academyPath, academySlug, parseAcademyPath } from '../router/academyRoutes'
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
  const router = useRouter()
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
  const academyRouteLoading = ref(false)
  const academyRouteError = ref('')
  let academyRouteLookupId = 0
  const loadedTrainersCity = ref('')
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
  const loadedAcademiesCity = ref('')
  let academyLookupId = 0
  let activeAcademyLoadCity = ''
  let activeAcademyLoad: Promise<void> | null = null

  async function loadCityAcademies(city: string): Promise<void> {
    if (city && activeAcademyLoadCity === city && activeAcademyLoad) {
      return activeAcademyLoad
    }
    const id = ++academyLookupId
    if (!city) {
      registeredAcademies.value = []
      loadedAcademiesCity.value = ''
      return
    }
    const pending = (async () => {
      try {
        const result = await listAcademies(city)
        if (id === academyLookupId) registeredAcademies.value = result
      } catch {
        // Instalações antigas continuam apresentando as academias cadastradas pelos personais.
        if (id === academyLookupId) registeredAcademies.value = []
      } finally {
        if (id === academyLookupId) loadedAcademiesCity.value = city
      }
    })()
    activeAcademyLoadCity = city
    activeAcademyLoad = pending
    try {
      await pending
    } finally {
      if (activeAcademyLoad === pending) {
        activeAcademyLoad = null
        activeAcademyLoadCity = ''
      }
    }
  }
  watch(
    publicTrainerCity,
    (city) => {
      registeredAcademies.value = []
      loadedAcademiesCity.value = ''
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
  // O cadastro da academia é a fonte principal para nome e bairro no título público.
  // Para academias legadas, admite o formato "Nome — Bairro".
  const publicTrainerAcademyDetails = computed(() => {
    const selected = publicTrainerAcademy.value.trim()
    if (!selected) return { name: '', neighborhood: '' }
    const registered = registeredAcademies.value.find(
      (item) => `${item.name} — ${item.neighborhood}` === selected,
    )
    if (registered) return { name: registered.name, neighborhood: registered.neighborhood }
    const [name, ...neighborhood] = selected.split(/\s+[—–-]\s+/)
    return { name: name || selected, neighborhood: neighborhood.join(' - ') }
  })

  function academyParts(choice: string) {
    const registered = registeredAcademies.value.find(
      (item) => `${item.name} — ${item.neighborhood}` === choice,
    )
    if (registered) return { name: registered.name, neighborhood: registered.neighborhood }
    const [name, ...neighborhood] = choice.split(/\s+[—–-]\s+/)
    return { name: name ?? choice, neighborhood: neighborhood.join(' - ') }
  }

  function pathForAcademyChoice(city: string, choice: string) {
    const { name, neighborhood } = academyParts(choice)
    return academyPath(city, name, neighborhood)
  }

  function changePublicAcademy(choice: string) {
    if (!publicTrainerAcademies.value.includes(choice) || !publicTrainerCity.value) return
    const path = pathForAcademyChoice(publicTrainerCity.value, choice)
    if (router.currentRoute.value.path !== path) void router.push(path)
  }

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
    if (
      (viewMode.value === 'home' || viewMode.value === 'public-trainers') &&
      academy !== previousAcademy
    ) {
      homeSelectedTrainerIds.value = []
    }
  })
  // Na consulta pública, uma academia deve estar selecionada para exibir sua lista.
  // O carregamento por cidade impede que uma opção de outra cidade seja escolhida.
  watch(
    [
      publicTrainerAcademies,
      publicTrainerCity,
      viewMode,
      loadedTrainersCity,
      loadedAcademiesCity,
      academyRouteLoading,
    ],
    ([academies, city, mode, loadedCity, academiesCity, resolving]) => {
      if (
        mode !== 'public-trainers' ||
        !city ||
        loadedCity !== city ||
        academiesCity !== city ||
        resolving ||
        parseAcademyPath(router.currentRoute.value.path) ||
        !academies.length
      )
        return
      if (!publicTrainerAcademy.value || !academies.includes(publicTrainerAcademy.value)) {
        publicTrainerAcademy.value = academies[0] ?? ''
      }
      if (router.currentRoute.value.path === '/profissionais' && publicTrainerAcademy.value) {
        void router.replace(pathForAcademyChoice(city, publicTrainerAcademy.value))
      }
    },
    { immediate: true },
  )

  // Alterar a cidade no cabeçalho abandona a rota da unidade anterior.
  watch(publicTrainerCity, (city, previousCity) => {
    if (
      previousCity &&
      city !== previousCity &&
      viewMode.value === 'public-trainers' &&
      !academyRouteLoading.value &&
      parseAcademyPath(router.currentRoute.value.path)
    ) {
      void router.replace('/profissionais')
    }
  })

  async function enterPublicTrainersRoute(path: string) {
    const id = ++academyRouteLookupId
    selectingTrainersForDraft.value = false
    academyRouteError.value = ''
    const route = parseAcademyPath(path)
    if (!route) {
      academyRouteLoading.value = false
      publicTrainerCity.value = homeCity.value || publicTrainerCity.value
      if (publicTrainerCity.value) {
        void loadPublicTrainers()
        void loadCityAcademies(publicTrainerCity.value)
      }
      return
    }

    academyRouteLoading.value = true
    const city = supportedRequestCities.find((item) => academySlug(item) === route.city)
    publicTrainerAcademy.value = ''
    if (!city) {
      publicTrainerCity.value = ''
      academyRouteError.value = 'Esta cidade não é atendida pelo FitPeso.'
      academyRouteLoading.value = false
      return
    }

    publicTrainerCity.value = city
    await Promise.all([loadCityAcademies(city), loadPublicTrainers()])
    if (id !== academyRouteLookupId || router.currentRoute.value.path !== path) return
    // A escolha manual de cidade tem prioridade sobre um link ainda carregando.
    if (publicTrainerCity.value !== city) {
      academyRouteLoading.value = false
      void router.replace('/profissionais')
      return
    }

    const choice = publicTrainerAcademies.value.find((item) => {
      const parts = academyParts(item)
      return (
        academySlug(parts.name.replace(/^academia\s+/i, '')) === route.name &&
        academySlug(parts.neighborhood) === route.neighborhood
      )
    })

    if (!choice) {
      academyRouteError.value = 'Academia não encontrada nesta cidade e bairro. Selecione outra academia.'
      academyRouteLoading.value = false
      return
    }
    publicTrainerAcademy.value = choice
    academyRouteLoading.value = false
    const canonical = pathForAcademyChoice(city, choice)
    if (canonical !== path) void router.replace(canonical)
  }

  function retryPublicTrainers() {
    void enterPublicTrainersRoute(router.currentRoute.value.path)
  }

  async function loadPublicTrainers() {
    const id = ++publicLookupId
    const city = publicTrainerCity.value
    const gender =
      viewMode.value === 'select-trainers' ? form.trainerGenderPreference : 'indiferente'
    const cached = getCachedEligibleTrainers(city, gender)
    publicTrainersError.value = ''
    if (!city) {
      publicTrainers.value = []
      loadedTrainersCity.value = ''
      publicTrainersLoading.value = false
      return
    }
    // Dados em cache aparecem imediatamente; não esvaziar a listagem em toda navegação.
    if (cached) {
      publicTrainers.value = cached
      loadedTrainersCity.value = city
      publicTrainersLoading.value = false
      return
    }
    publicTrainersLoading.value = true
    try {
      const trainers = await listEligibleTrainers(city, gender)
      if (id === publicLookupId) {
        publicTrainers.value = trainers
        loadedTrainersCity.value = city
      }
    } catch {
      if (id === publicLookupId) {
        publicTrainersError.value = 'Não foi possível consultar os profissionais.'
        loadedTrainersCity.value = ''
      }
    } finally {
      if (id === publicLookupId) publicTrainersLoading.value = false
    }
  }
  function openPublicTrainers() {
    selectingTrainersForDraft.value = false
    const path =
      homeAcademySelected.value && homeCity.value
        ? pathForAcademyChoice(homeCity.value, publicTrainerAcademy.value)
        : '/profissionais'
    void router.push(path)
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
    publicTrainerAcademyDetails,
    academyRouteLoading,
    academyRouteError,
    changePublicAcademy,
    enterPublicTrainersRoute,
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
    matchSupportedRequestCity,
    selectHomeCity,
    detectRequestCity,
    cancelRequestCityDetection,
  }
}
