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
  startTrainingRequestFromHome,
  openPublicTrainers,
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
  <h1 class="home-training-title">
    <span class="home-training-heading">
      <span class="brand-peso">Personal</span>
      <span class="brand-fit">Trainer</span>
    </span>
  </h1>
  <p class="home-training-subtitle">para todos os bolsos e rotinas</p>
  <div class="root-home-photo home-training-photo">
    <img
      class="root-home-personal-image"
      :src="rootHomePersonalImage"
      alt="Personal trainer orientando uma aluna durante um exercício na academia"
      loading="lazy"
    />
  </div>
  <div class="home-academy-heading" aria-label="Academia selecionada">
    <div class="home-academy-heading-row">
      <h2 class="home-academy-title">
        <span v-if="academyName">{{ academyName }}</span>
        <span v-else>Selecione uma academia</span>
      </h2>
      <button
        type="button"
        class="home-academy-change-button"
        aria-label="Alterar academia"
        title="Alterar academia"
        :disabled="!homeCity || publicTrainersLoading"
        @click="academyDialogOpen = true"
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
          <path d="m4 20 4.5-1 10.7-10.7a2.2 2.2 0 0 0-3.1-3.1L5.4 15.9 4 20Z" />
          <path d="m14.5 6.5 3 3" />
        </svg>
      </button>
    </div>
    <p v-if="publicTrainerAcademyDetails.neighborhood" class="home-academy-neighborhood">
      {{ publicTrainerAcademyDetails.neighborhood }}
    </p>
  </div>
  <AcademySelectionDialog
    v-if="academyDialogOpen"
    :academies="publicTrainerAcademies"
    :academy="publicTrainerAcademy"
    @confirm="confirmAcademy"
    @close="academyDialogOpen = false"
  />
  <button
    class="primary-button home-training-request-button"
    type="button"
    :disabled="!homeCity"
    @click="startTrainingRequestFromHome"
  >
    Treinar com Personal
  </button>
  <button
    class="secondary-button home-find-personal-button"
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
</template>

<style scoped>
.home-academy-heading {
  margin: 14px 0 10px;
  min-width: 0;
}
.home-academy-heading-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 6px;
}
.home-academy-title {
  grid-column: 2;
  margin: 0;
  min-width: 0;
  font-size: clamp(20px, 5.4vw, 31px);
  line-height: 1.16;
  text-align: center;
  overflow-wrap: anywhere;
  color: #263f33;
}
.home-academy-change-button {
  grid-column: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 8px;
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.home-academy-change-button svg { width: 22px; height: 22px; }
.home-academy-change-button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.home-academy-change-button:disabled { opacity: .5; cursor: not-allowed; }
.home-academy-neighborhood {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}
:global(html[data-theme='dark']) .home-academy-title { color: #55d6a3; }
.home-training-request-button {
  display: block;
  width: 100%;
  margin: 12px 0 12px;
}
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
</style>
