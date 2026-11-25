<script setup lang="ts">
import { ref } from 'vue'
import RequestAccordionItem from '../../components/RequestAccordionItem.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const { openRequestForm, publicTrainer, publicTrainerBanner } = useFitpesoContext()

const sections = [
  { key: 'aboutMe', label: 'Sobre mim', icon: '👤' },
  { key: 'education', label: 'Formação', icon: '🎓' },
  { key: 'workingMethod', label: 'Forma de trabalho', icon: '🏋️' },
  { key: 'pricing', label: 'Valores', icon: '💰' },
] as const

type ProfileSection = (typeof sections)[number]['key']
const expandedSection = ref<ProfileSection | null>(null)

function toggleSection(section: ProfileSection) {
  expandedSection.value = expandedSection.value === section ? null : section
}
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
      <RequestAccordionItem
        v-for="section in sections"
        :key="section.key"
        :open="expandedSection === section.key"
      >
        <template #header>
          <h3 class="request-accordion-heading">
            <button
              type="button"
              class="request-accordion-toggle"
              :aria-expanded="expandedSection === section.key"
              :aria-controls="`public-personal-panel-${section.key}`"
              @click="toggleSection(section.key)"
            >
              <span class="request-accordion-icon" aria-hidden="true">{{ section.icon }}</span>
              <span class="request-accordion-title">{{ section.label }}</span>
              <span class="request-accordion-preview"></span>
              <span class="request-accordion-chevron" aria-hidden="true"></span>
            </button>
          </h3>
        </template>
        <div
          v-if="expandedSection === section.key"
          :id="`public-personal-panel-${section.key}`"
          class="request-accordion-panel personal-info-content"
        >
          {{ publicTrainer?.[section.key] || 'Informações em breve.' }}
        </div>
      </RequestAccordionItem>
    </div>

    <div class="home-actions">
      <div class="home-action">
        <button class="primary-button" type="button" @click="openRequestForm">
          Treine comigo
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
.personal-info-accordion { display: grid; gap: 12px; margin: 12px 0 24px; }
.personal-info-content { white-space: pre-wrap; line-height: 1.55; overflow-wrap: anywhere; }
</style>
