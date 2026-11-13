import { nextTick, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import { registerCustomer, queryCustomerSignup } from '../services/signupService'
import { normalizeBrazilianPhone } from '../utils/signupValidation'

export function useCustomerSignup(options: {
  onClose: (confirmed: boolean) => void
  active?: Ref<boolean>
}) {
  let disposed = false
  let verificationGeneration = 0
  let registrationRequest: AbortController | undefined
  let verificationRequest: AbortController | undefined
  const customerForm = reactive({ name: '', whatsapp: '', email: '', dateOfBirth: '' })

  const signupContact = ref('')

  const signupStep = ref<1 | 2>(1)

  const customerStatus = ref('')

  const customerVerificationLink = ref('')

  const customerVerificationCode = ref('')

  const customerVerificationComplete = ref(false)

  const customerSubmitting = ref(false)

  let customerVerificationPollTimer: number | undefined

  let customerVerificationPollStartedAt = 0

  function scheduleCustomerVerificationPoll(delayMs = 10_000) {
    if (disposed) return
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    customerVerificationPollTimer = window.setTimeout(
      () => void pollCustomerVerification(),
      delayMs,
    )
  }

  async function pollCustomerVerification() {
    if (
      disposed ||
      verificationRequest ||
      !customerVerificationCode.value ||
      !customerForm.whatsapp ||
      customerVerificationComplete.value
    )
      return
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    const generation = verificationGeneration
    const controller = new AbortController()
    verificationRequest = controller
    const isCurrent = () =>
      !disposed && generation === verificationGeneration && !controller.signal.aborted
    try {
      const { ok, body } = await queryCustomerSignup(
        customerVerificationCode.value,
        customerForm.whatsapp,
        controller.signal,
      )
      if (!isCurrent()) return
      if (ok && body.verified === true) {
        customerVerificationComplete.value = true
        if (body.name?.trim()) customerForm.name = body.name.trim()
        customerStatus.value = `WhatsApp confirmado! ${body.name?.trim() ? `Bem-vindo(a), ${body.name.trim().split(/\s+/)[0]}!` : 'Cadastro ativo.'}`
        return
      }
      if (ok && body.expired) {
        customerStatus.value =
          'O link de confirmação expirou. Volte ao formulário e inicie o cadastro novamente.'
        customerVerificationLink.value = ''
        return
      }
    } catch {
      // Falhas momentâneas de rede não interrompem a verificação automática.
    } finally {
      if (verificationRequest === controller) verificationRequest = undefined
    }
    if (!isCurrent()) return
    if (Date.now() - customerVerificationPollStartedAt >= 15 * 60 * 1000) {
      customerStatus.value =
        'O prazo de confirmação terminou. Confira seus dados e envie um novo cadastro para gerar outro link.'
      customerVerificationLink.value = ''
      return
    }
    scheduleCustomerVerificationPoll()
  }

  async function continueSignupContact() {
    customerStatus.value = ''
    const contact = signupContact.value.trim()
    if (contact.includes('@')) {
      const email = contact.toLowerCase()
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        customerStatus.value = 'Informe um e-mail válido.'
        return
      }
      customerForm.email = email
    } else {
      const phone = normalizeBrazilianPhone(contact)
      if (!phone) {
        customerStatus.value = 'Informe um WhatsApp com DDD ou um e-mail válido.'
        return
      }
      customerForm.whatsapp = phone
      customerForm.name = ''
      customerForm.email = ''
      // O nome vem da confirmação realizada pela Beta.
      await sendCustomerSignup()
      return
    }
    signupStep.value = 2
    void nextTick(() => document.getElementById('customer-name')?.focus())
  }

  async function sendCustomerSignup() {
    if (disposed || customerSubmitting.value) return
    stopCustomerVerification()
    customerStatus.value = ''
    customerVerificationLink.value = ''
    customerVerificationCode.value = ''
    customerVerificationComplete.value = false
    customerVerificationPollStartedAt = 0
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    const name = customerForm.name.trim().replace(/\s+/g, ' ')
    const whatsapp = normalizeBrazilianPhone(customerForm.whatsapp)
    const email = customerForm.email.trim().toLowerCase()
    if (name && (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name))) {
      customerStatus.value = 'Informe um nome válido.'
      return
    }
    if (!whatsapp) {
      customerStatus.value = 'Informe um WhatsApp válido com DDD.'
      return
    }
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      customerStatus.value = 'Informe um e-mail válido.'
      return
    }

    const generation = verificationGeneration
    const controller = new AbortController()
    registrationRequest = controller
    const isCurrent = () =>
      !disposed && generation === verificationGeneration && !controller.signal.aborted
    customerSubmitting.value = true
    customerStatus.value = 'Registrando seu cadastro…'
    try {
      const verificationCode = await registerCustomer({ name, whatsapp, email }, controller.signal)
      if (!isCurrent()) return
      const message = `Confirmar cadastro FitPeso ${verificationCode}\nWhatsApp: ${whatsapp}${name ? `\nNome: ${name}` : ''}`
      customerVerificationCode.value = verificationCode
      customerVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(message)}`
      customerStatus.value = name
        ? 'Envie a mensagem para a Beta e volte a esta tela para confirmar seu cadastro.'
        : 'Envie a mensagem para a Beta. Ela identificará o nome exibido no seu WhatsApp e o encaminhará com o número e o código para concluir o cadastro.'
      customerVerificationPollStartedAt = Date.now()
      scheduleCustomerVerificationPoll(1_000)
    } catch (error) {
      if (!isCurrent()) return
      customerStatus.value =
        error instanceof Error ? error.message : 'Não foi possível registrar o cadastro agora.'
    } finally {
      if (registrationRequest === controller) registrationRequest = undefined
      customerSubmitting.value = false
    }
  }
  function stopCustomerVerification() {
    verificationGeneration += 1
    if (customerVerificationPollTimer !== undefined)
      window.clearTimeout(customerVerificationPollTimer)
    customerVerificationPollTimer = undefined
    registrationRequest?.abort()
    verificationRequest?.abort()
    verificationRequest = undefined
  }
  function closeCustomerSignup() {
    stopCustomerVerification()
    customerStatus.value = ''
    customerVerificationLink.value = ''
    customerVerificationCode.value = ''
    const confirmed = customerVerificationComplete.value
    customerVerificationComplete.value = false
    options.onClose(confirmed)
  }
  if (options.active)
    watch(
      options.active,
      (active) => {
        if (!active) stopCustomerVerification()
      },
      { flush: 'sync' },
    )
  onScopeDispose(() => {
    disposed = true
    stopCustomerVerification()
  })
  return {
    customerForm,
    signupContact,
    signupStep,
    customerStatus,
    customerVerificationLink,
    customerVerificationCode,
    customerVerificationComplete,
    customerSubmitting,
    pollCustomerVerification,
    continueSignupContact,
    sendCustomerSignup,
    closeCustomerSignup,
    stopCustomerVerification,
  }
}
