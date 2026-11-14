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
  openCustomerLogin,
  openCustomerRequests,
  openMyProfile,
  openTrainerReceivedRequests,
  openCustomerSignupFromLogin,
} = useFitpesoContext()

</script>

<template>
  <div class="fitpeso-home-topbar">
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
    <div class="fitpeso-home-header-actions">
      <CitySelector v-if="viewMode === 'home'" />
      <span v-if="trainerSignedInId || customerSignedInName" class="account-greeting">
        Olá, {{ (trainerSignedInId ? trainerSignedInName : customerSignedInName).trim().split(/\s+/)[0] }}
      </span>
      <nav class="customer-account-links header-inline-links" aria-label="Menu principal">
        <template v-if="!trainerSignedInId && !customerSignedInName">
          <a href="#entrar" class="header-login-link" @click.prevent="openCustomerLogin()">Entrar</a>
          <span class="header-auth-divider" aria-hidden="true">|</span>
          <a href="#cadastro-cliente" class="header-signup-link" @click.prevent="openCustomerSignupFromLogin()">Cadastre-se</a>
        </template>
        <template v-else>
          <button type="button" @click="trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()">Solicitações</button>
          <button type="button" @click="openMyProfile()">Meu cadastro</button>
          <button v-if="customerIsAdmin && !trainerSignedInId" type="button" @click="viewMode = 'admin-trainer'">Cadastrar Personal</button>
          <button v-if="customerIsAdmin && !trainerSignedInId" type="button" @click="openAdminTrainers()">Editar profissionais</button>
          <button type="button" @click="logout()">Sair</button>
        </template>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.fitpeso-home-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.fitpeso-home-header-actions :deep(.home-city-selector--right) {
  width: auto;
  max-width: 100%;
  margin: 0;
}
.fitpeso-home-header-actions :deep(.home-city-select) {
  width: auto;
  max-width: 100%;
  min-height: 44px;
  padding: 6px 23px 6px 28px;
  font-size: 13px;
  font-weight: 800;
  text-align: right;
  text-align-last: right;
}
.fitpeso-home-header-actions :deep(.home-city-selector svg) {
  left: 3px;
  width: 16px;
  height: 16px;
}
.header-inline-links {
  flex-wrap: wrap;
  column-gap: 5px;
  row-gap: 0;
  font-size: 13px;
}
.header-inline-links a,
.header-inline-links button {
  font-size: 13px;
  font-weight: 800;
}
.header-inline-links .header-login-link {
  color: #286b4e;
}
.header-inline-links .header-signup-link {
  color: #263f33;
}
html[data-theme='dark'] .header-inline-links .header-login-link {
  color: #55d6a3;
}
html[data-theme='dark'] .header-inline-links .header-signup-link {
  color: #f1f5f3;
}
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
.fitpeso-home-brand-link:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 4px;
  border-radius: 4px;
}
@media (max-width: 520px) {
  .fitpeso-home-header-actions {
    flex-direction: column-reverse;
    align-items: flex-end;
    gap: 2px;
  }
  .fitpeso-home-header-actions :deep(.home-city-select) {
    padding-right: 18px;
    font-size: 13px;
  }
}
</style>
