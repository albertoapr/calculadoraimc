<script setup lang="ts">
import CitySelector from './CitySelector.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  viewMode,
  goHome,
  customerSignedInName,
  customerIsAdmin,
  openAdminTrainers,
  trainerSignedInName,
  trainerSignedInId,
  logout,
  openProfessionalRegistration,
  openCustomerLogin,
  openCustomerRequests,
  openMyProfile,
  openTrainerReceivedRequests,
  openCustomerSignupFromLogin,
} = useFitpesoContext()
</script>

<template>
  <div class="fitpeso-home-topbar">
    <div class="fitpeso-home-brand-column">
    <button
      type="button"
      class="fitpeso-home-brand fitpeso-home-brand-link"
      aria-label="FitPeso — voltar para a tela inicial"
      @click="goHome"
    >
      <div class="fitpeso-home-brand-main">
        <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
          <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
        </svg>
        <span class="brand-default"
          ><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span
        >
      </div>
      <small class="brand-tagline">Rede de treinadores</small>
    </button>
    <CitySelector v-if="viewMode === 'home'" />
    </div>
    <div
      style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0"
    >
      <nav class="customer-account-links" aria-label="Menu principal">
        <span v-if="trainerSignedInId || customerSignedInName" class="account-greeting">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
          </svg>
          <span
            >Olá,
            {{
              (trainerSignedInId ? trainerSignedInName : customerSignedInName)
                .trim()
                .split(/\s+/)[0]
            }}</span
          >
        </span>
        <span
          v-if="!trainerSignedInId && !customerSignedInName && viewMode !== 'assessment'"
          class="header-auth-links"
        >
          <a href="#entrar" class="header-login-link" @click.prevent="openCustomerLogin()">Entrar</a
          ><span class="header-auth-divider" aria-hidden="true">|</span
          ><a
            href="#cadastro-cliente"
            class="header-signup-link"
            @click.prevent="openCustomerSignupFromLogin()"
            >Cadastre-se</a
          >
        </span>
        <details
          v-if="
            (trainerSignedInId || customerSignedInName) &&
            viewMode !== 'home' &&
            viewMode !== 'assessment'
          "
          class="account-dropdown main-hamburger-menu"
        >
          <summary aria-label="Abrir menu principal" title="Menu" aria-haspopup="menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </summary>
          <div class="account-dropdown-panel">
            <button
              v-if="!trainerSignedInId && !customerSignedInName"
              type="button"
              @click="openCustomerLogin()"
            >
              Entrar
            </button>
            <button type="button" @click="viewMode = 'assessment'">Avaliar meu peso</button>
            <button type="button" @click="viewMode = 'about'">Sobre</button>
            <button type="button" @click="openProfessionalRegistration">
              Consultar Registro profissional
            </button>
            <template v-if="trainerSignedInId || customerSignedInName">
              <button
                type="button"
                @click="trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()"
              >
                {{ trainerSignedInId ? 'Solicitações recebidas' : 'Minhas solicitações' }}
              </button>
              <button type="button" @click="openMyProfile">Meu cadastro</button>
              <button
                v-if="customerIsAdmin && !trainerSignedInId"
                type="button"
                @click="viewMode = 'admin-trainer'"
              >
                Cadastrar Personal
              </button>
              <button
                v-if="customerIsAdmin && !trainerSignedInId"
                type="button"
                @click="openAdminTrainers"
              >
                Editar profissionais
              </button>
              <button type="button" @click="logout">Sair</button>
            </template>
          </div>
        </details>
      </nav>
      <a
        v-if="viewMode === 'home' && !trainerSignedInId && !customerSignedInName"
        href="#cadastro-personal"
        class="header-personal-link header-login-link"
      >Sou personal trainer</a>
    </div>
  </div>
</template>

<style scoped>
.fitpeso-home-brand-column {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

/* A marca continua clicável, mas sem aparência ou destaque de link/botão. */
.fitpeso-home-brand-link,
.fitpeso-home-brand-link:hover,
.fitpeso-home-brand-link:active {
  appearance: none;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.fitpeso-home-brand-link:focus:not(:focus-visible) {
  outline: none;
}
.fitpeso-home-brand-link:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 4px;
  border-radius: 4px;
}

.header-personal-link {
  display: inline-block;
  align-self: flex-end;
  margin: 0;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  text-decoration: none;
  color: var(--ink);
}
.header-personal-link:hover,
.header-personal-link:focus-visible {
  text-decoration: underline;
}
</style>
