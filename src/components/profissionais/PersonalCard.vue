<script setup lang="ts">
import { computed, ref } from 'vue'
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
const expanded = ref(false)
const displayName = computed(() => trainerDisplayName(props.trainer.name))
const instagramUrl = computed(() =>
  props.trainer.instagram ? trainerInstagramUrl(props.trainer.instagram) : '',
)
</script>

<template>
  <article class="home-trainer-card" :class="{ 'is-selected': selectable && selected, 'is-disabled': selectable && disabled }">
    <div class="trainer-accordion-header">
      <input
        v-if="selectable"
        type="checkbox"
        class="trainer-select-checkbox"
        :checked="selected"
        :disabled="disabled"
        :aria-label="'Selecionar ' + displayName"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
      <button
        type="button"
        class="trainer-accordion-toggle"
        :aria-expanded="expanded"
        :aria-controls="'trainer-details-' + trainer.trainerId"
        @click="expanded = !expanded"
      >
        <strong>{{ displayName }}</strong>
        <span class="trainer-accordion-chevron" :class="{ expanded }" aria-hidden="true"></span>
      </button>
    </div>
    <div v-if="expanded" :id="'trainer-details-' + trainer.trainerId" class="trainer-accordion-panel">
      <div class="trainer-details-text">
        <span v-if="trainer.cref?.trim()" class="trainer-cref">
          CREF: {{ trainer.cref }}
          <a href="https://www.confef.org.br/registrados/" target="_blank" rel="noopener noreferrer" class="trainer-cref-search" :aria-label="'Consultar CREF de ' + displayName + ' no CONFEF'" title="Consultar registro no CONFEF">🔎</a>
        </span>
        <small v-if="alreadySent">Solicitação já enviada</small>
      </div>
      <span class="trainer-social-links">
        <button v-if="showRequestLink" type="button" class="trainer-whatsapp-link" :aria-label="'Solicitar atendimento com ' + displayName" title="Solicitar atendimento" @click="emit('request-trainer')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.4 7.5L3 21l1.8-4.9a8.5 8.5 0 1 1 15.7-4.3Z"/><path d="M9 8.7c-.5.3-.7 1.1-.4 1.9.6 1.7 2.2 3.3 3.9 3.9.8.3 1.6.1 1.9-.4l.5-.8-1.8-1-1 .9c-.9-.4-1.6-1.1-2-2l.9-1-1-1.8-.9.3Z"/></svg>
        </button>
        <a v-if="instagramUrl" :href="instagramUrl" target="_blank" rel="noopener noreferrer" class="trainer-instagram-link" :aria-label="'Instagram de ' + displayName" title="Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </a>
      </span>
    </div>
  </article>
</template>

<style scoped>
.home-trainer-card {
  /* Sobrescreve o display:flex herdado da listagem antiga:
     cabeçalho e conteúdo do sanfonado devem ficar um abaixo do outro. */
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--line, #86978f);
  border-radius: 14px;
  background: var(--card-bg, #f2f4ee);
  overflow: hidden;
}
.home-trainer-card.is-selected {
  border-color: var(--blue, #286b4e);
  box-shadow: inset 0 0 0 1px var(--blue, #286b4e);
}
.trainer-accordion-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
}
.trainer-select-checkbox {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  accent-color: var(--blue, #286b4e);
  cursor: pointer;
}
.trainer-select-checkbox:disabled { cursor: not-allowed; opacity: .55; }
.trainer-accordion-toggle {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 8px 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  background: transparent;
  color: var(--ink, inherit);
  border: 0;
  cursor: pointer;
}
.trainer-accordion-toggle strong { font-size: 1.05rem; overflow-wrap: anywhere; }
.trainer-accordion-chevron {
  flex: 0 0 9px;
  width: 9px;
  height: 9px;
  margin-right: 7px;
  border-right: 2px solid var(--blue-dark, currentColor);
  border-bottom: 2px solid var(--blue-dark, currentColor);
  transform: rotate(45deg);
  transition: transform 150ms ease;
}
.trainer-accordion-chevron.expanded { transform: rotate(225deg); }
.trainer-accordion-toggle:focus-visible, .trainer-select-checkbox:focus-visible {
  outline: 2px solid var(--blue, currentColor);
  outline-offset: 2px;
}
.trainer-accordion-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--line, #86978f);
  color: var(--ink, inherit);
}
.trainer-details-text { display: flex; flex-direction: column; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.trainer-cref { font-size: .9rem; }
.trainer-cref-search { margin-left: 5px; text-decoration: none; }
.trainer-social-links { display: flex; flex-direction: row; flex-shrink: 0; align-items: center; justify-content: flex-end; gap: 4px; }
.trainer-whatsapp-link, .trainer-instagram-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
}
.trainer-whatsapp-link { color: #188b51; }
.trainer-whatsapp-link svg { width: 25px; height: 25px; }
.trainer-instagram-link svg { width: 24px; height: 24px; }
/* Mantém o sanfonado com a mesma paleta da tela de atendimento. */
:global(html[data-theme='dark']) .home-trainer-card {
  background: #1b2720;
  border-color: #3b4b40;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .home-trainer-card.is-selected {
  border-color: #f2a04b;
  box-shadow: inset 0 0 0 1px #f2a04b;
}
:global(html[data-theme='dark']) .trainer-accordion-toggle {
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .trainer-accordion-header:has(.trainer-accordion-toggle[aria-expanded='true']) {
  background: #29372d;
}
:global(html[data-theme='dark']) .trainer-accordion-chevron {
  border-color: #f2a04b;
}
:global(html[data-theme='dark']) .trainer-accordion-panel {
  background: #1b2720;
  border-color: #3b4b40;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .trainer-select-checkbox {
  accent-color: #f2a04b;
}
:global(html[data-theme='dark']) .trainer-whatsapp-link {
  color: #55d6a3;
}
@media (prefers-reduced-motion: reduce) {
  .trainer-accordion-chevron { transition: none; }
}
</style>
