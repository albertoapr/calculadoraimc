import { computed, ref } from 'vue'

/**
 * Shared state for the request's trainer selection.
 * Module scope preserves the draft while navigating between extracted views.
 * A future Pinia migration can reuse the same public interface.
 */
const selectedTrainerIds = ref<string[]>([])
const MAX_TRAINERS = 20

export function useTrainerSelection() {
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
}
