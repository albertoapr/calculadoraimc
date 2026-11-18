import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useRouter, type Router, type RouteLocationNormalizedLoaded } from 'vue-router'
import type { AppViewMode } from '../types/navigation'
import {
  pathForLegacyHash,
  pathForScreen,
  screenForPath,
  screenRoutes,
  safeReturnPath,
  type AppScreen,
} from '../router/screens'

type NavigationOptions = {
  viewMode: Ref<AppViewMode>
  showCustomerLogin: Ref<boolean>
  showCustomerSignup: Ref<boolean>
  showTrainerSignup: Ref<boolean>
  showRequestForm: Ref<boolean>
  requestLoginReturn: Ref<boolean>
  loginAsTrainer: Ref<boolean>
  sessionRestoring: Ref<boolean>
  customerSignedInName: Ref<string>
  trainerSignedInId: Ref<string>
  customerIsAdmin: Ref<boolean>
  onEnter: (screen: AppScreen) => unknown
}

export function bindApplicationNavigation(router: Router, options: NavigationOptions) {
  const navigationPending = ref(false)
  let applyingRoute = false
  let lastAppliedPath = ''
  let generation = 0
  let disposed = false
  const currentScreen = computed<AppScreen>(() =>
    options.showTrainerSignup.value
      ? 'trainer-signup'
      : options.showCustomerSignup.value
        ? 'customer-signup'
        : options.showCustomerLogin.value
          ? 'login'
          : options.viewMode.value,
  )
  const ready = () =>
    new Promise<void>((resolve) => {
      if (!options.sessionRestoring.value) {
        resolve()
        return
      }
      const stop = watch(options.sessionRestoring, (restoring) => {
        if (!restoring) {
          stop()
          resolve()
        }
      })
    })

  async function applyRoute(to: RouteLocationNormalizedLoaded, initial = false) {
    const id = ++generation
    const legacy = pathForLegacyHash(to.hash)
    if (legacy) {
      await router.replace({ path: legacy, query: to.query })
      return
    }
    const screen = screenForPath(to.path)
    const access = screenRoutes.find((route) => route.path === to.path)?.access ?? 'public'
    navigationPending.value = access !== 'public' && options.sessionRestoring.value
    if (access !== 'public') await ready()
    if (disposed || id !== generation) return
    const customer = Boolean(options.customerSignedInName.value)
    const trainer = Boolean(options.trainerSignedInId.value)
    const authenticated = customer || trainer
    const permitted =
      access === 'public' ||
      (access === 'customer' && customer) ||
      (access === 'trainer' && trainer) ||
      (access === 'account' && authenticated) ||
      (access === 'admin' && customer && options.customerIsAdmin.value)
    if (!permitted) {
      if (authenticated) {
        await router.replace('/')
      } else {
        options.loginAsTrainer.value = access === 'trainer'
        await router.replace({ path: '/entrar', query: { redirect: to.fullPath } })
      }
      return
    }
    applyingRoute = true
    // Uma troca entre academias mantém a mesma tela lógica, mas muda seus dados.
    const changed =
      initial ||
      currentScreen.value !== screen ||
      (screen === 'public-trainers' && to.path !== lastAppliedPath)
    lastAppliedPath = to.path
    options.showTrainerSignup.value = screen === 'trainer-signup'
    options.showCustomerSignup.value = screen === 'customer-signup'
    options.showCustomerLogin.value = screen === 'login'
    options.showRequestForm.value = screen === 'contact' || screen === 'select-trainers'
    if (
      !['login', 'customer-signup', 'trainer-signup', 'contact', 'select-trainers'].includes(screen)
    ) {
      options.requestLoginReturn.value = false
    }
    if (screen === 'login') {
      const target = safeReturnPath(to.query.redirect)
      if (target.startsWith('/solicitar-treinamento')) options.requestLoginReturn.value = true
    } else if (screen !== 'trainer-signup' && screen !== 'customer-signup') {
      options.viewMode.value = screen
    }
    if (changed) void options.onEnter(screen)
    await nextTick()
    if (id === generation) {
      applyingRoute = false
      navigationPending.value = false
    }
  }

  const removeHook = router.afterEach((to, _from, failure) => {
    if (!failure) void applyRoute(to)
  })
  const stopStateWatch = watch(
    currentScreen,
    (screen) => {
      if (disposed || applyingRoute || navigationPending.value) return
      const current = router.currentRoute.value
      const path = pathForScreen(screen, current.path)
      if (path === current.path) return
      const redirect =
        safeReturnPath(current.query.redirect) ||
        (options.requestLoginReturn.value ? '/solicitar-treinamento' : '')
      const authentication = ['login', 'customer-signup', 'trainer-signup'].includes(screen)
      const query = authentication && redirect ? { redirect } : undefined
      void router.push({ path, query })
    },
    { flush: 'post' },
  )

  void applyRoute(router.currentRoute.value, true)
  function stop() {
    disposed = true
    generation += 1
    stopStateWatch()
    removeHook()
  }
  return { navigationPending, stop }
}

export function useApplicationNavigation(options: NavigationOptions) {
  const navigation = bindApplicationNavigation(useRouter(), options)
  onScopeDispose(navigation.stop)
  return { navigationPending: navigation.navigationPending }
}
