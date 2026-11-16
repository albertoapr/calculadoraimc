<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
import rootHomePersonalImage from '../../assets/root-home-personal.jpg'
const { publicTrainerAcademy, publicTrainerAcademies, homeCity, publicTrainersLoading, startTrainingRequestFromHome, openPublicTrainers } = useFitpesoContext()
</script>

<template>
<h1 class="home-training-title">
        <span class="home-training-heading">
          <span class="brand-peso">Personal</span>
          <span class="brand-fit">Trainer</span>
        </span>
      </h1>
      <p class="home-training-subtitle">
        para todos os bolsos e rotinas
      </p>
      <div
       
        class="root-home-photo home-training-photo"
      >
        <img
          class="root-home-personal-image"
          :src="rootHomePersonalImage"
          alt="Personal trainer orientando uma aluna durante um exercício na academia"
          loading="lazy"
        />
      </div>
      <label
       
        class="home-academy-picker"
        for="home-academy"
      >
        <svg class="home-academy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="1.5" />
          <path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3" />
        </svg>
        <select
          id="home-academy"
          v-model="publicTrainerAcademy"
          class="home-academy-select"
          aria-label="Selecionar academia"
          :disabled="!homeCity || publicTrainersLoading"
        >
          <option value="">Selecione uma academia</option>
          <option v-for="academy in publicTrainerAcademies" :key="academy" :value="academy">
            {{ academy }}
          </option>
        </select>
      </label>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="10.5" cy="7" r="3.25" />
          <path d="M4.5 19v-1.3a6 6 0 0 1 10.1-4.4" />
          <circle cx="17" cy="16.5" r="3.5" />
          <path d="m19.5 19 2.5 2.5" />
        </svg>
        Buscar Profissionais
      </button>
</template>

<style scoped>
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
