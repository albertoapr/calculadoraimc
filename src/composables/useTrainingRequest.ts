import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { createFitpesoRequest } from '../services/atendimentoService'
import {
  isValidAge,
  isValidEmail,
  isValidPersonName,
  normalizeBrazilianPhone,
  normalizeEmail,
  normalizePersonName,
} from '../utils/validation'
import { minutesToTime } from '../utils/time'
import { trainerDisplayName } from '../utils/trainer'
import type { AppViewMode } from '../types/navigation'
import type { useTrainingDraft } from '../stores/trainingDraft'
import type { useHome } from './useHome'

export function useTrainingRequest(options: {
  viewMode: Ref<AppViewMode>
  showRequestForm: Ref<boolean>
  requestStep: Ref<number>
  selectingTrainersForDraft: Ref<boolean>
  selectedTrainerIds: Ref<string[]>
  homeSelectedTrainerIds: Ref<string[]>
  sharingRequestId: Ref<string>
  sharingRequestMessage: Ref<string>
  customerSignedInName: Ref<string>
  form: ReturnType<typeof useTrainingDraft>['form']
  trainingStartMinutes: Ref<number>
  trainingEndMinutes: Ref<number>
  status: Ref<string>
  home: ReturnType<typeof useHome>
  refreshShareableRequests: () => Promise<void>
  openCustomerLogin: (fromRequest: boolean, method: 'whatsapp') => Promise<void>
  onContactReset: () => void
}) {
  const {
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
    openCustomerLogin,
  } = options
  const {
    publicTrainers,
    publicTrainerAcademies,
    publicTrainerAcademy,
    publicTrainerCity,
    homeCity,
    loadPublicTrainers,
    matchSupportedRequestCity,
    cancelRequestCityDetection,
    detectRequestCity,
  } = options.home
  const submittingRequest = ref(false)
  const isMesquita = (city: string) => city.trim().toLocaleLowerCase('pt-BR') === 'mesquita'
  const trainingDayOptions = [
    { label: 'Seg', value: 'Segunda-feira' },
    { label: 'Ter', value: 'Terça-feira' },
    { label: 'Qua', value: 'Quarta-feira' },
    { label: 'Qui', value: 'Quinta-feira' },
    { label: 'Sex', value: 'Sexta-feira' },
    { label: 'Sáb', value: 'Sábado' },
  ]

  function selectTrainingTimeRange(start: number, end: number) {
    trainingStartMinutes.value = start
    trainingEndMinutes.value = end
  }
  const trainingTimeShifts = computed(() => {
    const start = trainingStartMinutes.value
    const end = trainingEndMinutes.value
    return [
      ...(start < 720 && end > 300 ? ['Manhã'] : []),
      ...(start < 1080 && end > 720 ? ['Tarde'] : []),
      ...(end > 1080 ? ['Noite'] : []),
    ]
  })

  const selectedTrainerNames = computed(() =>
    selectedTrainerIds.value.map((id) => {
      const trainer = publicTrainers.value.find((item) => item.trainerId === id)
      return trainer ? trainerDisplayName(trainer.name) : 'Profissional indisponível'
    }),
  )
  function clearContactDetails() {
    showRequestForm.value = false
    form.shareContactConsent = false
    form.name = ''
    form.phone = ''
    form.email = ''
    form.objective = 'Emagrecimento'
    form.age = ''
    form.clientGender = 'nao_informar'
    form.city = ''
    form.sessionsPerWeek = '1'
    form.trainingDays = ['Segunda-feira']
    form.trainingShifts = ['Noite']
    trainingStartMinutes.value = 1080
    trainingEndMinutes.value = 1260
    options.onContactReset()
  }

  async function openRequestForm() {
    status.value = ''
    showRequestForm.value = true
    requestStep.value = 5
    selectingTrainersForDraft.value = false
    cancelRequestCityDetection()
    form.city = homeCity.value
    // O controle deslizante precisa sempre começar com uma idade válida.
    if (!Number.isInteger(Number(form.age)) || Number(form.age) < 15 || Number(form.age) > 100) {
      form.age = '40'
    }
    form.clientGender = 'feminino'
    form.trainerGenderPreference = 'indiferente'
    form.sessionsPerWeek = '1'
    form.trainingDays = ['Segunda-feira']
    form.trainingShifts = ['Noite']
    trainingStartMinutes.value = 1080
    trainingEndMinutes.value = 1260
    form.desiredDuration = '1 mês'
    form.singleLesson = true
    form.withCompanion = false
    selectedTrainerIds.value = []
    form.gymName = publicTrainerAcademy.value || defaultAcademyForCity(form.city)
    form.attendsGym = Boolean(form.gymName)
    otherGymName.value = ''
    form.objective = 'Emagrecimento'
    viewMode.value = 'contact'
    publicTrainerCity.value = form.city
    if (publicTrainerCity.value) void loadPublicTrainers()
    await nextTick()
    window.scrollTo(0, 0)
    if (!homeCity.value) void detectRequestCity()
  }

  function defaultAcademyForCity(city: string): string {
    if (!isMesquita(city)) return ''
    return (
      publicTrainerAcademies.value.find(
        (name) => name.trim().toLocaleLowerCase('pt-BR') === 'aquatic center — vila emil',
      ) ??
      publicTrainerAcademies.value.find(
        (name) => /aquatic\s*center/i.test(name) && /vila\s*emil/i.test(name),
      ) ??
      ''
    )
  }
  watch(publicTrainerAcademies, () => {
    if (viewMode.value === 'contact' && !form.gymName) {
      form.gymName = defaultAcademyForCity(form.city)
      form.attendsGym = Boolean(form.gymName)
    }
  })
  const otherGymName = ref('')
  watch(
    () => form.city,
    (city) => {
      if (viewMode.value !== 'contact') return
      form.gymName = defaultAcademyForCity(city)
      form.attendsGym = Boolean(form.gymName)
      otherGymName.value = ''
      publicTrainerCity.value = city
      if (city) void loadPublicTrainers()
    },
  )

  async function modifyRequestDetails() {
    requestStep.value = 1
    status.value = ''
    await nextTick()
    window.scrollTo(0, 0)
  }

  async function continueToTrainerSelection() {
    status.value = ''
    if (requestStep.value === 1) {
      if (!isValidAge(form.age)) {
        status.value = 'Informe sua idade (de 15 a 100 anos).'
        return
      }
      const sessions = Number(form.sessionsPerWeek)
      if (!form.objective) {
        status.value = 'Selecione seu objetivo.'
        return
      }
      if (!Number.isInteger(sessions) || sessions < 1 || sessions > 4) {
        status.value = 'Selecione de 1 a 4 aulas por semana.'
        return
      }
    } else if (requestStep.value === 2) {
      if (!form.gymName) {
        status.value = 'Selecione uma academia.'
        return
      }
      if (form.gymName === 'Outros' && !otherGymName.value.trim()) {
        status.value = 'Informe o lugar onde pretende treinar.'
        return
      }
      form.attendsGym = true
      if (!form.trainingDays.length) {
        status.value = 'Selecione pelo menos um dia da semana.'
        return
      }
      if (trainingStartMinutes.value >= trainingEndMinutes.value) {
        status.value = 'Informe uma faixa de horário válida.'
        return
      }
      const selectedCity = matchSupportedRequestCity(form.city)
      if (!selectedCity) {
        status.value = 'Selecione uma cidade atendida.'
        return
      }
      form.city = selectedCity
    }
    if (requestStep.value === 3) {
      await selectTrainersForDraft()
      return
    }
    if (requestStep.value < 3) requestStep.value += 1
    await nextTick()
    window.scrollTo(0, 0)
  }

  async function selectTrainersForDraft() {
    if (!matchSupportedRequestCity(form.city)) {
      status.value = 'Selecione uma cidade atendida antes de escolher os profissionais.'
      requestStep.value = 5
      return
    }
    status.value = ''
    selectingTrainersForDraft.value = true
    sharingRequestMessage.value = ''
    publicTrainerCity.value = form.city
    publicTrainerAcademy.value = ''
    homeSelectedTrainerIds.value = [...selectedTrainerIds.value]
    viewMode.value = 'select-trainers'
    await loadPublicTrainers()
    await nextTick()
    window.scrollTo(0, 0)
  }
  async function returnToDraftSummary() {
    if (selectingTrainersForDraft.value && !homeSelectedTrainerIds.value.length) {
      sharingRequestMessage.value = 'Selecione pelo menos um personal para continuar.'
      return
    }
    selectedTrainerIds.value = [...homeSelectedTrainerIds.value]
    selectingTrainersForDraft.value = false
    viewMode.value = 'contact'
    requestStep.value = 5
    showRequestForm.value = true
    await nextTick()
    window.scrollTo(0, 0)
  }
  async function confirmServiceRequest() {
    if (!selectedTrainerIds.value.length) {
      status.value = 'Selecione pelo menos um personal antes de enviar a solicitação.'
      return
    }
    if (!isValidAge(form.age)) {
      status.value = 'Informe sua idade (de 15 a 100 anos) antes de enviar.'
      return
    }
    if (!customerSignedInName.value) {
      await openCustomerLogin(true, 'whatsapp')
      return
    }
    form.shareContactConsent = true
    await sendResult()
  }

  async function sendResult() {
    if (!form.shareContactConsent || submittingRequest.value) return
    status.value = ''

    const clientName = normalizePersonName(form.name)
    const normalizedPhone = normalizeBrazilianPhone(form.phone)
    const email = normalizeEmail(form.email)
    const city = form.city.trim().replace(/\s+/g, ' ')
    const ageInput = String(form.age).trim()
    const age = ageInput ? Number(ageInput) : undefined
    const validName = isValidPersonName(clientName)
    const validCity = Boolean(matchSupportedRequestCity(city))
    const validAge = isValidAge(ageInput)
    const validPhone = Boolean(normalizedPhone)
    const validEmail = isValidEmail(email, true)

    if (!validName || !validCity || !validAge || !validPhone || !validEmail) {
      status.value =
        'Confira o nome, o WhatsApp, o e-mail, a cidade e informe sua idade (de 15 a 100 anos).'
      return
    }
    if (!selectedTrainerIds.value.length) {
      status.value = 'Selecione pelo menos um personal.'
      return
    }
    if (
      !Number.isInteger(Number(form.sessionsPerWeek)) ||
      Number(form.sessionsPerWeek) < 1 ||
      Number(form.sessionsPerWeek) > 4 ||
      !form.trainingDays.length ||
      trainingStartMinutes.value >= trainingEndMinutes.value
    ) {
      status.value = 'Informe as aulas por semana, pelo menos um dia e uma faixa de horário válida.'
      return
    }
    const trainingDays = form.trainingDays
    const trainingShifts = trainingTimeShifts.value

    submittingRequest.value = true
    status.value = 'Enviando sua solicitação para a Beta…'

    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session') ??
        ''
      if (!token) throw new Error('Entre na sua conta para solicitar atendimento.')
      const createdRequestId = await createFitpesoRequest(
        {
          clientName,
          clientPhone: normalizedPhone,
          ...(email ? { email } : {}),
          age,
          clientGender: form.clientGender,
          city,
          trainerGenderPreference: form.trainerGenderPreference,
          desiredDuration: form.singleLesson ? 'Aula avulsa' : form.desiredDuration,
          singleLesson: form.singleLesson,
          withCompanion: form.withCompanion,
          attendsGym: form.attendsGym,
          ...(form.attendsGym && form.gymName.trim()
            ? {
                gymName:
                  form.gymName === 'Outros' ? otherGymName.value.trim() : form.gymName.trim(),
              }
            : {}),
          objective: form.objective,
          ...(form.sessionsPerWeek ? { sessionsPerWeek: Number(form.sessionsPerWeek) } : {}),
          trainingDays,
          trainingShifts,
          trainingStartTime: minutesToTime(trainingStartMinutes.value),
          trainingEndTime: minutesToTime(trainingEndMinutes.value),
          selectedTrainerIds: selectedTrainerIds.value,
          consent: form.shareContactConsent,
        },
        token,
      )
      sharingRequestId.value = createdRequestId
      sharingRequestMessage.value = 'Solicitação criada com os profissionais selecionados.'
      homeSelectedTrainerIds.value = []
      publicTrainerCity.value = city
      homeCity.value = city
      viewMode.value = 'public-trainers'
      showRequestForm.value = false
      await loadPublicTrainers()
      await refreshShareableRequests()
      await nextTick()
      window.scrollTo(0, 0)
    } catch (error) {
      status.value =
        error instanceof Error ? error.message : 'Não foi possível preparar a solicitação agora.'
      submittingRequest.value = false
      return
    }

    status.value = ''
    submittingRequest.value = false
  }

  return {
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
  }
}
