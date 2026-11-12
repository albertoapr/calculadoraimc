import { onScopeDispose, watch, type Ref } from 'vue'
import { useRouter, type Router } from 'vue-router'

export type PublicRoute = 'home' | 'public-trainers'

/** Synchronize public screens without remounting pending login or request flows. */
export function bindPublicNavigation<T extends string>(
  router: Router,
  viewMode: Ref<T>,
  onDirectoryOpen: () => void,
  onHomeOpen: () => void,
) {
  let handlingHistory = false
  const removeHook = router.afterEach((to) => {
    handlingHistory = true
    try {
      if (to.path === '/profissionais' && viewMode.value !== 'public-trainers') onDirectoryOpen()
      if (to.path === '/' && viewMode.value === 'public-trainers') onHomeOpen()
    } finally {
      handlingHistory = false
    }
  })
  const stop = watch(
    viewMode,
    (mode, previous) => {
      if (handlingHistory) return
      if (mode === 'public-trainers' && router.currentRoute.value.path !== '/profissionais') {
        void router.push('/profissionais')
      } else if (
        mode === 'home' &&
        previous === 'public-trainers' &&
        router.currentRoute.value.path === '/profissionais'
      ) {
        void router.push('/')
      }
    },
    { flush: 'sync' },
  )
  return () => {
    stop()
    removeHook()
  }
}

export function usePublicNavigation<T extends string>(
  viewMode: Ref<T>,
  onDirectoryOpen: () => void,
  onHomeOpen: () => void,
) {
  onScopeDispose(bindPublicNavigation(useRouter(), viewMode, onDirectoryOpen, onHomeOpen))
}
