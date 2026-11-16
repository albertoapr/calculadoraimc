import { computed, type Ref } from 'vue'
import type { PublicTrainer, TrainerGenderPreference } from '../services/profissionaisService'
import type { Academy } from '../services/academiesService'

/** Pure derived state for public lookup and request-specific trainer selection. */
export function useTrainerDirectory(options: {
  trainers: Ref<PublicTrainer[]>
  academy: Ref<string>
  city: Ref<string>
  requestCity: Ref<string>
  requestGender: Ref<TrainerGenderPreference>
  selectingForRequest: Ref<boolean>
  registeredAcademies?: Ref<Academy[]>
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
      if (!options.academy.value) return true
      const selected = options.academy.value.trim().toLocaleLowerCase('pt-BR')
      const registered = options.registeredAcademies?.value.find(
        (item) => `${item.name} — ${item.neighborhood}`.toLocaleLowerCase('pt-BR') === selected,
      )
      const legacyNames = [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? '']
      if (registered && trainer.academyIds?.includes(registered.academyId)) return true
      // Nomes legados são mantidos durante a migração para IDs de academias.
      return legacyNames.some((name) => {
        const normalized = name.trim().toLocaleLowerCase('pt-BR')
        return normalized === selected ||
          (registered && normalized === registered.name.toLocaleLowerCase('pt-BR'))
      })
    }),
  )

  return { academies, filtered }
}
