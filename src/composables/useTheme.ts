import { ref, watch } from 'vue'
import type { Theme } from '../types/domain'

export function useTheme() {
  function readStoredTheme(): Theme {
    try {
      return localStorage.getItem('beta-imc-theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  }
  const theme = ref<Theme>(readStoredTheme())
  watch(
    theme,
    (value) => {
      document.documentElement.dataset.theme = value
      try {
        localStorage.setItem('beta-imc-theme', value)
      } catch {
        // Keep the in-memory selection if browser storage is unavailable.
      }
    },
    { immediate: true },
  )

  return { theme }
}
