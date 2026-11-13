import { computed, nextTick, onUnmounted, ref, type Ref } from 'vue'
import { normalizeBrazilianPhone, normalizeContactIdentifier } from '../utils/validation'
import {
  loadCustomerProfile,
  loadTrainerSession,
  queryWhatsAppSession,
  startWhatsAppSession,
  startEmailSession,
  queryEmailSession,
  verifyEmailSession,
} from '../services/authenticationService'
import type {
  PendingWhatsAppLogin,
  CustomerAccountProfile,
  TrainerAccountProfile,
} from '../types/domain'

export type AuthenticationOptions = {
  initialRole: string
  showCustomerSignup: Ref<boolean>
  showTrainerSignup: Ref<boolean>
  saveRole: (role: 'customer' | 'trainer') => void
  applyCustomerProfile: (profile: CustomerAccountProfile) => void
  applyTrainerSession: (profile: TrainerAccountProfile) => void
  renderGoogleButton: (target: 'client') => Promise<void>
  goHome: () => void
  returnToRequestFormAfterLogin: () => Promise<void>
  replaceUrl: (url: string) => unknown
}

export function useAuthentication(options: AuthenticationOptions) {
  let disposed = false
  const {
    showCustomerSignup,
    showTrainerSignup,
    applyCustomerProfile,
    applyTrainerSession,
    renderGoogleButton,
    goHome,
    returnToRequestFormAfterLogin,
  } = options
  const showCustomerLogin = ref(false)

  const loginAsTrainer = ref(options.initialRole === 'trainer')

  const customerLoginStatus = ref('')

  const customerLoginError = ref('')

  const customerLoginMethod = ref<'google' | 'whatsapp'>('google')

  const loginIdentifier = ref('')

  const loginStep = ref<1 | 2>(1)

  const loginIdentifierKind = ref<'whatsapp' | 'email'>('whatsapp')

  const emailLoginPending = ref(false)

  const emailLoginSubmitting = ref(false)

  const emailLoginError = ref('')

  const emailLoginSessionToken = ref('')

  let emailLoginPollTimer: number | undefined

  let emailLoginStartedAt = 0

  const customerLoginWhatsApp = ref('')

  const customerLoginCode = ref('')

  const customerLoginSessionToken = ref('')

  const customerLoginVerificationLink = ref('')

  const showCustomerLoginDialog = ref(false)

  const customerLoginSubmitting = ref(false)

  const trainerLoginCode = ref('')

  const trainerLoginToken = ref('')

  const trainerLoginStatus = ref('')

  const trainerLoginError = ref('')

  const trainerLoginLink = ref('')

  const trainerLoginDialog = ref(false)

  const trainerLoginSubmitting = ref(false)

  const requestLoginReturn = ref(false)

  // The progress measures a fifteen-second waiting window, never authentication success.

  const pendingWhatsAppKey = 'fitpeso-pending-whatsapp-login'
  const whatsappProgressDurationMs = 15_000
  const pendingWhatsAppLogin = ref<PendingWhatsAppLogin | null>(null)
  const whatsappClock = ref(Date.now())
  const whatsappChecking = ref(false)
  const whatsappConfirmed = ref(false)
  const whatsappNetworkError = ref(false)
  const whatsappProgressStartedAt = computed(
    () => pendingWhatsAppLogin.value?.progressStartedAt ?? 0,
  )
  const whatsappProgress = computed(() =>
    whatsappConfirmed.value
      ? 100
      : whatsappProgressStartedAt.value
        ? Math.min(
            100,
            Math.max(
              0,
              Math.floor(
                ((whatsappClock.value - whatsappProgressStartedAt.value) /
                  whatsappProgressDurationMs) *
                  100,
              ),
            ),
          )
        : 0,
  )
  const whatsappSecondsRemaining = computed(() =>
    Math.max(
      0,
      Math.ceil(
        (whatsappProgressDurationMs - (whatsappClock.value - whatsappProgressStartedAt.value)) /
          1000,
      ),
    ),
  )
  let whatsappCheckTimer: number | undefined
  let whatsappClockTimer: number | undefined
  let whatsappRequest: AbortController | undefined
  let whatsappAttemptGeneration = 0
  let whatsappLeftPage = false

  function persistWhatsAppAttempt() {
    try {
      if (pendingWhatsAppLogin.value)
        sessionStorage.setItem(pendingWhatsAppKey, JSON.stringify(pendingWhatsAppLogin.value))
      else sessionStorage.removeItem(pendingWhatsAppKey)
    } catch {
      /* The current attempt still works when storage is unavailable. */
    }
  }

  function stopWhatsAppTimers() {
    window.clearTimeout(whatsappCheckTimer)
    window.clearInterval(whatsappClockTimer)
    whatsappCheckTimer = undefined
    whatsappClockTimer = undefined
  }

  function clearPendingWhatsAppLogin() {
    whatsappAttemptGeneration += 1
    stopWhatsAppTimers()
    whatsappRequest?.abort()
    whatsappRequest = undefined
    pendingWhatsAppLogin.value = null
    whatsappChecking.value = false
    whatsappConfirmed.value = false
    whatsappNetworkError.value = false
    whatsappLeftPage = false
    persistWhatsAppAttempt()
  }

  function saveNewWhatsAppAttempt(
    role: PendingWhatsAppLogin['role'],
    whatsapp: string,
    code: string,
    token: string,
    expiresAt?: number,
  ) {
    clearPendingWhatsAppLogin()
    pendingWhatsAppLogin.value = {
      role,
      whatsapp,
      code,
      token,
      expiresAt: expiresAt ? expiresAt * 1000 : Date.now() + 15 * 60_000,
      progressStartedAt: 0,
      awaitingReturn: false,
    }
    persistWhatsAppAttempt()
    startWhatsAppClock()
  }

  function expireWhatsAppAttempt() {
    const role = pendingWhatsAppLogin.value?.role
    clearPendingWhatsAppLogin()
    if (role === 'trainer') {
      trainerLoginCode.value = ''
      trainerLoginToken.value = ''
      trainerLoginDialog.value = false
      trainerLoginError.value = 'O código expirou. Inicie o login novamente.'
    } else {
      customerLoginCode.value = ''
      customerLoginSessionToken.value = ''
      showCustomerLoginDialog.value = false
      customerLoginError.value = 'O código expirou. Inicie o login novamente.'
    }
  }

  function startWhatsAppClock() {
    window.clearInterval(whatsappClockTimer)
    whatsappClock.value = Date.now()
    if (disposed || document.hidden) return
    whatsappClockTimer = window.setInterval(() => {
      whatsappClock.value = Date.now()
      if (pendingWhatsAppLogin.value && Date.now() >= pendingWhatsAppLogin.value.expiresAt)
        expireWhatsAppAttempt()
    }, 100)
  }

  function scheduleWhatsAppLoginCheck(delay = 3000) {
    window.clearTimeout(whatsappCheckTimer)
    if (disposed || !pendingWhatsAppLogin.value || document.hidden) return
    whatsappCheckTimer = window.setTimeout(() => void checkPendingWhatsAppLogin(), delay)
  }

  function markWhatsAppOpened() {
    if (!pendingWhatsAppLogin.value) return
    pendingWhatsAppLogin.value.awaitingReturn = true
    whatsappLeftPage = false
    persistWhatsAppAttempt()
  }
  function onWhatsAppBlur() {
    if (pendingWhatsAppLogin.value?.awaitingReturn) whatsappLeftPage = true
  }
  function onWhatsAppVisibilityChange() {
    if (document.hidden) {
      onWhatsAppBlur()
      stopWhatsAppTimers()
    } else onWhatsAppReturn()
  }
  function onWhatsAppReturn() {
    const attempt = pendingWhatsAppLogin.value
    if (!attempt || document.hidden) return
    if (attempt.awaitingReturn && whatsappLeftPage) {
      attempt.progressStartedAt = Date.now()
      attempt.awaitingReturn = false
      whatsappLeftPage = false
      persistWhatsAppAttempt()
    }
    startWhatsAppClock()
    void checkPendingWhatsAppLogin()
  }

  function restoreWhatsAppAttempt() {
    try {
      const raw = sessionStorage.getItem(pendingWhatsAppKey)
      if (!raw) return
      const a = JSON.parse(raw) as PendingWhatsAppLogin
      if (
        !a ||
        !['customer', 'trainer'].includes(a.role) ||
        !/^\+55\d{10,11}$/.test(a.whatsapp) ||
        !/^[A-Za-z0-9_-]{22}$/.test(a.code) ||
        !/^[A-Za-z0-9_-]{43}$/.test(a.token) ||
        !Number.isFinite(a.expiresAt) ||
        !Number.isFinite(a.progressStartedAt) ||
        a.progressStartedAt < 0 ||
        a.progressStartedAt > Date.now() ||
        typeof a.awaitingReturn !== 'boolean' ||
        a.expiresAt > Date.now() + 15 * 60_000
      ) {
        sessionStorage.removeItem(pendingWhatsAppKey)
        return
      }
      pendingWhatsAppLogin.value = a
      showCustomerLogin.value = true
      showCustomerSignup.value = false
      showTrainerSignup.value = false
      loginAsTrainer.value = a.role === 'trainer'
      loginIdentifierKind.value = 'whatsapp'
      loginIdentifier.value = a.whatsapp
      customerLoginWhatsApp.value = a.whatsapp
      loginStep.value = 2
      customerLoginMethod.value = 'whatsapp'
      const link =
        'https://wa.me/5521971118383?text=' +
        encodeURIComponent(`Confirmar login FitPeso ${a.code}\nWhatsApp: ${a.whatsapp}`)
      if (a.role === 'trainer') {
        trainerLoginCode.value = a.code
        trainerLoginToken.value = a.token
        trainerLoginLink.value = link
        trainerLoginDialog.value = true
      } else {
        customerLoginCode.value = a.code
        customerLoginSessionToken.value = a.token
        customerLoginVerificationLink.value = link
        showCustomerLoginDialog.value = true
      }
      if (Date.now() >= a.expiresAt) {
        expireWhatsAppAttempt()
        return
      }
      // Reloading after opening WhatsApp is also a return; an existing timer is preserved.
      whatsappLeftPage = a.awaitingReturn
      onWhatsAppReturn()
    } catch {
      clearPendingWhatsAppLogin()
    }
  }

  async function checkPendingWhatsAppLogin() {
    const attempt = pendingWhatsAppLogin.value
    if (
      disposed ||
      !attempt ||
      document.hidden ||
      whatsappChecking.value ||
      whatsappConfirmed.value
    )
      return
    if (Date.now() >= attempt.expiresAt) {
      expireWhatsAppAttempt()
      return
    }
    window.clearTimeout(whatsappCheckTimer)
    const controller = new AbortController()
    whatsappRequest = controller
    whatsappChecking.value = true
    const isCurrent = () =>
      !disposed && pendingWhatsAppLogin.value === attempt && !controller.signal.aborted
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    try {
      const { ok, body } = await queryWhatsAppSession(
        attempt.role,
        { whatsapp: attempt.whatsapp, code: attempt.code, sessionToken: attempt.token },
        controller.signal,
      )
      if (!isCurrent()) return
      if (!ok) throw new Error('Status unavailable')
      whatsappNetworkError.value = false
      if (body.expired) {
        expireWhatsAppAttempt()
        return
      }
      if (body.authenticated) {
        whatsappConfirmed.value = true
        window.clearInterval(whatsappClockTimer)
        if (attempt.role === 'trainer') {
          const profile = await loadTrainerSession(attempt.token, controller.signal)
          if (!isCurrent()) return
          try {
            sessionStorage.setItem('fitpeso-trainer-session', attempt.token)
          } catch {
            /* Session remains in memory. */
          }
          applyTrainerSession(profile)
          trainerLoginDialog.value = false
          showCustomerLogin.value = false
          clearPendingWhatsAppLogin()
          trainerLoginCode.value = ''
          trainerLoginToken.value = ''
          goHome()
        } else {
          const profile = await loadCustomerProfile(attempt.token, controller.signal)
          if (!isCurrent()) return
          try {
            sessionStorage.setItem('fitpeso-customer-session', attempt.token)
            sessionStorage.removeItem('fitpeso-google-session')
          } catch {
            /* Session remains in memory. */
          }
          applyCustomerProfile(profile)
          customerLoginError.value = ''
          customerLoginStatus.value = 'WhatsApp confirmado! Seus dados foram carregados.'
          showCustomerLoginDialog.value = false
          showCustomerLogin.value = false
          clearPendingWhatsAppLogin()
          customerLoginCode.value = ''
          customerLoginSessionToken.value = ''
          await returnToRequestFormAfterLogin()
        }
      } else if (body.confirmed) {
        returnToLoginIdentifier()
        customerLoginError.value =
          'Não foi possível confirmar o login. Confira o WhatsApp e tente novamente.'
      }
    } catch {
      if (!disposed && pendingWhatsAppLogin.value === attempt) {
        whatsappNetworkError.value = true
        whatsappConfirmed.value = false
        startWhatsAppClock()
      }
    } finally {
      window.clearTimeout(timeout)
      if (whatsappRequest === controller) {
        whatsappRequest = undefined
        whatsappChecking.value = false
        if (pendingWhatsAppLogin.value === attempt && controller.signal.aborted) {
          whatsappNetworkError.value = true
          whatsappConfirmed.value = false
          startWhatsAppClock()
        }
        scheduleWhatsAppLoginCheck()
      }
    }
  }

  function changeLoginProfile() {
    if (!requestLoginReturn.value) options.saveRole(loginAsTrainer.value ? 'trainer' : 'customer')
    clearPendingWhatsAppLogin()
    loginStep.value = 1
    emailLoginPending.value = false
    emailLoginError.value = ''
    if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
    emailLoginPollTimer = undefined
    // A escolha é explícita: nunca inferir o papel apenas pelo número de WhatsApp.
    customerLoginMethod.value = 'whatsapp'
    customerLoginError.value = ''
    customerLoginStatus.value = ''
    trainerLoginError.value = ''
    trainerLoginStatus.value = ''
    showCustomerLoginDialog.value = false
    trainerLoginDialog.value = false
    customerLoginCode.value = ''
    trainerLoginCode.value = ''
  }

  async function startTrainerWhatsAppLogin() {
    if (trainerLoginSubmitting.value) return
    const whatsapp = normalizeBrazilianPhone(customerLoginWhatsApp.value)
    if (!whatsapp) {
      trainerLoginError.value = 'Informe um WhatsApp válido com DDD.'
      return
    }
    trainerLoginSubmitting.value = true
    trainerLoginError.value = ''
    trainerLoginStatus.value = 'Preparando acesso…'
    const generation = whatsappAttemptGeneration
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const { ok, body } = await startWhatsAppSession('trainer', { whatsapp, sessionToken: token })
      if (generation !== whatsappAttemptGeneration) return
      if (!ok || !body.started || !body.verificationCode)
        throw new Error(body.error || 'Não foi possível iniciar o login.')
      trainerLoginCode.value = body.verificationCode
      trainerLoginToken.value = token
      trainerLoginLink.value =
        'https://wa.me/5521971118383?text=' +
        encodeURIComponent(
          'Confirmar login FitPeso ' + body.verificationCode + '\nWhatsApp: ' + whatsapp,
        )
      trainerLoginDialog.value = true
      saveNewWhatsAppAttempt('trainer', whatsapp, body.verificationCode, token, body.expiresAt)
      trainerLoginStatus.value =
        'Toque no botão da janela para enviar a mensagem à Beta pelo WhatsApp. Depois, aguarde a confirmação automática.'
      scheduleWhatsAppLoginCheck(1000)
    } catch (error) {
      trainerLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login.'
      trainerLoginStatus.value = ''
    } finally {
      trainerLoginSubmitting.value = false
    }
  }

  async function pollTrainerWhatsAppLogin() {
    await checkPendingWhatsAppLogin()
  }

  function scheduleCustomerLoginPoll(delayMs = 3_000) {
    scheduleWhatsAppLoginCheck(delayMs)
  }

  async function pollCustomerLogin() {
    await checkPendingWhatsAppLogin()
  }

  async function startCustomerWhatsAppLogin() {
    if (customerLoginSubmitting.value) return
    customerLoginStatus.value = ''
    customerLoginError.value = ''
    const whatsapp = normalizeBrazilianPhone(customerLoginWhatsApp.value)
    if (!whatsapp) {
      customerLoginError.value = 'Informe um WhatsApp válido com DDD.'
      return
    }
    customerLoginSubmitting.value = true
    customerLoginStatus.value = 'Preparando o acesso…'
    const generation = whatsappAttemptGeneration
    try {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32))
      const sessionToken = btoa(
        Array.from(randomBytes, (byte) => String.fromCharCode(byte)).join(''),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
      const { ok, body } = await startWhatsAppSession('customer', { whatsapp, sessionToken })
      if (generation !== whatsappAttemptGeneration) return
      if (!ok || body.started !== true || !body.verificationCode)
        throw new Error(body.error || 'Não foi possível iniciar o login agora.')
      customerLoginWhatsApp.value = whatsapp
      customerLoginCode.value = body.verificationCode
      customerLoginSessionToken.value = sessionToken
      customerLoginVerificationLink.value = `https://wa.me/5521971118383?text=${encodeURIComponent(`Confirmar login FitPeso ${body.verificationCode}\nWhatsApp: ${whatsapp}`)}`
      saveNewWhatsAppAttempt(
        'customer',
        whatsapp,
        body.verificationCode,
        sessionToken,
        body.expiresAt,
      )
      customerLoginStatus.value =
        'Envie o código pelo WhatsApp. Depois, mantenha esta tela aberta: o login será confirmado automaticamente.'
      showCustomerLoginDialog.value = true
      scheduleCustomerLoginPoll(1_000)
    } catch (error) {
      customerLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login agora.'
      customerLoginStatus.value = ''
    } finally {
      customerLoginSubmitting.value = false
    }
  }

  function continueLoginIdentifier() {
    emailLoginError.value = ''
    customerLoginError.value = ''
    trainerLoginError.value = ''
    const contact = normalizeContactIdentifier(loginIdentifier.value)
    if (!contact) {
      emailLoginError.value = loginIdentifier.value.includes('@')
        ? 'Informe um endereço de e-mail válido.'
        : 'Informe um WhatsApp com DDD ou um e-mail válido.'
      return
    }
    if (contact.kind === 'email') {
      loginIdentifier.value = contact.value
      loginIdentifierKind.value = 'email'
    } else {
      loginIdentifierKind.value = 'whatsapp'
      customerLoginWhatsApp.value = contact.value
      loginIdentifier.value = contact.value
    }
    loginStep.value = 2
    void nextTick(() => document.getElementById('login-confirm-action')?.focus())
  }

  function returnToLoginIdentifier() {
    clearPendingWhatsAppLogin()
    loginStep.value = 1
    emailLoginPending.value = false
    emailLoginError.value = ''
    customerLoginError.value = ''
    trainerLoginError.value = ''
    if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
    emailLoginPollTimer = undefined
    showCustomerLoginDialog.value = false
    trainerLoginDialog.value = false
    emailLoginSessionToken.value = ''
    customerLoginCode.value = ''
    trainerLoginCode.value = ''
    void nextTick(() => {
      document.getElementById('login-identifier')?.focus()
      void renderGoogleButton('client')
    })
  }

  async function submitIdentityLogin() {
    if (loginIdentifierKind.value === 'email') {
      await startEmailLogin()
    } else if (loginAsTrainer.value) {
      await startTrainerWhatsAppLogin()
    } else {
      await startCustomerWhatsAppLogin()
    }
  }

  async function startEmailLogin() {
    if (disposed || emailLoginSubmitting.value || emailLoginPending.value) return
    emailLoginError.value = ''
    emailLoginSubmitting.value = true
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const { ok, body } = await startEmailSession({
        email: loginIdentifier.value,
        sessionToken: token,
        asTrainer: loginAsTrainer.value,
      })
      if (disposed) return
      if (!ok || body.started !== true)
        throw new Error(body.error || 'Não foi possível enviar a confirmação.')
      emailLoginSessionToken.value = token
      emailLoginPending.value = true
      emailLoginStartedAt = Date.now()
      scheduleEmailLoginPoll(1500)
    } catch (error) {
      emailLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível iniciar o login por e-mail.'
    } finally {
      emailLoginSubmitting.value = false
    }
  }

  function scheduleEmailLoginPoll(delayMs = 3000) {
    if (disposed) return
    if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
    emailLoginPollTimer = window.setTimeout(() => void pollEmailLogin(), delayMs)
  }

  async function pollEmailLogin() {
    if (
      disposed ||
      !showCustomerLogin.value ||
      !emailLoginPending.value ||
      !emailLoginSessionToken.value
    )
      return
    const token = emailLoginSessionToken.value
    const trainer = loginAsTrainer.value
    try {
      const { ok, body } = await queryEmailSession(token, trainer ? 'trainer' : 'customer')
      if (disposed) return
      if (ok && body.authenticated === true) {
        if (trainer) {
          const profile = await loadTrainerSession(token)
          if (disposed) return
          sessionStorage.setItem('fitpeso-trainer-session', token)
          applyTrainerSession(profile)
        } else {
          const profile = await loadCustomerProfile(token)
          if (disposed) return
          sessionStorage.setItem('fitpeso-customer-session', token)
          sessionStorage.removeItem('fitpeso-google-session')
          applyCustomerProfile(profile)
        }
        emailLoginPending.value = false
        emailLoginPollTimer = undefined
        showCustomerLogin.value = false
        if (!trainer && requestLoginReturn.value) {
          await returnToRequestFormAfterLogin()
        } else {
          goHome()
        }
        return
      }
    } catch {
      // Erros transitórios não interrompem a confirmação.
    }
    if (Date.now() - emailLoginStartedAt > 15 * 60 * 1000) {
      emailLoginPending.value = false
      emailLoginError.value = 'O link expirou. Volte e solicite outro acesso por e-mail.'
      emailLoginPollTimer = undefined
      return
    }
    scheduleEmailLoginPoll()
  }

  function closeCustomerLogin() {
    showCustomerLoginDialog.value = false
    goHome()
  }

  async function finishEmailLoginFromLink() {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('emailLoginCode')
    if (!code) return
    // Remove the one-time code from history before making network requests.
    url.searchParams.delete('emailLoginCode')
    void options.replaceUrl(url.pathname + url.search + url.hash)
    try {
      const { ok, body: result } = await verifyEmailSession(code)
      if (disposed) return
      if (!ok || !result.authenticated || !result.sessionToken)
        throw new Error(result.error || 'Não foi possível confirmar o e-mail.')
      const token = result.sessionToken
      if (result.role === 'trainer') {
        const profile = await loadTrainerSession(token)
        if (disposed) return
        sessionStorage.setItem('fitpeso-trainer-session', token)
        applyTrainerSession(profile)
      } else {
        const profile = await loadCustomerProfile(token)
        if (disposed) return
        sessionStorage.setItem('fitpeso-customer-session', token)
        sessionStorage.removeItem('fitpeso-google-session')
        applyCustomerProfile(profile)
      }
      emailLoginPending.value = false
      showCustomerLogin.value = false
      goHome()
    } catch (error) {
      emailLoginError.value =
        error instanceof Error ? error.message : 'Não foi possível confirmar o login.'
      showCustomerLogin.value = true
    }
  }
  function stopEmailLoginPoll() {
    if (emailLoginPollTimer !== undefined) window.clearTimeout(emailLoginPollTimer)
    emailLoginPollTimer = undefined
  }
  function startAuthentication() {
    restoreWhatsAppAttempt()
    document.addEventListener('visibilitychange', onWhatsAppVisibilityChange)
    window.addEventListener('focus', onWhatsAppReturn)
    window.addEventListener('blur', onWhatsAppBlur)
  }
  onUnmounted(() => {
    disposed = true
    whatsappAttemptGeneration += 1
    stopEmailLoginPoll()
    stopWhatsAppTimers()
    whatsappRequest?.abort()
    whatsappRequest = undefined
    document.removeEventListener('visibilitychange', onWhatsAppVisibilityChange)
    window.removeEventListener('focus', onWhatsAppReturn)
    window.removeEventListener('blur', onWhatsAppBlur)
  })
  return {
    showCustomerLogin,
    loginAsTrainer,
    customerLoginStatus,
    customerLoginError,
    customerLoginMethod,
    loginIdentifier,
    loginStep,
    loginIdentifierKind,
    emailLoginPending,
    emailLoginSubmitting,
    emailLoginError,
    emailLoginSessionToken,
    customerLoginWhatsApp,
    customerLoginCode,
    customerLoginSessionToken,
    customerLoginVerificationLink,
    showCustomerLoginDialog,
    customerLoginSubmitting,
    trainerLoginCode,
    trainerLoginToken,
    trainerLoginStatus,
    trainerLoginError,
    trainerLoginLink,
    trainerLoginDialog,
    trainerLoginSubmitting,
    requestLoginReturn,
    pendingWhatsAppLogin,
    whatsappChecking,
    whatsappConfirmed,
    whatsappNetworkError,
    whatsappProgressStartedAt,
    whatsappProgress,
    whatsappSecondsRemaining,
    persistWhatsAppAttempt,
    stopWhatsAppTimers,
    clearPendingWhatsAppLogin,
    saveNewWhatsAppAttempt,
    expireWhatsAppAttempt,
    startWhatsAppClock,
    scheduleWhatsAppLoginCheck,
    markWhatsAppOpened,
    onWhatsAppBlur,
    onWhatsAppVisibilityChange,
    onWhatsAppReturn,
    restoreWhatsAppAttempt,
    checkPendingWhatsAppLogin,
    changeLoginProfile,
    startTrainerWhatsAppLogin,
    pollTrainerWhatsAppLogin,
    scheduleCustomerLoginPoll,
    pollCustomerLogin,
    startCustomerWhatsAppLogin,
    continueLoginIdentifier,
    returnToLoginIdentifier,
    submitIdentityLogin,
    startEmailLogin,
    scheduleEmailLoginPoll,
    pollEmailLogin,
    closeCustomerLogin,
    finishEmailLoginFromLink,
    stopEmailLoginPoll,
    startAuthentication,
  }
}
