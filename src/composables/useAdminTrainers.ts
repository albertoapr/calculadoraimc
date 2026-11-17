import { computed, nextTick, reactive, ref, watch, type Ref } from 'vue'
import {
  registerAdminTrainer,
  listAdminTrainers,
  updateAdminTrainer,
} from '../services/adminTrainersService'
import type { AdminTrainer } from '../types/domain'
import { listAdminAcademies, type Academy } from '../services/academiesService'
import { isValidBirthDate } from '../utils/validation'

type ActivityFilter = 'all' | 'active' | 'inactive'

function emptyTrainerForm() {
  return {
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    sex: 'feminino',
    cref: '',
    instagram: '@',
    slug: '',
    cities: ['Mesquita'] as string[],
    academias: '',
    academyIds: [] as string[],
    active: true,
  }
}

export function useAdminTrainers(options: {
  isAdmin: Ref<boolean>
  getToken: () => string
  onOpen: () => void
}) {
  const adminTrainers = ref<AdminTrainer[]>([])
  const adminAcademies = ref<Academy[]>([])
  const adminTrainerSearch = ref('')
  const adminTrainerActivityFilter = ref<ActivityFilter>('all')
  const selectedAdminTrainerId = ref('')
  const adminTrainerFormVisible = ref(false)
  const adminTrainersStatus = ref('')
  const adminTrainersLoading = ref(false)
  const adminTrainerBusy = ref(false)
  const adminTrainerForm = reactive(emptyTrainerForm())

  const availableAcademiesForTrainer = computed(() =>
    adminAcademies.value.filter(
      (academy) => academy.active && adminTrainerForm.cities.includes(academy.city),
    ),
  )

  watch(
    () => [...adminTrainerForm.cities],
    () => {
      const availableIds = new Set(
        availableAcademiesForTrainer.value.map((academy) => academy.academyId),
      )
      adminTrainerForm.academyIds = adminTrainerForm.academyIds.filter((id) =>
        availableIds.has(id),
      )
    },
  )

  const filteredAdminTrainers = computed(() => {
    const search = adminTrainerSearch.value.trim().toLocaleLowerCase('pt-BR')
    return adminTrainers.value
      .filter((trainer) => {
        if (adminTrainerActivityFilter.value === 'active' && !trainer.active) return false
        if (adminTrainerActivityFilter.value === 'inactive' && trainer.active) return false
        if (!search) return true
        return [
          trainer.name,
          trainer.cref,
          trainer.whatsapp,
          trainer.email,
          trainer.instagram,
          ...trainer.cities,
        ].some((value) => value.toLocaleLowerCase('pt-BR').includes(search))
      })
      .sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          left.name.localeCompare(right.name, 'pt-BR'),
      )
  })

  function scrollToEditor() {
    void nextTick(() =>
      document
        .querySelector<HTMLElement>('#admin-trainer-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  function resetAdminTrainerForm() {
    Object.assign(adminTrainerForm, emptyTrainerForm())
  }

  function startNewAdminTrainer() {
    selectedAdminTrainerId.value = ''
    resetAdminTrainerForm()
    adminTrainerFormVisible.value = true
    adminTrainersStatus.value = ''
    scrollToEditor()
  }

  function applyTrainerToForm(trainer: AdminTrainer) {
    Object.assign(adminTrainerForm, {
      name: trainer.name,
      whatsapp: trainer.whatsapp,
      email: trainer.email,
      dateOfBirth: trainer.dateOfBirth,
      sex: trainer.sex || 'feminino',
      cref: trainer.cref,
      instagram: trainer.instagram,
      slug: trainer.slug,
      cities: [...trainer.cities],
      academias: trainer.academias
        .filter(
          (name) =>
            !adminAcademies.value.some(
              (academy) =>
                `${academy.name} — ${academy.neighborhood}`.toLocaleLowerCase('pt-BR') ===
                name.toLocaleLowerCase('pt-BR'),
            ),
        )
        .join(', '),
      academyIds: [...(trainer.academyIds ?? [])],
      active: trainer.active,
    })
  }

  function selectAdminTrainer(trainer: AdminTrainer) {
    selectedAdminTrainerId.value = trainer.trainerId
    applyTrainerToForm(trainer)
    adminTrainerFormVisible.value = true
    adminTrainersStatus.value = ''
    scrollToEditor()
  }

  function cancelAdminTrainerEdit() {
    selectedAdminTrainerId.value = ''
    adminTrainerFormVisible.value = false
    resetAdminTrainerForm()
    adminTrainersStatus.value = ''
  }

  async function loadAdminTrainers() {
    if (!options.isAdmin.value || adminTrainersLoading.value) return
    const token = options.getToken()
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainersLoading.value = true
    adminTrainersStatus.value = 'Carregando profissionais…'
    try {
      const [trainers, academies] = await Promise.all([
        listAdminTrainers(token),
        listAdminAcademies(token).catch(() => [] as Academy[]),
      ])
      adminTrainers.value = trainers
      adminAcademies.value = academies
      adminTrainersStatus.value = trainers.length ? '' : 'Nenhum profissional cadastrado.'
      if (selectedAdminTrainerId.value) {
        const selected = trainers.find(
          (trainer) => trainer.trainerId === selectedAdminTrainerId.value,
        )
        if (selected) applyTrainerToForm(selected)
        else cancelAdminTrainerEdit()
      }
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar os profissionais.'
    } finally {
      adminTrainersLoading.value = false
    }
  }

  async function loadAdminAcademyOptions() {
    const token = options.getToken()
    if (!options.isAdmin.value || !token) return
    try {
      adminAcademies.value = await listAdminAcademies(token)
    } catch {
      adminAcademies.value = []
    }
  }

  function openAdminTrainers() {
    options.onOpen()
    selectedAdminTrainerId.value = ''
    adminTrainerFormVisible.value = false
    adminTrainerSearch.value = ''
    adminTrainerActivityFilter.value = 'all'
    resetAdminTrainerForm()
    void loadAdminTrainers()
    void nextTick(() => window.scrollTo(0, 0))
  }

  function validateForm() {
    if (!adminTrainerForm.cities.length) return 'Selecione pelo menos uma cidade.'
    if (adminTrainerForm.cities.length > 2) return 'Selecione no máximo duas cidades.'
    if (!isValidBirthDate(adminTrainerForm.dateOfBirth))
      return 'Informe uma data de nascimento válida.'
    return ''
  }

  function trainerPayload(active = adminTrainerForm.active) {
    return {
      ...adminTrainerForm,
      active,
      academias: adminTrainerForm.academias
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    }
  }

  async function saveAdminTrainer() {
    if (!options.isAdmin.value || adminTrainerBusy.value) return
    const validationMessage = validateForm()
    if (validationMessage) {
      adminTrainersStatus.value = validationMessage
      return
    }
    const token = options.getToken()
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }

    adminTrainerBusy.value = true
    adminTrainersStatus.value = selectedAdminTrainerId.value
      ? 'Salvando profissional…'
      : 'Cadastrando profissional…'
    try {
      if (selectedAdminTrainerId.value) {
        await updateAdminTrainer(token, selectedAdminTrainerId.value, trainerPayload())
        await loadAdminTrainers()
        adminTrainersStatus.value = 'Dados do profissional atualizados com sucesso.'
      } else {
        const created = await registerAdminTrainer(token, trainerPayload(true))
        selectedAdminTrainerId.value = created.trainerId ?? ''
        await loadAdminTrainers()
        adminTrainerFormVisible.value = Boolean(selectedAdminTrainerId.value)
        adminTrainersStatus.value = 'Profissional cadastrado e ativado com sucesso.'
      }
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível salvar o profissional.'
    } finally {
      adminTrainerBusy.value = false
    }
  }

  async function deactivateAdminTrainer() {
    if (
      !options.isAdmin.value ||
      !selectedAdminTrainerId.value ||
      adminTrainerBusy.value ||
      !adminTrainerForm.active
    )
      return
    const token = options.getToken()
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }

    adminTrainerBusy.value = true
    adminTrainersStatus.value = 'Desativando profissional…'
    try {
      await updateAdminTrainer(
        token,
        selectedAdminTrainerId.value,
        trainerPayload(false),
      )
      adminTrainerForm.active = false
      await loadAdminTrainers()
      adminTrainersStatus.value =
        'Profissional desativado. O cadastro foi preservado e pode ser reativado.'
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível desativar o profissional.'
    } finally {
      adminTrainerBusy.value = false
    }
  }

  return {
    adminTrainerForm,
    adminTrainerStatus: adminTrainersStatus,
    adminTrainerBusy,
    saveAdminTrainer,
    adminTrainers,
    adminAcademies,
    availableAcademiesForTrainer,
    loadAdminAcademyOptions,
    adminTrainerSearch,
    adminTrainerActivityFilter,
    selectedAdminTrainerId,
    adminTrainerFormVisible,
    adminTrainersStatus,
    adminTrainersLoading,
    adminTrainerEditBusy: adminTrainerBusy,
    adminTrainerEditForm: adminTrainerForm,
    filteredAdminTrainers,
    selectAdminTrainer,
    startNewAdminTrainer,
    cancelAdminTrainerEdit,
    loadAdminTrainers,
    openAdminTrainers,
    saveAdminTrainerEdit: saveAdminTrainer,
    deactivateAdminTrainer,
  }
}
