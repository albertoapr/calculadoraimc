<script setup lang="ts">
import { computed } from 'vue'
import { trainerDisplayName, trainerInstagramUrl } from '../../utils/trainer'

export type TrainerCardData = {
  trainerId: string
  name: string
  instagram?: string
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
}>()
const emit = defineEmits<{ 'update:selected': [value: boolean] }>()
const displayName = computed(() => trainerDisplayName(props.trainer.name))
const instagramUrl = computed(() =>
  props.trainer.instagram ? trainerInstagramUrl(props.trainer.instagram) : '',
)
const academies = computed(() =>
  [...(props.trainer.academias ?? []), props.trainer.gymName ?? '', props.trainer.academy ?? '']
    .filter(Boolean)
    .join(', '),
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
    <span class="home-trainer-avatar" aria-hidden="true">{{
      displayName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
    }}</span>
    <span class="home-trainer-info">
      <span class="home-trainer-name-row">
        <strong>{{ displayName }}</strong>
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
      <small v-if="academies">{{ academies }}</small>
      <small v-if="alreadySent">Solicitação já enviada</small>
    </span>
  </label>
</template>

<style scoped>
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
.home-trainer-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 12px;
  background: #d9efe0;
  color: #075f32;
  font-weight: 750;
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
