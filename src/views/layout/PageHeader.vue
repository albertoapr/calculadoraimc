<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
import rootHomePersonalImage from '../../assets/root-home-personal.jpg'
const {
  trainerIdFromPath,
  trainerSlugFromPath,
  isRootHome,
  personalBrandFirstName,
  trainerProfileFailed,
  viewMode,
  publicTrainerAcademy,
  publicTrainerAcademies,
  showRequestForm,
  form,
  result,
  goBackFromTitle,
} = useFitpesoContext()
</script>

<template>
  <header class="hero">
    <p
      v-if="(trainerIdFromPath || trainerSlugFromPath) && trainerProfileFailed"
      class="trainer-profile-status"
      role="status"
    >
      Não foi possível localizar o personal.
    </p>
    <hr v-if="viewMode !== 'home'" class="personal-divider" />
    <h2
      v-if="viewMode === 'contact' && showRequestForm"
      id="contact-form-title"
      class="request-form-title"
    >
      <button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">
        &lt;
      </button>
      Solicitar treinamento
    </h2>
    <h1 v-if="viewMode === 'home' && !result && !isRootHome" class="home-tagline">
      <span
        v-if="trainerSlugFromPath && personalBrandFirstName"
        class="personal-trainer-brand personal-trainer-home-title"
      >
        <span class="personal-trainer-first-name">{{ personalBrandFirstName }}</span>
        <span class="personal-trainer-role">Personal Trainer</span>
      </span>
      <span v-else>Treine com um personal</span>
    </h1>
    <div v-if="viewMode === 'home' && !result && isRootHome" class="root-home-photo">
      <img
        class="root-home-personal-image"
        :src="rootHomePersonalImage"
        width="1069"
        height="594"
        alt="Personal trainer orientando uma aluna durante um exercício"
        decoding="async"
        fetchpriority="high"
      />
      <p class="root-home-tagline-subtitle">O apoio faz toda a diferença.</p>
    </div>
    <h1 v-if="viewMode === 'public-trainers'" id="page-title" class="academy-page-title">
      <button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">
        &lt;
      </button>
      <label class="sr-only" for="directory-academy">Academia</label>
      <select
        id="directory-academy"
        v-model="publicTrainerAcademy"
        class="directory-academy-select"
        aria-label="Selecione uma academia"
      >
        <option value="">Selecione uma academia</option>
        <option v-for="academy in publicTrainerAcademies" :key="academy" :value="academy">
          {{ academy }}
        </option>
      </select>
    </h1>
    <h1
      v-if="viewMode !== 'contact' && viewMode !== 'public-trainers' && (viewMode !== 'home' || result)"
      id="page-title"
      :class="{ 'academy-page-title': viewMode === 'public-trainers' }"
    >
      <button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">
        &lt;
      </button>
      <svg
        v-if="viewMode !== 'public-trainers'"
        class="scale-icon"
        viewBox="0 0 40 40"
        aria-hidden="true"
      >
        <rect x="6" y="4" width="28" height="32" rx="6" />
        <rect x="12" y="9" width="16" height="8" rx="2" />
        <path d="M20 11v3m-2-1h4M12 22h16m-16 5h16m-16 5h10" />
      </svg>
      <span>{{
        viewMode === 'select-trainers'
          ? 'Solicitar treinamento'
          : viewMode === 'about'
            ? 'Sobre o FitPeso'
            : viewMode === 'trainer-request'
              ? 'Solicitação de atendimento'
              : viewMode === 'customer-requests'
                ? 'Minhas solicitações'
                : viewMode === 'trainer-requests'
                  ? 'Solicitações recebidas'
                  : viewMode === 'my-profile'
                    ? 'Meu cadastro'
                    : result
                      ? 'Resultado da avaliação'
                      : form.calculateBodyFat
                        ? 'IMC e gordura corporal'
                        : 'Avaliar meu peso'
      }}</span>
    </h1>
    <p v-if="viewMode === 'select-trainers'" class="trainer-selection-subtitle">
      Selecionar profissional
    </p>
    <p v-if="viewMode === 'assessment' && !result" class="intro">
      Informe suas medidas para fazer uma avaliação.
    </p>
  </header>
</template>

<style scoped>
.academy-page-title {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 6px;
  margin: 0;
  padding: 0;
}
.directory-academy-select {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  margin: 0;
  padding: 8px 4px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--ink);
  color-scheme: inherit;
  font-size: clamp(19px, 5.3vw, 25px);
  font-weight: 700;
  cursor: pointer;
}
.directory-academy-select:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.directory-academy-select option {
  background: #f2f4ee;
  color: #203e32;
}
html[data-theme='dark'] .directory-academy-select option {
  background: #141d18;
  color: #f4f5f0;
}
.academy-page-neighborhood {
  margin: 2px auto 12px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
}
</style>
