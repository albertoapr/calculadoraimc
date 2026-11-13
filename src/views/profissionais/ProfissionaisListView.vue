<script setup lang="ts">
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
const emit = defineEmits<{ 'update:selectedIds': [ids: string[]]; 'request-trainer': [id: string] }>()

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
      v-for="trainer in trainers"
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
  </div>
</template>

<style scoped>
.home-trainer-list {
  display: grid;
  gap: 10px;
}
</style>
