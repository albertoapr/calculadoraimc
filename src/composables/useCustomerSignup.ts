import { nextTick, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import { startCustomerPhoneSignup, checkCustomerPhoneSignup, finishCustomerPhoneSignup } from '../services/signupService'
import { isValidEmail, isValidPersonName, normalizeBrazilianPhone, normalizeEmail, normalizePersonName } from '../utils/validation'

export function useCustomerSignup(options: {
  onClose: (confirmed: boolean) => void
  onGoogleAuthenticated?: (credential: string) => Promise<void>
  onAuthenticated?: (sessionToken: string, profile: { name: string; whatsapp: string; email: string; dateOfBirth?: string; isAdmin?: boolean }, signal?: AbortSignal) => Promise<void> | void
  active?: Ref<boolean>
}) {
  const customerForm = reactive({ name: '', whatsapp: '', email: '', dateOfBirth: '', sex: '' as '' | 'masculino' | 'feminino', heightCm: undefined as number | undefined })
  const signupContact = ref('')
  const signupGooglePhotoUrl = ref('')
  const signupGoogleCredential = ref('')
  const signupStep = ref<1 | 2>(1)
  const customerStatus = ref('')
  const customerVerificationLink = ref('')
  const customerVerificationCode = ref('')
  const customerVerificationComplete = ref(false)
  const customerPhoneVerified = ref(false)
  const customerSubmitting = ref(false)
  const customerVerificationChecking = ref(false)
  let sessionToken = '', verifiedPhone = '', expiresAt = 0, generation = 0
  let request: AbortController | undefined, timer: number | undefined
  let disposed = false
  function stopCustomerVerification() {
    generation++
    request?.abort()
    request = undefined
    window.clearTimeout(timer)
    timer = undefined
    sessionToken = ''; verifiedPhone = ''; expiresAt = 0
    customerPhoneVerified.value = false
    customerVerificationCode.value = ''
    customerVerificationLink.value = ''
    customerVerificationChecking.value = false
    customerSubmitting.value = false
    signupStep.value = 1
  }
  function schedule(delay = 3000) {
    window.clearTimeout(timer)
    if (!disposed && !document.hidden && customerVerificationLink.value) timer = window.setTimeout(() => void pollCustomerVerification(), delay)
  }
  function expire() {
    stopCustomerVerification()
    customerStatus.value = 'O prazo de confirmação terminou. Clique em Continuar para confirmar novamente.'
  }
  async function pollCustomerVerification() {
    if (disposed || request || !customerVerificationCode.value || !sessionToken || customerPhoneVerified.value || document.hidden) return
    if (Date.now() >= expiresAt) { expire(); return }
    window.clearTimeout(timer)
    const current = generation, controller = new AbortController()
    request = controller
    customerVerificationChecking.value = true
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    try {
      const { ok, body } = await checkCustomerPhoneSignup(customerVerificationCode.value, sessionToken, controller.signal)
      if (disposed || current !== generation || controller.signal.aborted) return
      if (ok && body.expired) { expire(); return }
      if (ok && body.verified && normalizeBrazilianPhone(body.whatsapp ?? '') === verifiedPhone) {
        customerPhoneVerified.value = true
        customerForm.whatsapp = verifiedPhone
        customerForm.name = body.name?.trim() || customerForm.name
        customerVerificationLink.value = ''
        signupStep.value = 2
        customerStatus.value = 'WhatsApp confirmado. Confira seu nome e complete o cadastro.'
        void nextTick(() => document.getElementById('customer-name')?.focus())
      }
    } catch { /* retry when online */ }
    finally {
      window.clearTimeout(timeout)
      if (request === controller) {
        request = undefined
        customerVerificationChecking.value = false
        if (current === generation) schedule()
      }
    }
  }
  async function continueSignupContact() {
    if (disposed || customerSubmitting.value || customerVerificationLink.value) return
    const whatsapp = normalizeBrazilianPhone(signupContact.value)
    if (!whatsapp) { customerStatus.value = 'Informe um WhatsApp válido com DDD.'; return }
    stopCustomerVerification()
    const current = generation, controller = new AbortController()
    request = controller
    customerSubmitting.value = true
    customerStatus.value = 'Preparando confirmação…'
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const challenge = await startCustomerPhoneSignup(whatsapp, token, controller.signal)
      if (disposed || current !== generation || controller.signal.aborted) return
      sessionToken = token
      verifiedPhone = whatsapp
      expiresAt = challenge.expiresAt * 1000
      customerVerificationCode.value = challenge.code
      const message = 'Confirmar cadastro FitPeso ' + challenge.code + '\nWhatsApp: ' + whatsapp
      customerVerificationLink.value = 'https://wa.me/5521971118383?text=' + encodeURIComponent(message)
      customerStatus.value = 'Envie a mensagem à Beta e volte a esta tela.'
      schedule(1500)
    } catch (error) {
      if (current === generation) customerStatus.value = error instanceof Error ? error.message : 'Não foi possível iniciar a confirmação.'
    } finally {
      if (request === controller) { request = undefined; customerSubmitting.value = false }
    }
  }
  async function sendCustomerSignup() {
    if (disposed || customerSubmitting.value || request) return
    if (!customerPhoneVerified.value || !sessionToken || !verifiedPhone) { customerStatus.value = 'Confirme seu WhatsApp primeiro.'; return }
    if (Date.now() >= expiresAt) { expire(); return }
    const name = normalizePersonName(customerForm.name), email = normalizeEmail(customerForm.email)
    if (!isValidPersonName(name)) { customerStatus.value = 'Informe um nome válido.'; return }
    if (!isValidEmail(email, true)) { customerStatus.value = 'Informe um e-mail válido.'; return }
    if (!customerForm.sex) { customerStatus.value = 'Selecione o sexo.'; return }
    const heightCm = customerForm.heightCm
    if (heightCm !== undefined && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250)) { customerStatus.value = 'Informe uma altura válida entre 80 e 250 cm.'; return }
    const current = generation, controller = new AbortController()
    request = controller
    customerSubmitting.value = true
    customerStatus.value = 'Concluindo cadastro…'
    try {
      const token = sessionToken
      const whatsapp = await finishCustomerPhoneSignup({ code: customerVerificationCode.value, sessionToken: token, name, email, sex: customerForm.sex, heightCm }, controller.signal)
      if (disposed || current !== generation || controller.signal.aborted) return
      await options.onAuthenticated?.(token, { name, whatsapp, email }, controller.signal)
      if (disposed || current !== generation || controller.signal.aborted) return
      customerVerificationComplete.value = true
      closeCustomerSignup()
    } catch (error) {
      if (current === generation) customerStatus.value = error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.'
    } finally {
      if (request === controller) { request = undefined; customerSubmitting.value = false }
    }
  }
  function closeCustomerSignup() {
    const confirmed = customerVerificationComplete.value
    stopCustomerVerification()
    signupGooglePhotoUrl.value = ''; signupGoogleCredential.value = ''
    customerStatus.value = ''; customerVerificationComplete.value = false
    options.onClose(confirmed)
  }
  function returnFromWhatsApp() {
    if (!document.hidden && customerVerificationLink.value) void pollCustomerVerification()
    else window.clearTimeout(timer)
  }
  function changeSignupPhone() {
    stopCustomerVerification()
    customerForm.whatsapp = ''
    customerForm.name = ''
    customerStatus.value = ''
  }
  if (typeof window !== 'undefined') window.addEventListener?.('focus', returnFromWhatsApp)
  if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', returnFromWhatsApp)
  if (options.active) watch(options.active, active => { if (!active) stopCustomerVerification() }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    window.removeEventListener?.('focus', returnFromWhatsApp)
    document.removeEventListener?.('visibilitychange', returnFromWhatsApp)
    stopCustomerVerification()
  })
  return { customerForm, signupContact, signupGooglePhotoUrl, signupGoogleCredential, signupStep, customerStatus, customerVerificationLink,
    customerVerificationCode, customerVerificationComplete, customerPhoneVerified, customerVerificationChecking, customerSubmitting,
    pollCustomerVerification, continueSignupContact, sendCustomerSignup, closeCustomerSignup, stopCustomerVerification, changeSignupPhone }
}
