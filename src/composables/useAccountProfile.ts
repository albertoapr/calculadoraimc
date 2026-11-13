import { nextTick, reactive, ref } from 'vue'
import { isValidBirthDate } from '../utils/signupValidation'
import {
  loadAccountProfile,
  updateAccountProfile,
  type AccountProfile,
  type AccountProfileType,
} from '../services/accountProfileService'
import type {
  CustomerAccountProfile,
  EditableProfile,
  TrainerAccountProfile,
} from '../types/domain'

type AccountProfileOptions = {
  isTrainer: () => boolean
  getToken: (type: AccountProfileType) => string
  openView: () => void
  isViewOpen: () => boolean
  applyCustomerProfile: (profile: CustomerAccountProfile) => void
  applyTrainerSession: (profile: TrainerAccountProfile) => void
  afterCustomerSave: (profile: CustomerAccountProfile) => Promise<void>
}

export function useAccountProfile(options: AccountProfileOptions) {
  const editingProfile = reactive<EditableProfile>({
    name: '',
    whatsapp: '',
    email: '',
    dateOfBirth: '',
    instagram: '',
    cref: '',
    slug: '',
    academias: [],
  })
  const editingProfileType = ref<AccountProfileType>('customer')
  const editingProfileStatus = ref('')
  const editingProfileLoading = ref(false)
  const editingProfileSaving = ref(false)
  let generation = 0

  function applyProfileForEditing(profile: AccountProfile) {
    editingProfile.name = profile.name ?? ''
    editingProfile.whatsapp = profile.whatsapp ?? ''
    editingProfile.email = profile.email ?? ''
    editingProfile.dateOfBirth = profile.dateOfBirth ?? ''
    editingProfile.instagram = 'instagram' in profile ? (profile.instagram ?? '') : ''
    editingProfile.cref = 'cref' in profile ? (profile.cref ?? '') : ''
    editingProfile.slug = 'slug' in profile ? (profile.slug ?? '') : ''
    editingProfile.academias = 'academias' in profile ? [...(profile.academias ?? [])] : []
  }

  async function openMyProfile() {
    const type: AccountProfileType = options.isTrainer() ? 'trainer' : 'customer'
    editingProfileType.value = type
    editingProfileStatus.value = ''
    editingProfileLoading.value = true
    options.openView()
    await nextTick()
    window.scrollTo(0, 0)
    const currentGeneration = generation
    try {
      const token = options.getToken(type)
      if (!token) throw new Error('Entre na sua conta para consultar o cadastro.')
      const profile = await loadAccountProfile(type, token)
      if (generation !== currentGeneration || !options.isViewOpen()) return
      applyProfileForEditing(profile)
      editingProfileStatus.value = ''
    } catch (error) {
      if (generation === currentGeneration) {
        editingProfileStatus.value =
          error instanceof Error ? error.message : 'Não foi possível carregar seu cadastro.'
      }
    } finally {
      if (generation === currentGeneration) editingProfileLoading.value = false
    }
  }

  async function saveMyProfile() {
    if (editingProfileSaving.value || editingProfileLoading.value) return
    const name = editingProfile.name.trim().replace(/\s+/g, ' ')
    const birth = editingProfile.dateOfBirth
    if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) {
      editingProfileStatus.value = 'Informe um nome válido.'
      return
    }
    if (birth && !isValidBirthDate(birth)) {
      editingProfileStatus.value =
        'Informe uma data de nascimento válida ou deixe em branco até solicitar atendimento.'
      return
    }
    const type = editingProfileType.value
    const trainer = type === 'trainer'
    const cref = editingProfile.cref.trim().toUpperCase()
    const instagram = editingProfile.instagram.trim()
    if (trainer && cref && !/^[0-9]{1,10}-[GP]\/[A-Z]{2}$/.test(cref)) {
      editingProfileStatus.value = 'Informe um CREF no formato 072573-G/RJ ou deixe em branco.'
      return
    }
    if (
      trainer &&
      instagram &&
      (!/^@[A-Za-z0-9._]{1,30}$/.test(instagram) ||
        instagram.includes('..') ||
        instagram.endsWith('.'))
    ) {
      editingProfileStatus.value = 'Informe o Instagram no formato @usuario.'
      return
    }
    editingProfileSaving.value = true
    editingProfileStatus.value = 'Salvando alterações…'
    const currentGeneration = generation
    try {
      const token = options.getToken(type)
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
      const profile = await updateAccountProfile(
        type,
        token,
        trainer
          ? { name, dateOfBirth: birth, instagram, cref, academias: editingProfile.academias }
          : { name, ...(birth ? { dateOfBirth: birth } : {}) },
      )
      if (generation !== currentGeneration || !options.isViewOpen()) return
      applyProfileForEditing(profile)
      if (trainer) options.applyTrainerSession(profile as TrainerAccountProfile)
      else options.applyCustomerProfile(profile as CustomerAccountProfile)
      editingProfileStatus.value = 'Cadastro atualizado com sucesso.'
      if (!trainer) await options.afterCustomerSave(profile as CustomerAccountProfile)
    } catch (error) {
      if (generation === currentGeneration)
        editingProfileStatus.value =
          error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'
    } finally {
      if (generation === currentGeneration) editingProfileSaving.value = false
    }
  }

  function resetAccountProfile() {
    generation += 1
    editingProfileStatus.value = ''
    editingProfileLoading.value = false
    editingProfileSaving.value = false
    applyProfileForEditing({ name: '', whatsapp: '', email: '' })
  }

  return {
    editingProfile,
    editingProfileType,
    editingProfileStatus,
    editingProfileLoading,
    editingProfileSaving,
    openMyProfile,
    saveMyProfile,
    resetAccountProfile,
  }
}
