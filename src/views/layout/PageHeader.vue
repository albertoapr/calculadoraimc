<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import AcademySelectionDialog from '../profissionais/AcademySelectionDialog.vue'
import rootHomePersonalImage from '../../assets/root-home-personal.jpg'
const {
  trainerIdFromPath,
  trainerSlugFromPath,
  isRootHome,
  personalBrandFirstName,
  trainerProfileFailed,
  viewMode,
  showRequestForm,
  form,
  result,
  goBackFromTitle,
  publicTrainerAcademy,
  publicTrainerAcademies,
  changePublicAcademy,
  publicTrainerAcademyDetails,
} = useFitpesoContext()

const academyDialogOpen = ref(false)
const academyName = computed(() =>
  publicTrainerAcademyDetails.value.name.trim().replace(/^academia\s+/i, ''),
)

function confirmAcademy(academy: string) {
  changePublicAcademy(academy)
  academyDialogOpen.value = false
}

watch(viewMode, (mode) => {
  if (mode !== 'public-trainers') academyDialogOpen.value = false
})
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
      Treinar com Personal
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
    <div v-if="viewMode === 'public-trainers'" class="academy-public-heading">
      <div class="academy-public-heading-row">
        <button
          type="button"
          class="title-back-button academy-back-button"
          aria-label="Voltar"
          @click="goBackFromTitle"
        >
          &lt;
        </button>
        <h1 id="page-title" class="academy-public-title">
          <button
            type="button"
            class="academy-change-button"
            :aria-label="`Alterar academia. ${academyName ? 'Academia ' + academyName : 'Selecione uma academia'}`"
            aria-haspopup="dialog"
            title="Selecionar academia"
            @click="academyDialogOpen = true"
          >
            <span v-if="academyName" class="academy-title-label"><span class="academy-title-prefix">Academia</span> <span class="academy-title-name">{{ academyName }}</span></span>
            <span v-else>Selecione uma academia</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </h1>
      </div>
      <p v-if="publicTrainerAcademyDetails.neighborhood" class="academy-page-neighborhood">
        {{ publicTrainerAcademyDetails.neighborhood }}
      </p>
    </div>
    <h1
      v-if="
        viewMode !== 'contact' &&
        viewMode !== 'public-trainers' &&
        (viewMode !== 'home' || result)
      "
      id="page-title"
    >
      <button type="button" class="title-back-button" aria-label="Voltar" @click="goBackFromTitle">
        &lt;
      </button>
      <svg class="scale-icon" viewBox="0 0 40 40" aria-hidden="true">
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
    <AcademySelectionDialog
      v-if="viewMode === 'public-trainers' && academyDialogOpen"
      :academies="publicTrainerAcademies"
      :academy="publicTrainerAcademy"
      @confirm="confirmAcademy"
      @close="academyDialogOpen = false"
    />
  </header>
</template>

<style scoped>
.academy-public-heading {
  margin: 2px 0 12px;
  width: 100%;
  min-width: 0;
}
.academy-public-heading-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.academy-public-title {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  font-size: clamp(20px, 5.4vw, 31px);
  line-height: 1.16;
  overflow-wrap: anywhere;
  text-align: center;
}
.academy-title-prefix {
  color: #286b4e;
  font-size: .92em;
  font-weight: 600;
}
.academy-title-name {
  color: #263f33;
}
:global(html[data-theme='dark']) .academy-public-title .academy-title-prefix {
  color: #ffffff;
}
:global(html[data-theme='dark']) .academy-public-title .academy-title-name {
  color: #ffffff;
}
.academy-back-button {
  padding: 0;
  font-size: 27px;
}
.academy-change-button {
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
.academy-change-button svg {
  width: 17px;
  height: 17px;
  flex: none;
  color: #286b4e;
  transition: transform .15s ease;
}
.academy-change-button:hover svg { transform: translateY(2px); }
:global(html[data-theme='dark']) .academy-change-button { color: #ffffff; }
:global(html[data-theme='dark']) .academy-change-button svg { color: #55d6a3; }
.academy-change-button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.academy-page-neighborhood {
  margin: -5px 0 0;
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}
</style>
