<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import CitySelector from './CitySelector.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  viewMode,
  isRootHome,
  goHome,
  customerSignedInName,
  customerIsAdmin,
  openAdminTrainers,
  openAdminTrainer,
  openAdminAcademies,
  trainerSignedInName,
  trainerSignedInId,
  logout,
  openCustomerLogin,
  openCustomerRequests,
  openMyProfile,
  openTrainerReceivedRequests,
  openCustomerSignupFromLogin,
} = useFitpesoContext()
const menuOpen = ref(false)
const menuContainer = ref<HTMLElement | null>(null)
const closeMenu = () => { menuOpen.value = false }
const onOutsideClick = (event: MouseEvent) => {
  if (menuOpen.value && !menuContainer.value?.contains(event.target as Node)) closeMenu()
}
const onEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeMenu()
}
onMounted(() => {
  document.addEventListener('pointerdown', onOutsideClick)
  document.addEventListener('keydown', onEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsideClick)
  document.removeEventListener('keydown', onEscape)
})
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
      <span v-if="trainerSignedInId || customerSignedInName" class="account-greeting">
        Olá,
        {{
          (trainerSignedInId ? trainerSignedInName : customerSignedInName).trim().split(/\s+/)[0]
        }}
      </span>
      <nav v-if="!trainerSignedInId && !customerSignedInName" class="customer-account-links header-inline-links" aria-label="Menu principal">
        <template>
          <a href="#entrar" class="header-login-link" @click.prevent="openCustomerLogin()"
            >Entrar</a
          >
          <span class="header-auth-divider" aria-hidden="true">|</span>
          <a
            href="#cadastro-cliente"
            class="header-signup-link"
            @click.prevent="openCustomerSignupFromLogin()"
            >Cadastre-se</a
          >
        </template>
      </nav>
      <div v-if="trainerSignedInId || customerSignedInName" ref="menuContainer" class="signed-in-menu">
        <button
          type="button"
          class="signed-in-menu-trigger"
          aria-label="Abrir menu de navegação"
          aria-controls="signed-in-menu-items"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <nav v-if="menuOpen" id="signed-in-menu-items" class="signed-in-menu-items" aria-label="Menu da conta" @click="closeMenu">
          <button type="button" @click="trainerSignedInId ? openTrainerReceivedRequests() : openCustomerRequests()">Solicitações</button>
          <button type="button" @click="openMyProfile()">Meu cadastro</button>
          <template v-if="customerIsAdmin && !trainerSignedInId">
            <button type="button" @click="openAdminTrainer()">Cadastrar Personal</button>
            <button type="button" @click="openAdminTrainers()">Editar profissionais</button>
            <button type="button" @click="openAdminAcademies()">Cadastro de academias</button>
          </template>
          <button type="button" @click="logout()">Sair</button>
        </nav>
      </div>
      <CitySelector v-if="(viewMode === 'home' && isRootHome) || viewMode === 'public-trainers'" />
    </div>
  </div>
</template>

<style scoped>
.signed-in-menu { position: relative; align-self: flex-end; }
.signed-in-menu-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 38px; padding: 7px; border: 1px solid var(--line);
  border-radius: 8px; background: transparent; color: inherit; cursor: pointer;
}
.signed-in-menu-trigger svg { width: 24px; height: 24px; }
.signed-in-menu-trigger:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.signed-in-menu-items {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 50;
  min-width: 210px; max-width: calc(100vw - 30px);
  display: flex; flex-direction: column; padding: 6px;
  background: #fff; color: #243b30;
  border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0,0,0,.18);
}
html[data-theme='dark'] .signed-in-menu-items { background: #1b2623; color: #f1f5f3; }
.signed-in-menu-items button {
  width: 100%; padding: 11px 12px; background: transparent; color: inherit;
  border: 0; border-radius: 6px; text-align: left; font: inherit; cursor: pointer;
}
.signed-in-menu-items button:hover,
.signed-in-menu-items button:focus-visible { background: rgba(128,128,128,.14); }

.fitpeso-home-header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}
.fitpeso-home-header-actions :deep(.home-city-selector:not(.home-city-selector--right)) {
  width: auto;
  max-width: 100%;
  margin: 0;
}
.fitpeso-home-header-actions :deep(.home-city-selector:not(.home-city-selector--right) .home-city-select) {
  width: auto;
  max-width: 100%;
  min-height: 38px;
  padding: 6px 20px 6px 26px;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  text-align-last: right;
}
.fitpeso-home-header-actions :deep(.home-city-selector:not(.home-city-selector--right) svg) {
  left: 2px;
  width: 16px;
  height: 16px;
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
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .fitpeso-home-header-actions :deep(.home-city-select) {
    padding-right: 18px;
    font-size: 13px;
  }
}
</style>
