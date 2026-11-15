import { computed, ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { getRequestApiEndpoint } from '../services/api'

function trainerIdFromPath(path: string) {
  const match = path.match(/^\/p\/([^/]+)\/?$/)
  if (!match) return ''
  try {
    const id = decodeURIComponent(match[1]).trim()
    return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : ''
  } catch {
    return ''
  }
}

function trainerSlugFromPath(path: string) {
  const match = path.match(/^\/personal\/([^/]+)\/?$/)
  if (!match) return ''
  try {
    const slug = decodeURIComponent(match[1]).trim().toLowerCase()
    return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? slug : ''
  } catch {
    return ''
  }
}

export function usePublicTrainerProfile(router: Router) {
  const trainerId = computed(() => trainerIdFromPath(router.currentRoute.value.path))
  const trainerSlug = computed(() => trainerSlugFromPath(router.currentRoute.value.path))
  const personalName = ref('FitPeso')
  const personalBrandFirstName = computed(() =>
    personalName.value.endsWith(' Personal Trainer')
      ? personalName.value.slice(0, -' Personal Trainer'.length)
      : '',
  )
  const trainerProfileFailed = ref(false)
  let lookupId = 0

  async function loadTrainerProfile() {
    const currentLookup = ++lookupId
    personalName.value = 'FitPeso'
    trainerProfileFailed.value = false
    if (!trainerId.value && !trainerSlug.value) return
    try {
      const endpoint = await getRequestApiEndpoint()
      const profilePath = trainerSlug.value
        ? `/api/trainers/by-slug/${encodeURIComponent(trainerSlug.value)}`
        : `/api/trainers/${encodeURIComponent(trainerId.value)}`
      const response = await fetch(`${endpoint}${profilePath}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Trainer profile unavailable')
      const body = (await response.json()) as { trainer?: { name?: unknown } }
      const name = typeof body.trainer?.name === 'string' ? body.trainer.name.trim() : ''
      if (!name) throw new Error('Invalid trainer profile')
      if (currentLookup !== lookupId) return
      personalName.value = `${name.split(/\s+/)[0]} Personal Trainer`
    } catch {
      if (currentLookup === lookupId) trainerProfileFailed.value = true
    }
  }

  watch([trainerId, trainerSlug], () => void loadTrainerProfile(), { immediate: true })

  return {
    trainerIdFromPath: trainerId,
    trainerSlugFromPath: trainerSlug,
    personalBrandFirstName,
    trainerProfileFailed,
  }
}
