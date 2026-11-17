import { ref, type Ref } from 'vue'
import { loadCustomerProfile, loadTrainerSession } from '../services/authenticationService'
import type { CustomerAccountProfile, TrainerAccountProfile } from '../types/domain'

export function useSessionBootstrap(options: {
  getGeneration: () => number
  customerSignedInName: Ref<string>
  trainerSignedInId: Ref<string>
  trainerSignedInName: Ref<string>
  applyCustomerProfile: (profile: CustomerAccountProfile) => void
  applyTrainerSession: (profile: TrainerAccountProfile) => void
}) {
  const sessionRestoring = ref(true)

  async function restoreTrainerSession() {
    try {
      const token = sessionStorage.getItem('fitpeso-trainer-session')
      if (!token) return
      const generation = options.getGeneration()
      await loadTrainerSession(token)
        .then((profile) => {
          if (
            options.getGeneration() === generation &&
            sessionStorage.getItem('fitpeso-trainer-session') === token
          )
            options.applyTrainerSession(profile)
        })
        .catch(() => {
          if (options.getGeneration() !== generation) return
          sessionStorage.removeItem('fitpeso-trainer-session')
          options.trainerSignedInId.value = ''
          options.trainerSignedInName.value = ''
        })
    } catch {
      /* armazenamento indisponível */
    }
  }

  async function restoreCustomerSession() {
    try {
      const token =
        sessionStorage.getItem('fitpeso-customer-session') ??
        sessionStorage.getItem('fitpeso-google-session')
      if (!token) return
      const generation = options.getGeneration()
      await loadCustomerProfile(token)
        .then((profile) => {
          const storedToken =
            sessionStorage.getItem('fitpeso-customer-session') ??
            sessionStorage.getItem('fitpeso-google-session')
          if (options.getGeneration() === generation && storedToken === token)
            options.applyCustomerProfile(profile)
        })
        .catch(() => {
          if (options.getGeneration() !== generation) return
          sessionStorage.removeItem('fitpeso-google-session')
          sessionStorage.removeItem('fitpeso-customer-session')
          options.customerSignedInName.value = ''
        })
    } catch {
      /* Sessão temporária indisponível; ainda é possível entrar novamente. */
    }
  }

  async function restoreSessions() {
    try {
      // Restore the preferred account first. Do not race two sessions: applying
      // a customer profile after the trainer profile would hide trainer-only fields.
      const preferredRole = localStorage.getItem('fitpeso:preferred-role:v1')
      if (preferredRole === 'trainer') {
        await restoreTrainerSession()
        if (!options.trainerSignedInId.value) await restoreCustomerSession()
      } else {
        await restoreCustomerSession()
        if (!options.customerSignedInName.value) await restoreTrainerSession()
      }
    } finally {
      sessionRestoring.value = false
    }
  }

  return { restoreSessions, sessionRestoring }
}
