<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
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

const menu = ref<HTMLDetailsElement | null>(null)
function closeMenu() {
  if (menu.value) menu.value.open = false
}
function closeOnOutsideClick(event: PointerEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) closeMenu()
}
onMounted(() => document.addEventListener('pointerdown', closeOnOutsideClick))
onUnmounted(() => document.removeEventListener('pointerdown', closeOnOutsideClick))
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
      <nav class="customer-account-links" aria-label="Menu principal">
        <details ref="menu" class="account-dropdown main-hamburger-menu">
          <summary aria-label="Abrir menu principal" title="Menu" aria-haspopup="menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </summary>
          <div class="account-dropdown-panel">
            <template v-if="!trainerSignedInId && !customerSignedInName">
              <button type="button" @click="closeMenu(); openCustomerLogin()">Entrar</button>
              <button type="button" @click="closeMenu(); openCustomerSignupFromLogin()">Cadastre-se</button>
              <a href="#cadastro-personal" @click="closeMenu()">Sou personal trainer</a>
            </template>
            <button type="button" @click="closeMenu(); viewMode = 'assessment'">Avaliação corporal</button>
            <button type="button" @click="closeMenu(); viewMode = 'about'">Sobre</button>
            <button type="button" @click="closeMenu(); openProfessionalRegistration()">
              Consultar registro profissional
            </button>
            <template v-if="trainerSignedInId || customerSignedInName">
              <button
                type="button"
                @click="closeMenu(); trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()"
              >{{ trainerSignedInId ? 'Solicitações recebidas' : 'Minhas solicitações' }}</button>
              <button type="button" @click="closeMenu(); openMyProfile()">Meu cadastro</button>
              <button
                v-if="customerIsAdmin && !trainerSignedInId"
                type="button"
                @click="closeMenu(); viewMode = 'admin-trainer'"
              >Cadastrar Personal</button>
              <button
                v-if="customerIsAdmin && !trainerSignedInId"
                type="button"
                @click="closeMenu(); openAdminTrainers()"
              >Editar profissionais</button>
              <button type="button" @click="closeMenu(); logout()">Sair</button>
            </template>
          </div>
        </details>
      </nav>
    </div>  </div>
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
.main-hamburger-menu .account-dropdown-panel {
  right: 0;
}
.main-hamburger-menu .account-dropdown-panel a {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 10px 13px;
  border-radius: 8px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.main-hamburger-menu .account-dropdown-panel a:hover {
  background: color-mix(in srgb, var(--blue) 9%, transparent);
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
@media (max-width: 390px) {
  .fitpeso-home-header-actions { gap: 2px; }
  .fitpeso-home-header-actions :deep(.home-city-select) { padding-right: 18px; font-size: 12px; }
}
</style>
