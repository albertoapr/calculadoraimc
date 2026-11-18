<script setup lang="ts">
import { computed } from 'vue'
import { trainerInstagramUrl } from '../../utils/trainer'

export type TrainerCardData = {
  trainerId: string
  name: string
  slug?: string
  googlePhotoUrl?: string
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
const displayName = computed(() => props.trainer.name.trim())
const instagramUrl = computed(() => trainerInstagramUrl(props.trainer.instagram ?? ''))
const profileUrl = computed(() =>
  props.trainer.slug ? `/personal/${encodeURIComponent(props.trainer.slug)}` : `/p/${encodeURIComponent(props.trainer.trainerId)}`,
)
const photoUrl = computed(() => {
  const url = props.trainer.googlePhotoUrl ?? ''
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'googleusercontent.com' || parsed.hostname.endsWith('.googleusercontent.com'))
      ? url : ''
  } catch {
    return ''
  }
})
function toggle() {
  if (props.selectable && !props.disabled) emit('update:selected', !props.selected)
}
function onKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    toggle()
  }
}
function copyCref() {
  const cref = props.trainer.cref?.trim()
  if (cref && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(cref).catch(() => undefined)
  }
}
</script>

<template>
  <article
    class="home-trainer-card"
    :class="{ 'is-selected': selectable && selected, 'is-disabled': selectable && disabled }"
    :role="selectable ? 'checkbox' : undefined"
    :tabindex="selectable && !disabled ? 0 : undefined"
    :aria-checked="selectable ? selected : undefined"
    :aria-disabled="selectable ? disabled : undefined"
    :aria-label="selectable ? 'Selecionar ' + displayName : undefined"
    @click="toggle"
    @keydown="onKeydown"
  >
    <div class="trainer-profile-photo">
      <img v-if="photoUrl" :src="photoUrl" :alt="'Foto de ' + displayName" loading="lazy" referrerpolicy="no-referrer" />
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </svg>
    </div>
    <div class="trainer-card-info">
      <a class="trainer-name-link" :href="profileUrl" @click.stop>{{ displayName }}</a>
      <a
        v-if="trainer.cref?.trim()"
        class="trainer-cref-link"
        href="https://www.confef.org.br/registrados/"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="'Consultar CREF ' + trainer.cref + ' no CONFEF'"
        title="Copiar CREF e abrir consulta no CONFEF"
        @click.stop="copyCref"
      >
        CREF {{ trainer.cref }}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" />
        </svg>
      </a>
      <span v-if="alreadySent" class="trainer-already-sent">Solicitação já enviada</span>
      <a
        v-if="instagramUrl"
        class="trainer-instagram-link"
        :href="instagramUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="'Instagram de ' + displayName"
        title="Instagram"
        @click.stop
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </a>
    </div>
    <span v-if="selectable" class="trainer-selection-indicator" aria-hidden="true">
      <svg v-if="selected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7">
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>
  </article>
</template>

<style scoped>
.home-trainer-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  background: var(--card-bg, #f2f4ee);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}
.home-trainer-card.is-selected {
  border-color: #286b4e;
  box-shadow: inset 0 0 0 1px #286b4e;
}
.home-trainer-card.is-disabled { opacity: .62; cursor: default; }
.trainer-profile-photo {
  display: grid;
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  place-items: center;
  overflow: hidden;
  border-radius: 7px;
  background: var(--line);
}
.trainer-profile-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.trainer-profile-photo svg { width: 34px; height: 34px; opacity: .75; }
.trainer-card-info { display: flex; flex: 1; min-width: 0; flex-direction: column; align-items: flex-start; gap: 5px; }
.trainer-name-link { color: var(--ink); font-weight: 700; font-size: 1rem; overflow-wrap: anywhere; text-decoration: none; }
.trainer-name-link:hover, .trainer-name-link:focus-visible { text-decoration: underline; }
.trainer-cref-link { display: inline-flex; align-items: center; gap: 6px; font-size: .84rem; color: var(--muted); text-decoration: none; }
.trainer-cref-link:hover { text-decoration: underline; }
.trainer-cref-link svg { width: 15px; height: 15px; color: #286b4e; }
.trainer-instagram-link { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; color: var(--ink); }
.trainer-instagram-link svg { width: 21px; height: 21px; }
.trainer-already-sent { font-size: .75rem; color: var(--muted); }
.trainer-selection-indicator { display: grid; flex: 0 0 22px; width: 22px; height: 22px; place-items: center; border: 2px solid var(--muted); border-radius: 5px; }
.trainer-selection-indicator svg { width: 17px; height: 17px; }
.is-selected .trainer-selection-indicator { color: white; background: #286b4e; border-color: #286b4e; }
.home-trainer-card:focus-visible { outline: 2px solid #55d6a3; outline-offset: 2px; }
:global(html[data-theme='dark']) .home-trainer-card { background: #1b2720; border-color: #3b4b40; color: #f4f5f0; }
:global(html[data-theme='dark']) .home-trainer-card.is-selected { background: #213e30; border-color: #55d6a3; box-shadow: inset 0 0 0 1px #55d6a3; }
:global(html[data-theme='dark']) .trainer-name-link { color: #fff; }
:global(html[data-theme='dark']) .trainer-cref-link { color: #c4d2c8; }
:global(html[data-theme='dark']) .trainer-cref-link svg { color: #55d6a3; }
:global(html[data-theme='dark']) .trainer-instagram-link { color: #d5e5d8; }
:global(html[data-theme='dark']) .is-selected .trainer-selection-indicator { background: #55d6a3; border-color: #55d6a3; color: #12251b; }
@media (max-width: 360px) { .trainer-profile-photo { width: 64px; height: 64px; flex-basis: 64px; } }
</style>
