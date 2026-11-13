<script setup lang="ts">
import { computed } from 'vue'
import { trainerDisplayName, trainerInstagramUrl } from '../../utils/trainer'

export type TrainerCardData = {
  trainerId: string
  name: string
  instagram?: string
  cref?: string
  academias?: string[]
  gymName?: string
  academy?: string
}

const props = defineProps<{
  trainer: TrainerCardData
  selectable: boolean
  selected: boolean
  disabled: boolean
  alreadySent: boolean
  showRequestLink?: boolean
}>()
const emit = defineEmits<{ 'update:selected': [value: boolean]; 'request-trainer': [] }>()
const displayName = computed(() => trainerDisplayName(props.trainer.name))
const instagramUrl = computed(() =>
  props.trainer.instagram ? trainerInstagramUrl(props.trainer.instagram) : '',
)
</script>

<template>
  <label
    class="home-trainer-card"
    :class="{ 'is-selected': selectable && selected, 'is-disabled': selectable && disabled }"
  >
    <input
      v-if="selectable"
      type="checkbox"
      :checked="selected"
      :disabled="disabled"
      :aria-label="'Selecionar ' + displayName"
      @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
    />
    <span class="home-trainer-info">
      <span class="home-trainer-name-row">
        <span class="trainer-identity">
          <strong>{{ displayName }}</strong>
          <span v-if="trainer.cref?.trim()" class="trainer-cref">
            CREF: {{ trainer.cref }}
            <a href="https://www.confef.org.br/registrados/" target="_blank" rel="noopener noreferrer" class="trainer-cref-search" :aria-label="'Consultar CREF de ' + displayName + ' no CONFEF'" title="Consultar registro no CONFEF" @click.stop>🔎</a>
          </span>
        </span>
        <span class="trainer-social-links">
          <button v-if="showRequestLink" type="button" class="trainer-whatsapp-link" :aria-label="'Solicitar atendimento com ' + displayName" title="Solicitar atendimento" @click.prevent.stop="emit('request-trainer')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.4 7.5L3 21l1.8-4.9a8.5 8.5 0 1 1 15.7-4.3Z"/><path d="M9 8.7c-.5.3-.7 1.1-.4 1.9.6 1.7 2.2 3.3 3.9 3.9.8.3 1.6.1 1.9-.4l.5-.8-1.8-1-1 .9c-.9-.4-1.6-1.1-2-2l.9-1-1-1.8-.9.3Z"/></svg>
        </button>
        <a
          v-if="instagramUrl"
          :href="instagramUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="trainer-instagram-link"
          :aria-label="'Instagram de ' + displayName"
          title="Instagram"
          @click.stop
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </a>
        </span>
      </span>
      <small v-if="alreadySent">Solicitação já enviada</small>
    </span>
  </label>
</template>

<style scoped>
.trainer-identity {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.trainer-cref {
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.trainer-cref-search {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  text-decoration: none !important;
  font-size: 1rem;
}
.trainer-social-links {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 2px;
}
.trainer-whatsapp-link { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; color: #188b51; background: transparent; border: 0; cursor: pointer; }
.trainer-whatsapp-link svg { width: 25px; height: 25px; }
.trainer-instagram-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
}
.trainer-instagram-link svg {
  width: 24px;
  height: 24px;
}
.home-trainer-card {
  display: flex;
  gap: 14px;
  align-items: center;
  border: 1px solid var(--border-color, #86978f);
  border-radius: 16px;
  padding: 14px;
  cursor: pointer;
}
.home-trainer-card.is-selected {
  border-color: var(--blue, #286b4e);
  background: color-mix(in srgb, var(--blue, #286b4e) 12%, var(--card-bg, #f2f4ee));
  box-shadow: inset 0 0 0 1px var(--blue, #286b4e);
}
.home-trainer-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.68;
}
.home-trainer-card:focus-within {
  outline: 2px solid var(--blue, #286b4e);
  outline-offset: 2px;
}
.home-trainer-card input {
  flex: none;
  width: 22px;
  height: 22px;
  accent-color: #08763a;
}
.home-trainer-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.home-trainer-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.home-trainer-name-row strong {
  min-width: 0;
}
.home-trainer-name-row .trainer-instagram-link {
  flex-shrink: 0;
}
.home-trainer-info strong {
  font-size: 1.05rem;
}
.home-trainer-info a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
