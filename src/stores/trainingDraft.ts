import { reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Sex } from '../types/domain'

export function trainingDate(offset = 0): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const date = new Date(today + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}


/** Training preferences are restored within the same browser session; credentials and contacts are excluded. */
export const useTrainingDraft = defineStore('trainingDraft', () => {
  const form = reactive({
    weight: '70',
    height: '170',
    waist: '85',
    calculateBodyFat: false,
    bodyFatAge: '',
    shareContactConsent: false,
    sessionsPerWeek: '1',
    name: '',
    phone: '',
    email: '',
    objective: 'Emagrecimento',
    sex: 'feminino' as Sex,
    age: '',
    clientGender: 'nao_informar' as 'feminino' | 'masculino' | 'nao_informar',
    city: '',
    trainerGenderPreference: 'indiferente' as 'indiferente' | 'feminino' | 'masculino',
    desiredDuration: '1 mês',
    singleLesson: false,
    singleLessonCount: 1,
    preferredStartDate: trainingDate(3),
    withCompanion: false,
    attendsGym: false,
    gymName: '',

    trainingDays: ['Segunda-feira'] as string[],
    trainingShifts: ['Noite'] as string[],
  })

  const trainingStartMinutes = ref(1080)
  const trainingEndMinutes = ref(1260)

  const selectedTrainerIds = ref<string[]>([])
  const otherGymName = ref('')
  const hasDraft = ref(false)
  const storageKey = 'fitpeso:training-draft:v1'
  const preferenceKeys = [
    'sessionsPerWeek',
    'objective',
    'age',
    'clientGender',
    'city',
    'trainerGenderPreference',
    'desiredDuration',
    'singleLesson',
    'singleLessonCount',
    'preferredStartDate',
    'withCompanion',
    'attendsGym',
    'gymName',
    'trainingDays',
    'trainingShifts',
  ] as const

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (saved?.version === 1 && saved.form && typeof saved.form === 'object') {
      for (const key of preferenceKeys) {
        const value = saved.form[key]
        const current = form[key]
        const valid = Array.isArray(current)
          ? Array.isArray(value) &&
            value.length <= 20 &&
            value.every((item: unknown) => typeof item === 'string' && item.length <= 100)
          : typeof value === typeof current && (typeof value !== 'string' || value.length <= 200)
        if (valid) Object.assign(form, { [key]: value })
      }
      if (
        Number.isInteger(saved.start) &&
        Number.isInteger(saved.end) &&
        saved.start >= 0 &&
        saved.end <= 1440 &&
        saved.start < saved.end
      ) {
        trainingStartMinutes.value = saved.start
        trainingEndMinutes.value = saved.end
      }
      if (Array.isArray(saved.selectedTrainerIds)) {
        selectedTrainerIds.value = [
          ...new Set<string>(
            saved.selectedTrainerIds.filter(
              (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id),
            ),
          ),
        ].slice(0, 20)
      }
      if (typeof saved.otherGymName === 'string' && saved.otherGymName.length <= 200)
        otherGymName.value = saved.otherGymName
      hasDraft.value = true
    }
  } catch {
    /* Storage is optional. */
  }

  function clearDraft() {
    hasDraft.value = false
    selectedTrainerIds.value = []
    otherGymName.value = ''
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* private browsing */
    }
  }

  watch(
    [form, trainingStartMinutes, trainingEndMinutes, selectedTrainerIds, otherGymName, hasDraft],
    () => {
      try {
        if (!hasDraft.value) return
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            form: Object.fromEntries(preferenceKeys.map((key) => [key, form[key]])),
            start: trainingStartMinutes.value,
            end: trainingEndMinutes.value,
            selectedTrainerIds: selectedTrainerIds.value,
            otherGymName: otherGymName.value,
          }),
        )
      } catch {
        /* Draft remains available in memory. */
      }
    },
    { deep: true },
  )

  return {
    form,
    trainingStartMinutes,
    trainingEndMinutes,
    selectedTrainerIds,
    otherGymName,
    hasDraft,
    clearDraft,
  }
})
