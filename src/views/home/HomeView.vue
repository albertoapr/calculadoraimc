<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import AcademySelectionDialog from '../profissionais/AcademySelectionDialog.vue'
import rootHomePersonalImage from '../../assets/root-home-personal.jpg'
const {
  publicTrainerAcademy,
  publicTrainerAcademies,
  publicTrainerAcademyDetails,
  homeCity,
  publicTrainersLoading,
  openPublicTrainers,
  viewMode,
} = useFitpesoContext()

const academyDialogOpen = ref(false)
const academyName = computed(() =>
  publicTrainerAcademyDetails.value.name.trim().replace(/^academia\s+/i, ''),
)
function confirmAcademy(academy: string) {
  if (!publicTrainerAcademies.value.includes(academy)) return
  // A escolha na home não navega: o filtro e a persistência em sessão já são reativos.
  publicTrainerAcademy.value = academy
  academyDialogOpen.value = false
}
</script>

<template>
  <div class="home-academy-heading" aria-label="Academia selecionada">
    <div class="home-academy-heading-row">
      <h2 class="home-academy-title">
        <button
          type="button"
          class="home-academy-change-button"
          :aria-label="`Alterar academia. ${academyName || 'Selecione uma academia'}`"
          aria-haspopup="dialog"
          title="Selecionar academia"
          :disabled="!homeCity || publicTrainersLoading"
          @click="academyDialogOpen = true"
        >
          <span>{{ academyName || 'Selecione uma academia' }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
    </div>
    <p v-if="publicTrainerAcademyDetails.neighborhood" class="home-academy-neighborhood">
      {{ publicTrainerAcademyDetails.neighborhood }}
    </p>
  </div>
  <div class="root-home-photo home-training-photo">
    <img
      class="root-home-personal-image"
      :src="rootHomePersonalImage"
      alt="Personal trainer orientando uma aluna durante um exercício na academia"
      loading="lazy"
    />
  </div>
  <h1 class="home-training-title">
    <span class="home-training-heading">
      <span class="brand-peso">Personal</span>
      <span class="brand-fit">Trainer</span>
    </span>
  </h1>
  <p class="home-training-subtitle">para todos os bolsos e rotinas</p>
  <AcademySelectionDialog
    v-if="academyDialogOpen"
    :academies="publicTrainerAcademies"
    :academy="publicTrainerAcademy"
    @confirm="confirmAcademy"
    @close="academyDialogOpen = false"
  />
  <button
    class="primary-button home-find-personal-button"
    type="button"
    @click="openPublicTrainers"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="7" r="3.25" />
      <path d="M4.5 19v-1.3a6 6 0 0 1 10.1-4.4" />
      <circle cx="17" cy="16.5" r="3.5" />
      <path d="m19.5 19 2.5 2.5" />
    </svg>
    Buscar Profissionais
  </button>
  <button
    class="secondary-button home-assessment-button"
    type="button"
    @click="viewMode = 'assessment'"
  >
    Avaliação Corporal
  </button>
</template>

<style scoped>
.home-training-title,
.home-training-title .home-training-heading {
  font-size: clamp(28px, 6vw, 38px);
}
.home-academy-heading {
  margin: 2px 0 10px;
  min-width: 0;
}
.home-academy-heading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.home-academy-title {
  margin: 0;
  min-width: 0;
  font-size: clamp(23px, 6vw, 35px);
  line-height: 1.16;
  text-align: center;
}
.home-academy-change-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  min-height: 44px;
  padding: 3px 5px;
  color: #263f33;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font: inherit;
  font-weight: inherit;
  line-height: inherit;
  text-align: center;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.home-academy-change-button svg {
  width: 17px;
  height: 17px;
  flex: none;
  color: #286b4e;
  transition: transform .15s ease;
}
.home-academy-change-button:hover svg { transform: translateY(2px); }
.home-academy-change-button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.home-academy-change-button:disabled { opacity: .5; cursor: not-allowed; }
.home-academy-neighborhood {
  margin: -5px 0 0;
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}
:global(html[data-theme='dark']) .home-academy-change-button { color: #ffffff; }
:global(html[data-theme='dark']) .home-academy-change-button svg { color: #55d6a3; }
.home-find-personal-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 20px;
}
.home-find-personal-button svg {
  width: 23px;
  height: 23px;
  flex: none;
}
.home-assessment-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: -8px 0 20px;
}
</style>
