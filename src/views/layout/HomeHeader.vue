<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  viewMode,
  showRequestForm,
  publicTrainerCity,
  customerSignedInName,
  customerIsAdmin,
  openAdminTrainers,
  trainerSignedInName,
  trainerSignedInId,
  logout,
  openProfessionalRegistration,
  supportedRequestCities,
  homeCity,
  selectHomeCity,
  openCustomerLogin,
  openCustomerRequests,
  openMyProfile,
  openTrainerReceivedRequests,
  openCustomerSignupFromLogin,
} = useFitpesoContext()
</script>

<template>
  <div class="fitpeso-home-topbar">
    <div class="fitpeso-home-brand" aria-label="FitPeso — Rede de treinadores">
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
        <span v-if="!trainerSignedInId && !customerSignedInName && viewMode !== 'assessment'" class="header-auth-links">
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
            (trainerSignedInId || customerSignedInName) && viewMode !== 'home' && viewMode !== 'assessment'
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
      <label
        v-if="
          viewMode === 'home' ||
          viewMode === 'public-trainers' ||
          (viewMode === 'contact' && showRequestForm)
        "
        class="home-location-label"
        style="display: flex; align-items: center; gap: 5px; max-width: 100%"
        for="home-city"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        <select
          id="home-city"
          :value="viewMode === 'public-trainers' ? publicTrainerCity : homeCity"
          aria-label="Alterar cidade"
          @change="selectHomeCity"
          style="
            max-width: 165px;
            font: inherit;
            color: inherit;
            background: transparent;
            border: 0;
            cursor: pointer;
          "
        >
          <option value="" disabled>Escolha sua cidade</option>
          <option v-for="city in supportedRequestCities" :key="city" :value="city">
            {{ city }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>
