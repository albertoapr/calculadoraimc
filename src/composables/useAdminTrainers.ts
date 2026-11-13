import { computed, nextTick, reactive, ref, type Ref } from 'vue'
import {
  registerAdminTrainer,
  listAdminTrainers,
  updateAdminTrainer,
} from '../services/adminTrainersService'
import type { AdminTrainer } from '../types/domain'

export function useAdminTrainers(options: {
  isAdmin: Ref<boolean>
  getToken: () => string
  onOpen: () => void
}) {
  const adminTrainerForm = reactive({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    sex: 'feminino',
    cref: '',
    instagram: '@',
    slug: '',
    city: 'Mesquita',
    academias: '',
  })
  const adminTrainerStatus = ref('')
  const adminTrainerBusy = ref(false)
  async function saveAdminTrainer() {
    if (!options.isAdmin.value || adminTrainerBusy.value) return
    const token = options.getToken()
    if (!token) {
      adminTrainerStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainerBusy.value = true
    adminTrainerStatus.value = 'Salvando profissional…'
    try {
      await registerAdminTrainer(token, {
        ...adminTrainerForm,
        cities: [adminTrainerForm.city],
        academias: adminTrainerForm.academias
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      })
      adminTrainerStatus.value = 'Personal cadastrado e ativado com sucesso.'
    } catch (error) {
      adminTrainerStatus.value =
        error instanceof Error ? error.message : 'Falha ao cadastrar profissional.'
    } finally {
      adminTrainerBusy.value = false
    }
  }

  const adminTrainers = ref<AdminTrainer[]>([])
  const adminTrainerSearch = ref('')
  const selectedAdminTrainerId = ref('')
  const adminTrainersStatus = ref('')
  const adminTrainersLoading = ref(false)
  const adminTrainerEditBusy = ref(false)
  const adminTrainerEditForm = reactive({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    sex: 'feminino',
    cref: '',
    instagram: '',
    slug: '',
    cities: [] as string[],
    academias: '',
    active: true,
  })
  const filteredAdminTrainers = computed(() => {
    const search = adminTrainerSearch.value.trim().toLocaleLowerCase('pt-BR')
    if (!search) return adminTrainers.value
    return adminTrainers.value.filter((trainer) =>
      [trainer.name, trainer.cref, trainer.whatsapp].some((value) =>
        value.toLocaleLowerCase('pt-BR').includes(search),
      ),
    )
  })

  function selectAdminTrainer(trainer: AdminTrainer) {
    selectedAdminTrainerId.value = trainer.trainerId
    Object.assign(adminTrainerEditForm, {
      name: trainer.name,
      whatsapp: trainer.whatsapp,
      email: trainer.email,
      dateOfBirth: trainer.dateOfBirth,
      sex: trainer.sex || 'feminino',
      cref: trainer.cref,
      instagram: trainer.instagram,
      slug: trainer.slug,
      cities: [...trainer.cities],
      academias: trainer.academias.join(', '),
      active: trainer.active,
    })
    adminTrainersStatus.value = ''
    void nextTick(() =>
      document
        .querySelector<HTMLElement>('#admin-trainer-edit-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
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
      const trainers = await listAdminTrainers(token)
      adminTrainers.value = trainers
      adminTrainersStatus.value = trainers.length ? '' : 'Nenhum profissional cadastrado.'
      if (selectedAdminTrainerId.value) {
        const selected = trainers.find(
          (trainer) => trainer.trainerId === selectedAdminTrainerId.value,
        )
        if (selected) selectAdminTrainer(selected)
      }
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar os profissionais.'
    } finally {
      adminTrainersLoading.value = false
    }
  }

  function openAdminTrainers() {
    options.onOpen()
    selectedAdminTrainerId.value = ''
    adminTrainerSearch.value = ''
    void loadAdminTrainers()
    void nextTick(() => window.scrollTo(0, 0))
  }

  async function saveAdminTrainerEdit() {
    if (!options.isAdmin.value || !selectedAdminTrainerId.value || adminTrainerEditBusy.value)
      return
    if (!adminTrainerEditForm.cities.length) {
      adminTrainersStatus.value = 'Selecione pelo menos uma cidade.'
      return
    }
    const token = options.getToken()
    if (!token) {
      adminTrainersStatus.value = 'Entre novamente como administrador.'
      return
    }
    adminTrainerEditBusy.value = true
    adminTrainersStatus.value = 'Salvando profissional…'
    try {
      await updateAdminTrainer(token, selectedAdminTrainerId.value, {
        ...adminTrainerEditForm,
        academias: adminTrainerEditForm.academias
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      })
      await loadAdminTrainers()
      adminTrainersStatus.value = 'Dados do profissional atualizados com sucesso.'
    } catch (error) {
      adminTrainersStatus.value =
        error instanceof Error ? error.message : 'Não foi possível salvar o profissional.'
    } finally {
      adminTrainerEditBusy.value = false
    }
  }

  return {
    adminTrainerForm,
    adminTrainerStatus,
    adminTrainerBusy,
    saveAdminTrainer,
    adminTrainers,
    adminTrainerSearch,
    selectedAdminTrainerId,
    adminTrainersStatus,
    adminTrainersLoading,
    adminTrainerEditBusy,
    adminTrainerEditForm,
    filteredAdminTrainers,
    selectAdminTrainer,
    loadAdminTrainers,
    openAdminTrainers,
    saveAdminTrainerEdit,
  }
}
