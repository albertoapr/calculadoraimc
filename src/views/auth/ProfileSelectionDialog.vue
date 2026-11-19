<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import type { IdentityRole } from '../../types/domain'

const {
  selectableProfiles,
  activeRole,
  profileSwitchBusy,
  profileSwitchError,
  profileChoiceRequired,
  selectIdentityProfile,
  closeProfileChooser,
} = useFitpesoContext()
const dialog = ref<HTMLElement | null>(null)
const labels: Record<IdentityRole, string> = {
  CLIENTE: 'Cliente',
  PERSONAL: 'Personal Trainer',
  ADMIN: 'Administrador',
}
const descriptions: Record<IdentityRole, string> = {
  CLIENTE: 'Contratar profissionais e acompanhar solicitações.',
  PERSONAL: 'Gerenciar seu cadastro profissional e propostas.',
  ADMIN: 'Administrar a plataforma FitPeso.',
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  closeProfileChooser()
}

onMounted(async () => {
  await nextTick()
  dialog.value?.querySelector('button')?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="profile-select-overlay" @click.self="closeProfileChooser" @keydown="handleEscape">
      <section ref="dialog" class="profile-select-dialog" role="dialog" aria-modal="true"
        aria-labelledby="profile-select-title" aria-describedby="profile-select-description">
        <h2 id="profile-select-title">Escolha seu perfil</h2>
        <p id="profile-select-description">
          Você possui mais de um perfil na FitPeso. Como deseja continuar?
        </p>
        <div class="profile-select-options">
          <button v-for="profile in selectableProfiles" :key="profile.usuarioId"
            type="button" class="profile-select-option"
            :disabled="profileSwitchBusy"
            @click="selectIdentityProfile(profile.tipo)">
            <span class="profile-select-name">{{ labels[profile.tipo] }}</span>
            <span class="profile-select-detail">{{ descriptions[profile.tipo] }}</span>
            <span v-if="activeRole === profile.tipo" class="profile-select-current">Perfil atual</span>
          </button>
        </div>
        <p v-if="profileSwitchError" class="profile-select-error" role="alert">{{ profileSwitchError }}</p>
        <p v-if="profileSwitchBusy" class="profile-select-status" role="status">Alterando perfil…</p>
        <button v-if="!profileChoiceRequired" class="profile-select-cancel" type="button"
          :disabled="profileSwitchBusy" @click="closeProfileChooser">Cancelar</button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.profile-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 23, 17, .68);
}
.profile-select-dialog {
  width: min(100%, 470px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 26px;
  background: var(--card-bg);
  color: var(--ink);
  box-shadow: 0 20px 65px rgba(0,0,0,.25);
}
.profile-select-dialog h2 {
  margin: 0 0 6px;
  font-size: clamp(22px,5vw,28px);
  font-weight: 800;
  line-height: 1.25;
}
.profile-select-dialog p {
  margin: 0 0 18px;
  color: var(--muted);
}
.profile-select-options { display: grid; gap: 11px; }
.profile-select-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  text-align: left;
  background: transparent;
  color: var(--ink);
  transition: border-color .15s ease, background .15s ease;
}
.profile-select-option:hover:not(:disabled),
.profile-select-option:focus-visible { border-color: var(--blue); background: color-mix(in srgb, var(--blue) 9%, var(--card-bg)); }
.profile-select-option:disabled { opacity: .65; cursor: progress; }
.profile-select-name { font-weight: 800; font-size: 17px; }
.profile-select-detail { color: var(--muted); font-size: 13px; }
.profile-select-current { font-size: 12px; font-weight: 700; color: var(--blue); }
.profile-select-error { margin-top: 14px !important; color: #d54444 !important; }
.profile-select-status { margin-top: 14px !important; }
.profile-select-cancel {
  margin-top: 17px;
  border: 0;
  background: transparent;
  color: var(--blue);
  font-weight: 700;
}
</style>
