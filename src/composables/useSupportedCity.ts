import { ref, watch, type ComputedRef, type Ref } from 'vue'

const supportedRequestCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro'] as const

export function useSupportedCity<T extends string>(options: {
  viewMode: Ref<T>
  isRootHome: ComputedRef<boolean>
  publicTrainerCity: Ref<string>
  sharingRequestMessage: Ref<string>
  selectedTrainerIds: Ref<string[]>
  showRequestForm: Ref<boolean>
  requestStep: Ref<number>
  form: { city: string }
  readPreference: (key: string) => string
  savePreference: (key: string, value: string) => void
  cityPreferenceKey: string
  loadPublicTrainers: () => Promise<void>
  searchHomeTrainers: () => void
}) {
  const detectingRequestCity = ref(false)
  const requestCityLocationMessage = ref('')
  const storedHomeCity = options.readPreference(options.cityPreferenceKey)
  const homeCity = ref('')
  const homeCityManuallySelected = ref(
    storedHomeCity !== '' && supportedRequestCities.some((city) => city === storedHomeCity),
  )
  if (homeCityManuallySelected.value) homeCity.value = storedHomeCity
  let requestCityLookupId = 0

  function matchSupportedRequestCity(value: string): string {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
    return (
      supportedRequestCities.find(
        (city) =>
          city
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase() === normalized,
      ) ?? ''
    )
  }

  function updateHomeCity(city: string) {
    if (homeCityManuallySelected.value || homeCity.value === city) return
    homeCity.value = city
    if (options.viewMode.value === 'public-trainers') {
      if (options.publicTrainerCity.value !== city) options.sharingRequestMessage.value = ''
      options.publicTrainerCity.value = city
      options.selectedTrainerIds.value = []
      void options.loadPublicTrainers()
    }
  }

  function selectHomeCity(event: Event) {
    const city = (event.target as HTMLSelectElement).value
    if (!supportedRequestCities.some((item) => item === city)) return
    homeCityManuallySelected.value = true
    homeCity.value = city
    options.savePreference(options.cityPreferenceKey, city)
  }

  watch(homeCity, (city) => {
    options.selectedTrainerIds.value = []
    if (city && options.viewMode.value === 'public-trainers') options.searchHomeTrainers()
    else if (city && options.viewMode.value === 'home' && options.isRootHome.value) {
      options.publicTrainerCity.value = city
      void options.loadPublicTrainers()
    }
  })

  function cancelRequestCityDetection() {
    requestCityLookupId += 1
    detectingRequestCity.value = false
  }

  function detectRequestCity(cityDetectionScope: 'request' | 'home' = 'request') {
    if (!navigator.geolocation) {
      requestCityLocationMessage.value = 'Selecione sua cidade na lista.'
      return
    }
    const lookupId = ++requestCityLookupId
    if (cityDetectionScope === 'request') {
      detectingRequestCity.value = true
      requestCityLocationMessage.value = 'Identificando sua cidade…'
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
            localityLanguage: 'pt',
          })
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
            { signal: AbortSignal.timeout(8000) },
          )
          if (!response.ok) throw new Error('Geocoding unavailable')
          const location = (await response.json()) as {
            city?: string
            locality?: string
            localityInfo?: { administrative?: Array<{ name?: string }> }
          }
          if (
            cityDetectionScope === 'request' &&
            (lookupId !== requestCityLookupId ||
              !options.showRequestForm.value ||
              options.requestStep.value > 3)
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
              if (!options.form.city) options.form.city = city
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
        if (cityDetectionScope === 'request') {
          detectingRequestCity.value = false
          requestCityLocationMessage.value =
            'Localização indisponível. Selecione sua cidade na lista.'
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return {
    supportedRequestCities,
    detectingRequestCity,
    requestCityLocationMessage,
    homeCity,
    homeCityManuallySelected,
    matchSupportedRequestCity,
    selectHomeCity,
    detectRequestCity,
    cancelRequestCityDetection,
  }
}
