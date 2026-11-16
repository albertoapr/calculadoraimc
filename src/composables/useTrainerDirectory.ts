import { computed, type Ref } from 'vue'
import type { PublicTrainer, TrainerGenderPreference } from '../services/profissionaisService'
import type { Academy } from '../services/academiesService'

function normalizeAcademyName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ')
    .trim().toLocaleLowerCase('pt-BR')
}

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
      const selected = normalizeAcademyName(options.academy.value)
      const registered = options.registeredAcademies?.value.find(
        (item) => normalizeAcademyName(`${item.name} — ${item.neighborhood}`) === selected,
      )
      const legacyNames = [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? '']
      if (registered && trainer.academyIds?.includes(registered.academyId)) return true
      // Nomes legados são mantidos durante a migração para IDs de academias.
      return legacyNames.some((name) => {
        const normalized = normalizeAcademyName(name)
        return normalized === selected ||
          (registered && normalized === normalizeAcademyName(registered.name))
      })
    }),
  )

  return { academies, filtered }
}
