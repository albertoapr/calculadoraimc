import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Sex } from '../types/domain'

/** Draft stays in memory and is shared across the request and assessment screens. */
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
    withCompanion: false,
    attendsGym: false,
    gymName: '',

    trainingDays: ['Segunda-feira'] as string[],
    trainingShifts: ['Noite'] as string[],
  })

  const trainingStartMinutes = ref(1080)
  const trainingEndMinutes = ref(1260)
  return { form, trainingStartMinutes, trainingEndMinutes }
})
