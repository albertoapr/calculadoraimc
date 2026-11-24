import { nextTick, reactive, ref } from 'vue'
import {
  isValidBirthDate,
  isValidFormattedCref,
  isValidInstagramHandle,
  isValidPersonName,
  normalizePersonName,
} from '../utils/validation'
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
    trainerId: '',
    city: '',
    cities: [],
    academyIds: [],
    sex: '',
    heightCm: undefined,
    whatsapp: '',
    whatsappVerified: false,
    email: '',
    dateOfBirth: '',
    instagram: '',
    cref: '',
    slug: '',
    academias: [],
    tagline: '',
    aboutMe: '',
    education: '',
    workingMethod: '',
    pricing: '',
    bannerUpdatedAt: '',
  })
  const editingProfileType = ref<AccountProfileType>('customer')
  const editingProfileStatus = ref('')
  const editingProfileLoading = ref(false)
  const editingProfileSaving = ref(false)
  let generation = 0

  function applyProfileForEditing(profile: AccountProfile) {
    editingProfile.name = profile.name ?? ''
    editingProfile.trainerId = 'trainerId' in profile ? profile.trainerId : ''
    editingProfile.city = 'city' in profile ? profile.city ?? '' : ''
    editingProfile.cities = 'cities' in profile ? [...(profile.cities ?? [])] : (editingProfile.city ? [editingProfile.city] : [])
    editingProfile.academyIds = 'academyIds' in profile ? [...(profile.academyIds ?? [])] : []
    const profileSex = 'sex' in profile ? profile.sex : undefined
    editingProfile.sex = profileSex === 'masculino' || profileSex === 'feminino' ? profileSex : ''
    editingProfile.heightCm = 'heightCm' in profile ? profile.heightCm : undefined
    editingProfile.whatsapp = profile.whatsapp ?? ''
    editingProfile.whatsappVerified = 'whatsappVerified' in profile && profile.whatsappVerified === true
    editingProfile.email = profile.email ?? ''
    editingProfile.dateOfBirth = profile.dateOfBirth ?? ''
    editingProfile.instagram = 'instagram' in profile ? (profile.instagram ?? '') : ''
    editingProfile.cref = 'cref' in profile ? (profile.cref ?? '') : ''
    editingProfile.slug = 'slug' in profile ? (profile.slug ?? '') : ''
    editingProfile.academias = 'academias' in profile ? [...(profile.academias ?? [])] : []
    editingProfile.tagline = 'tagline' in profile ? (profile.tagline ?? '') : ''
    editingProfile.aboutMe = 'aboutMe' in profile ? (profile.aboutMe ?? '') : ''
    editingProfile.education = 'education' in profile ? (profile.education ?? '') : ''
    editingProfile.workingMethod = 'workingMethod' in profile ? (profile.workingMethod ?? '') : ''
    editingProfile.pricing = 'pricing' in profile ? (profile.pricing ?? '') : ''
    editingProfile.bannerUpdatedAt = 'bannerUpdatedAt' in profile ? (profile.bannerUpdatedAt ?? '') : ''
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
    const name = normalizePersonName(editingProfile.name)
    const birth = editingProfile.dateOfBirth
    if (!isValidPersonName(name)) {
      editingProfileStatus.value = 'Informe um nome válido.'
      return
    }
    if (birth && !isValidBirthDate(birth)) {
      editingProfileStatus.value =
        'Informe uma data de nascimento válida ou deixe em branco até solicitar atendimento.'
      return
    }
    const type = editingProfileType.value
    if (type === 'customer' && !editingProfile.sex) { editingProfileStatus.value = 'Selecione o sexo.'; return }
    if (type === 'customer' && editingProfile.heightCm !== undefined && (!Number.isFinite(editingProfile.heightCm) || editingProfile.heightCm < 80 || editingProfile.heightCm > 250)) { editingProfileStatus.value = 'Informe uma altura válida entre 80 e 250 cm.'; return }
    const trainer = type === 'trainer'
    const cref = editingProfile.cref.trim().toUpperCase()
    const instagram = editingProfile.instagram.trim()
    if (trainer && !isValidFormattedCref(cref)) {
      editingProfileStatus.value = 'Informe um CREF no formato 072573-G/RJ ou deixe em branco.'
      return
    }
    if (trainer && !isValidInstagramHandle(instagram, true)) {
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
          ? { name, dateOfBirth: birth, instagram, cref, academias: editingProfile.academias, academyIds: editingProfile.academyIds,
              tagline: editingProfile.tagline, aboutMe: editingProfile.aboutMe,
              education: editingProfile.education, workingMethod: editingProfile.workingMethod,
              pricing: editingProfile.pricing }
          : { name, sex: editingProfile.sex as 'masculino' | 'feminino', ...(editingProfile.heightCm !== undefined ? { heightCm: editingProfile.heightCm } : {}), ...(birth ? { dateOfBirth: birth } : {}) },
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
