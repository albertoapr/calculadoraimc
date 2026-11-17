<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'

const { openRequestForm, publicTrainer, publicTrainerBanner } = useFitpesoContext()

const sections = [
  { key: 'aboutMe', label: 'Sobre mim' },
  { key: 'education', label: 'Formação' },
  { key: 'workingMethod', label: 'Forma de trabalho' },
  { key: 'pricing', label: 'Valores' },
] as const
</script>

<template>
  <div class="personal-public-page">
    <p v-if="publicTrainer?.tagline" class="personal-subtitle">{{ publicTrainer.tagline }}</p>
    <div v-if="publicTrainer?.bannerUpdatedAt" class="personal-banner">
      <img v-if="publicTrainerBanner" :src="publicTrainerBanner" :alt="`Banner de ${publicTrainer.name}`"
        width="1069" height="594" decoding="async" />
      <div v-else class="personal-banner-loading">Carregando foto…</div>
    </div>

    <div class="personal-info-accordion">
      <details v-for="section in sections" :key="section.key" class="personal-info-item">
        <summary>{{ section.label }}</summary>
        <div class="personal-info-content">{{ publicTrainer?.[section.key] || 'Informações em breve.' }}</div>
      </details>
    </div>

    <div class="home-actions">
      <div class="home-action">
        <button class="primary-button" type="button" @click="openRequestForm">
          Solicitar Proposta
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.personal-public-page { width: 100%; }
.personal-subtitle { margin: 8px auto 16px; text-align: center; font-size: clamp(16px, 3.8vw, 21px); font-weight: 600; line-height: 1.35; color: var(--muted); }
.personal-banner { width: 100%; aspect-ratio: 1069 / 594; overflow: hidden; border-radius: 10px; background: var(--line); margin-bottom: 18px; }
.personal-banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
.personal-banner-loading { display: grid; place-items: center; height: 100%; color: var(--muted); }
.personal-info-accordion { display: grid; gap: 8px; margin: 12px 0 24px; }
.personal-info-item { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.personal-info-item summary { padding: 14px 16px; font-weight: 700; cursor: pointer; list-style-position: inside; }
.personal-info-item[open] summary { border-bottom: 1px solid var(--line); }
.personal-info-content { white-space: pre-wrap; line-height: 1.55; padding: 16px; overflow-wrap: anywhere; }
</style>
