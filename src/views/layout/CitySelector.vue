<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'

const {
  viewMode,
  showRequestForm,
  publicTrainerCity,
  supportedRequestCities,
  homeCity,
  form,
  selectHomeCity,
} = useFitpesoContext()
</script>

<template>
  <label
    v-if="
      viewMode === 'home' ||
      viewMode === 'public-trainers' ||
      viewMode === 'select-trainers' ||
      (viewMode === 'contact' && showRequestForm)
    "
    class="home-city-selector"
    :class="{ 'home-city-selector--right': viewMode === 'public-trainers' }"
    for="home-city"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
    <select
      id="home-city"
      class="home-city-select"
      :value="viewMode === 'select-trainers' ? form.city : viewMode === 'public-trainers' ? publicTrainerCity : homeCity"
       :aria-label="viewMode === 'select-trainers' ? 'Cidade da solicitação (não editável)' : 'Alterar cidade'"
      :disabled="viewMode === 'select-trainers'"
      @change="selectHomeCity"
    >
      <option value="" disabled>Escolha sua cidade</option>
      <option v-for="city in supportedRequestCities" :key="city" :value="city">
        {{ city }}, RJ
      </option>
    </select>
  </label>
</template>
