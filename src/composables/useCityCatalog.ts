import { ref } from 'vue'
import { listCities, type City } from '../services/citiesService'

function cityList(scope: 'public' | 'registration') {
  const cities = ref<City[]>([])
  const loading = ref(false)
  const error = ref('')
  let loadedAt = 0
  let pending: Promise<void> | undefined

  function load(refresh = false) {
    if (pending) return pending
    if (!refresh && Date.now() - loadedAt < 60_000) return Promise.resolve()
    loading.value = true
    error.value = ''
    pending = listCities(scope)
      .then((result) => {
        cities.value = result
        loadedAt = Date.now()
      })
      .catch((cause: unknown) => {
        loadedAt = 0
        error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as cidades.'
      })
      .finally(() => {
        loading.value = false
        pending = undefined
      })
    return pending
  }

  return { cities, loading, error, load }
}

export function useCityCatalog() {
  return { public: cityList('public'), registration: cityList('registration') }
}
