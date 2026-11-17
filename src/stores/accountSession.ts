import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Display state only. Session tokens retain their existing storage and validation. */
export const useAccountSession = defineStore('accountSession', () => {
  const customerSignedInName = ref('')
  const customerPhotoUrl = ref('')
  const customerIsAdmin = ref(false)
  const trainerSignedInName = ref('')
  const trainerSignedInId = ref('')
  return { customerSignedInName, customerPhotoUrl, customerIsAdmin, trainerSignedInName, trainerSignedInId }
})
