<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PersonalCard from '../../components/profissionais/PersonalCard.vue'
import type { PublicTrainer } from '../../services/profissionaisService'

const props = defineProps<{
  trainers: PublicTrainer[]
  selectedIds: string[]
  selectable: boolean
  sentIds: string[]
  maxSelection?: number
  showRequestLink?: boolean
}>()
const visibleCount = ref(10)
watch(() => props.trainers, () => { visibleCount.value = 10 })
const visibleTrainers = computed(() => props.trainers.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < props.trainers.length)

const emit = defineEmits<{
  'update:selectedIds': [ids: string[]]
  'request-trainer': [id: string]
}>()

function updateSelection(trainerId: string, checked: boolean) {
  const ids = checked
    ? [...new Set([...props.selectedIds, trainerId])].slice(0, props.maxSelection ?? 20)
    : props.selectedIds.filter((id) => id !== trainerId)
  emit('update:selectedIds', ids)
}
</script>

<template>
  <div class="home-trainer-list">
    <PersonalCard
      v-for="trainer in visibleTrainers"
      :key="trainer.trainerId"
      :trainer="trainer"
      :show-request-link="showRequestLink"
      @request-trainer="emit('request-trainer', trainer.trainerId)"
      :selectable="selectable"
      :selected="selectedIds.includes(trainer.trainerId)"
      :disabled="
        sentIds.includes(trainer.trainerId) ||
        (!selectedIds.includes(trainer.trainerId) && selectedIds.length >= (maxSelection ?? 20))
      "
      :already-sent="sentIds.includes(trainer.trainerId)"
      @update:selected="(checked) => updateSelection(trainer.trainerId, checked)"
    />
    <div v-if="trainers.length" class="trainer-pagination">
      <button v-if="hasMore" type="button" class="trainer-load-more" @click="visibleCount += 10">Carregar mais</button>
      <p class="trainer-count">Exibindo {{ visibleTrainers.length }} de {{ trainers.length }} profissionais</p>
    </div>
  </div>
</template>

<style scoped>
.home-trainer-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}
.trainer-pagination { display: grid; justify-items: center; gap: 8px; margin-top: 10px; }
.trainer-count { margin: 0; color: var(--muted); font-size: .875rem; }
.trainer-load-more { padding: 8px 12px; border: 0; background: transparent; color: #286b4e; text-decoration: underline; font: inherit; font-weight: 700; cursor: pointer; }
:global(html[data-theme='dark']) .trainer-load-more { color: #55d6a3; }
</style>
