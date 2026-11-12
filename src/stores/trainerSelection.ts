import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const MAX_TRAINERS = 20

/**
 * Shared selection state for the public directory and the request flow.
 * State is intentionally kept in memory: clearing/starting a request must
 * not restore professionals selected during an earlier session.
 */
export const useTrainerSelection = defineStore('trainerSelection', () => {
  const selectedTrainerIds = ref<string[]>([])
  const count = computed(() => selectedTrainerIds.value.length)
  const canAdd = computed(() => count.value < MAX_TRAINERS)

  function setSelectedTrainerIds(ids: string[]) {
    selectedTrainerIds.value = [...new Set(ids)].slice(0, MAX_TRAINERS)
  }

  function clearSelection() {
    selectedTrainerIds.value = []
  }

  return {
    selectedTrainerIds,
    count,
    canAdd,
    setSelectedTrainerIds,
    clearSelection,
    maxTrainers: MAX_TRAINERS,
  }
})
