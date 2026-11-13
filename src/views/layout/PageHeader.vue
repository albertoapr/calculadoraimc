<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  rootHomePersonalImage,
  trainerIdFromPath,
  trainerSlugFromHost,
  isRootHome,
  personalBrandFirstName,
  trainerProfileFailed,
  viewMode,
  showRequestForm,
  form,
  result,
  goBackFromTitle,
} = useFitpesoContext()
</script>

<template>
  <header class="hero">
    <p
      v-if="(trainerIdFromPath || trainerSlugFromHost) && trainerProfileFailed"
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
      Solicitar atendimento
    </h2>
    <h1 v-if="viewMode === 'home' && !result && !isRootHome" class="home-tagline">
      <span
        v-if="trainerSlugFromHost && personalBrandFirstName"
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
    <h1 v-if="viewMode !== 'contact' && (viewMode !== 'home' || result)" id="page-title">
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
          ? 'Selecionar profissional'
          : viewMode === 'public-trainers'
            ? 'Profissionais'
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
    <p v-if="viewMode === 'assessment' && !result" class="intro">
      Informe suas medidas para fazer uma avaliação.
    </p>
  </header>
</template>
