import { onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import { registerTrainer } from '../services/signupService'
import {
  isValidBirthDate,
  isValidEmail,
  isValidLooseCref,
  isValidPersonName,
  isValidProfileSlug,
  normalizeBrazilianPhone,
  normalizeEmail,
  normalizeInstagramHandle,
  normalizePersonName,
} from '../utils/validation'

export function useTrainerSignup(options: { onClose: () => void; active?: Ref<boolean> }) {
  let disposed = false
  let registrationRequest: AbortController | undefined
  const availableCities = ['Mesquita', 'Nilópolis', 'Nova Iguaçu', 'Rio de Janeiro']

  const signupAcademyChoice = ref('')

  const signupOtherAcademy = ref('')

  const trainerForm = reactive({
    name: '',
    sex: '' as '' | 'masculino' | 'feminino',
    slug: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    cities: [] as string[],
    instagram: '',
    cref: '',
    academias: [] as string[],
  })

  const trainerStatus = ref('')

  const trainerVerificationLink = ref('')

  const trainerSubmitting = ref(false)

  function closeTrainerSignup() {
    stopTrainerRegistration()
    trainerStatus.value = ''
    options.onClose()
  }

  function toggleTrainerCity(city: string) {
    const index = trainerForm.cities.indexOf(city)
    if (index >= 0) {
      trainerForm.cities.splice(index, 1)
    } else if (trainerForm.cities.length < 2) {
      trainerForm.cities.push(city)
    }
  }

  function suggestTrainerSlug() {
    if (trainerForm.slug.trim()) return
    trainerForm.slug = trainerForm.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '')
  }

  async function sendTrainerSignup() {
    if (disposed || trainerSubmitting.value) return
    trainerStatus.value = ''
    trainerVerificationLink.value = ''
    const name = normalizePersonName(trainerForm.name)
    const sex = trainerForm.sex
    const slug = trainerForm.slug.trim().toLowerCase()
    const phone = normalizeBrazilianPhone(trainerForm.phone)
    const email = normalizeEmail(trainerForm.email)
    const dateOfBirth = trainerForm.dateOfBirth
    const instagram = normalizeInstagramHandle(trainerForm.instagram)
    const cref = trainerForm.cref.trim()
    let validationError = ''
    if (!isValidPersonName(name)) validationError = 'Informe seu nome completo.'
    else if (sex !== 'masculino' && sex !== 'feminino')
      validationError = 'Selecione Masculino ou Feminino.'
    else if (!phone) validationError = 'Informe um WhatsApp válido com DDD.'
    else if (dateOfBirth && !isValidBirthDate(dateOfBirth))
      validationError = 'Informe uma data de nascimento válida ou deixe em branco.'
    else if (!isValidProfileSlug(slug)) {
      validationError =
        'O endereço do perfil deve ter de 3 a 40 caracteres, usando letras minúsculas, números ou hífen.'
    } else if (trainerForm.cities.length < 1 || trainerForm.cities.length > 2) {
      validationError = 'Escolha uma ou duas cidades de atuação.'
    } else if (!instagram) {
      validationError = 'Informe um Instagram válido: @usuario, usuario ou instagram.com/usuario.'
    } else if (!isValidEmail(email, true)) {
      validationError = 'Confira o endereço de e-mail ou deixe o campo vazio.'
    } else if (!isValidLooseCref(cref)) {
      validationError = 'Confira o CREF ou deixe o campo vazio.'
    }
    if (validationError) {
      trainerStatus.value = validationError
      return
    }

    const controller = new AbortController()
    registrationRequest = controller
    trainerSubmitting.value = true
    trainerStatus.value = 'Salvando seu cadastro…'
    try {
      const body = await registerTrainer(
        {
          name,
          sex,
          slug,
          whatsapp: phone,
          ...(dateOfBirth ? { dateOfBirth } : {}),
          ...(email ? { email } : {}),
          cities: [...trainerForm.cities],
          academias: [...trainerForm.academias],
          instagram,
          ...(cref ? { cref } : {}),
        },
        controller.signal,
      )
      if (disposed || controller.signal.aborted) return
      const message = `Confirmar personal Fitpeso ${body.verificationCode}\nWhatsApp: ${phone}\nNome: ${name}`
      trainerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
      trainerStatus.value = `Cadastro salvo. Envie a confirmação pelo WhatsApp em até 15 minutos. Após confirmar, seu perfil será ativado em https://fitpeso.com.br/personal/${body.slug || slug}.`
    } catch (error) {
      if (disposed || controller.signal.aborted) return
      trainerStatus.value =
        error instanceof Error ? error.message : 'Não foi possível registrar seu cadastro agora.'
    } finally {
      if (registrationRequest === controller) registrationRequest = undefined
      trainerSubmitting.value = false
    }
  }
  function stopTrainerRegistration() {
    registrationRequest?.abort()
  }
  if (options.active)
    watch(
      options.active,
      (active) => {
        if (!active) stopTrainerRegistration()
      },
      { flush: 'sync' },
    )
  onScopeDispose(() => {
    disposed = true
    stopTrainerRegistration()
  })
  return {
    availableCities,
    signupAcademyChoice,
    signupOtherAcademy,
    trainerForm,
    trainerStatus,
    trainerVerificationLink,
    trainerSubmitting,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    stopTrainerRegistration,
  }
}
