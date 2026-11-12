import { computed, type Ref } from 'vue'
import type { PublicTrainer, TrainerGenderPreference } from '../services/profissionaisService'

/** Pure derived state for public lookup and request-specific trainer selection. */
export function useTrainerDirectory(options: {
  trainers: Ref<PublicTrainer[]>
  academy: Ref<string>
  city: Ref<string>
  requestCity: Ref<string>
  requestGender: Ref<TrainerGenderPreference>
  selectingForRequest: Ref<boolean>
}) {
  const academies = computed(() =>
    [
      ...new Set(
        options.trainers.value.flatMap((trainer) =>
          [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? '']
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  )

  const filtered = computed(() =>
    options.trainers.value.filter((trainer) => {
      if (options.selectingForRequest.value) {
        if (options.city.value !== options.requestCity.value) return false
        const gender = (trainer.sex || trainer.gender || '').trim().toLocaleLowerCase('pt-BR')
        if (options.requestGender.value !== 'indiferente' && gender !== options.requestGender.value)
          return false
      }
      return (
        !options.academy.value ||
        [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? ''].some(
          (name) =>
            name.trim().toLocaleLowerCase('pt-BR') ===
            options.academy.value.toLocaleLowerCase('pt-BR'),
        )
      )
    }),
  )

  return { academies, filtered }
}
