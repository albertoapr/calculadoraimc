<script setup lang="ts">
import { computed } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const { viewMode, publicTrainerCity, publicCities, publicCitiesError, publicCitiesLoading,
  loadPublicCities, homeCity, form, selectHomeCity } = useFitpesoContext()
const cityValue = computed(() => viewMode.value === 'select-trainers'
  ? form.city : viewMode.value === 'public-trainers' ? publicTrainerCity.value : homeCity.value)
const showSelector = computed(() => ['home', 'public-trainers', 'select-trainers'].includes(viewMode.value))
const displayedCity = computed(() => publicCities.value.some(city => city.cityKey === cityValue.value) ? cityValue.value : '')
</script>

<template>
  <label
    v-if="showSelector"
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
      :value="displayedCity"
      :aria-label="
        viewMode === 'select-trainers' ? 'Cidade da solicitação (não editável)' : 'Alterar cidade'
      "
      :disabled="viewMode === 'select-trainers' || !publicCities.length"
      @change="selectHomeCity"
    >
      <option value="" disabled>
        {{ publicCitiesLoading ? 'Carregando cidades…' : !publicCities.length && !publicCitiesError ? 'Nenhuma cidade com atendimento' : 'Escolha sua cidade' }}
      </option>
      <option v-for="city in publicCities" :key="city.cityId" :value="city.cityKey">
        {{ city.name }}, {{ city.state }}
      </option>
    </select>
  </label>
  <div v-if="showSelector && publicCitiesError" role="alert">
    {{ publicCitiesError }}
    <button type="button" class="secondary-button" @click="loadPublicCities(true)">Tentar novamente</button>
  </div>
</template>
