import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { IdentityProfile, IdentityRole } from '../types/domain'

/** Display state only. Session tokens retain their existing storage and validation. */
export const useAccountSession = defineStore('accountSession', () => {
  const customerSignedInName = ref('')
  const customerPhotoUrl = ref('')
  const customerIsAdmin = ref(false)
  const trainerSignedInName = ref('')
  const trainerSignedInId = ref('')
  const pessoaId = ref('')
  const availableProfiles = ref<IdentityProfile[]>([])
  const activeRole = ref<IdentityRole | ''>('')
  const identityStatus = ref<'ready' | 'pending' | ''>('')
  return { customerSignedInName, customerPhotoUrl, customerIsAdmin, trainerSignedInName, trainerSignedInId, pessoaId, availableProfiles, identityStatus, activeRole }
})
