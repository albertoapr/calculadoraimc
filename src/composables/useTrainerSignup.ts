import { computed, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import type { AcademyWrite } from '../services/academiesService'
import { registerTrainer, redeemBetaTrainerSignup, completeBetaTrainerSignup } from '../services/signupService'
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

export function useTrainerSignup(options: {
  getActiveCities?: () => Promise<string[]>
  onClose: () => void
  active?: Ref<boolean>
  replaceUrl?: (url: string) => unknown
  onAuthenticated?: (sessionToken: string) => Promise<void> | void
  linkedAccount?: () => {
    name: string; email: string; sex: '' | 'masculino' | 'feminino'
    whatsapp: string; dateOfBirth: string; googleCredential: string; photoUrl?: string
  } | null
}) {
  let disposed = false
  let registrationRequest: AbortController | undefined

  const signupAcademyChoice = ref('')

  const signupOtherAcademy = ref('')
  const referralCode = ref('')

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

  const linkedAccount = computed(() => options.linkedAccount?.() ?? null)
  // O cadastro pessoal existente alimenta a ativação profissional; não criar outra pessoa.
  const trainerStatus = ref('')
  const betaTrainerSignupToken = ref('')
  const betaAcademyHint = ref('')

  async function startBetaTrainerSignupFromLink() {
    betaTrainerSignupToken.value = ''
    const url = new URL(window.location.href)
    const code = url.searchParams.get('betaSignupCode')
    if (!code) return
    url.searchParams.delete('betaSignupCode')
    // Remove the bearer proof before making the network request.
    await options.replaceUrl?.(url.pathname + url.search + url.hash)
    try {
      const body = await redeemBetaTrainerSignup(code)
      if (disposed) return
      betaTrainerSignupToken.value = body.sessionToken
      trainerForm.phone = body.whatsapp
      if (body.name && !trainerForm.name) trainerForm.name = body.name
      if (body.city) {
        const activeCities = await options.getActiveCities?.()
        if (!disposed && (!activeCities || activeCities.includes(body.city))) trainerForm.cities = [body.city]
      }
      if (body.sexHint === 'masculino' || body.sexHint === 'feminino') trainerForm.sex = body.sexHint
      if (body.academyMatch === 'matched' && body.academyName && body.academyName.length <= 60) {
        trainerForm.academias = [body.academyName]
        betaAcademyHint.value = 'Academia identificada no cadastro da FitPeso. Confira antes de concluir.'
      } else if (body.proposedAcademyName) {
        betaAcademyHint.value = 'Não foi possível confirmar automaticamente a academia ' +
          body.proposedAcademyName +
          (body.proposedNeighborhood ? ' (' + body.proposedNeighborhood + ')' : '') +
          '. Selecione ou informe a academia correta.'
      }
      suggestTrainerSlug()
      trainerStatus.value = 'WhatsApp confirmado pela Beta. Confira seus dados; Instagram e CREF podem ser informados depois.'
    } catch (error) {
      trainerStatus.value = error instanceof Error ? error.message : 'Link expirado. Solicite outro à Beta.'
    }
  }

  const trainerVerificationLink = ref('')

  const trainerSubmitting = ref(false)

  function closeTrainerSignup() {
    stopTrainerRegistration()
    betaTrainerSignupToken.value = ''
    betaAcademyHint.value = ''
    trainerStatus.value = ''
    options.onClose()
  }

  function fillTrainerFromAccount() {
    const account = linkedAccount.value
    if (!account) return
    trainerForm.name = account.name
    trainerForm.email = account.email
    trainerForm.sex = account.sex
    trainerForm.dateOfBirth = account.dateOfBirth
    if (account.whatsapp && !trainerForm.phone) trainerForm.phone = account.whatsapp
    suggestTrainerSlug()
  }

  if (options.active) watch(options.active, active => {
    if (active) {
      fillTrainerFromAccount()
      referralCode.value = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase() ?? ''
    }
  }, { immediate: true })
  watch(linkedAccount, account => {
    if (account && options.active?.value) fillTrainerFromAccount()
  })

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

  async function sendTrainerSignup(newAcademies: AcademyWrite[] = [], academyIds: string[] = []) {
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
    const account = linkedAccount.value
    let validationError = ''
    if (referralCode.value && !/^FP[A-F0-9]{32}$/.test(referralCode.value)) {
      trainerStatus.value = 'Código de indicação inválido. Abra novamente o link enviado pelo colega.'
      return
    }
    if (account && !account.googleCredential) {
      validationError = 'Para ativar o perfil com a mesma conta, entre novamente com Google.'
    } else if (!isValidPersonName(name)) validationError = 'Informe seu nome completo.'
    else if (sex && sex !== 'masculino' && sex !== 'feminino')
      validationError = 'Selecione Masculino ou Feminino.'
    else if (!phone) validationError = 'Informe um WhatsApp válido com DDD.'
    else if (dateOfBirth && !isValidBirthDate(dateOfBirth))
      validationError = 'Informe uma data de nascimento válida ou deixe em branco.'
    else if (!isValidProfileSlug(slug)) {
      validationError =
        'O endereço do perfil deve ter de 3 a 40 caracteres, usando letras minúsculas, números ou hífen.'
    } else if (trainerForm.cities.length < 1 || trainerForm.cities.length > 2) {
      validationError = 'Escolha uma ou duas cidades de atuação.'
    } else if (trainerForm.instagram.trim() && !instagram) {
      validationError = 'Confira o Instagram informado ou deixe em branco para cadastrar depois.'
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
      const payload = {
        name,
        sex,
        slug,
        whatsapp: phone,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(email ? { email } : {}),
        cities: [...trainerForm.cities],
        academias: [...trainerForm.academias],
        ...(academyIds.length ? { academyIds } : {}),
        ...(newAcademies.length ? { newAcademies } : {}),
        instagram,
        ...(cref ? { cref } : {}),
        ...(referralCode.value ? { referralCode: referralCode.value } : {}),
        ...(account?.googleCredential ? { googleCredential: account.googleCredential } : {}),
      }
      if (betaTrainerSignupToken.value) {
        const sessionToken = await completeBetaTrainerSignup(
          { ...payload, onboardingSessionToken: betaTrainerSignupToken.value },
          controller.signal,
        )
        if (disposed || controller.signal.aborted) return
        betaTrainerSignupToken.value = ''
        trainerStatus.value = 'Perfil profissional ativado! Entrando na FitPeso…'
        await options.onAuthenticated?.(sessionToken)
      } else {
        const body = await registerTrainer(payload, controller.signal)
        if (disposed || controller.signal.aborted) return
        // Match the environment selection used by the WhatsApp login command.
        const isDevelop =
          window.location.hostname === 'develop.fitpeso.com.br' ||
          (window.location.hostname !== 'fitpeso.com.br' &&
            import.meta.env.VITE_FITPESO_BRANCH === 'develop')
        const message = isDevelop
          ? `/personal develop ${body.verificationCode}`
          : `/personal ${body.verificationCode}`
        trainerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
        trainerStatus.value = `Cadastro salvo. Envie a confirmação pelo WhatsApp em até 15 minutos. Após confirmar, seu perfil será ativado em https://fitpeso.com.br/personal/${body.slug || slug}.`
      }
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
        if (!active) {
          stopTrainerRegistration()
          betaTrainerSignupToken.value = ''
        }
      },
      { flush: 'sync' },
    )
  onScopeDispose(() => {
    disposed = true
    stopTrainerRegistration()
  })
  return {
    signupAcademyChoice,
    signupOtherAcademy,
    referralCode,
    trainerForm,
    linkedAccount,
    trainerStatus,
    betaTrainerSignupToken,
    betaAcademyHint,
    startBetaTrainerSignupFromLink,
    trainerVerificationLink,
    trainerSubmitting,
    closeTrainerSignup,
    toggleTrainerCity,
    suggestTrainerSlug,
    sendTrainerSignup,
    stopTrainerRegistration,
  }
}
