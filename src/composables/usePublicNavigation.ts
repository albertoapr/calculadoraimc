import { onMounted, onUnmounted, watch, type Ref } from 'vue'

export type PublicRoute = 'home' | 'public-trainers'

/**
 * Keep public URLs and the existing view-mode navigation in sync.
 * This is a compatibility layer until the legacy views migrate to Vue Router.
 */
export function usePublicNavigation<T extends string>(viewMode: Ref<T>, onDirectoryOpen: () => void, onHomeOpen: () => void) {
  let handlingHistory = false

  function syncFromLocation() {
    const route: PublicRoute = window.location.pathname.replace(/\/$/, '') === '/profissionais' ? 'public-trainers' : 'home'
    handlingHistory = true
    try {
      if (route === 'public-trainers' && viewMode.value !== 'public-trainers') onDirectoryOpen()
      if (route === 'home' && viewMode.value === 'public-trainers') onHomeOpen()
    } finally {
      handlingHistory = false
    }
  }

  watch(viewMode, mode => {
    if (handlingHistory) return
    // Only public navigation changes the browser URL. Private views keep their legacy flow.
    if (mode === 'public-trainers' && window.location.pathname !== '/profissionais') {
      window.history.pushState(null, '', '/profissionais')
    }
  })

  onMounted(() => window.addEventListener('popstate', syncFromLocation))
  onUnmounted(() => window.removeEventListener('popstate', syncFromLocation))
}
