<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { trainerDisplayName, trainerInstagramUrl } from '../../utils/trainer'
import type { PublicTrainer } from '../../services/profissionaisService'

const props = defineProps<{
  trainers: PublicTrainer[]
  selectable?: boolean
  selectedIds?: string[]
  sentIds?: string[]
}>()
const emit = defineEmits<{ 'update:selectedIds': [ids: string[]] }>()
const chosenIds = computed(() => props.selectedIds ?? [])
function updateSelection(id: string, checked: boolean) {
  const next = checked
    ? [...new Set([...chosenIds.value, id])].slice(0, 20)
    : chosenIds.value.filter((value) => value !== id)
  emit('update:selectedIds', next)
}
const visibleCount = ref(10)
watch(
  () => props.trainers,
  () => {
    visibleCount.value = 10
  },
)
const visibleTrainers = computed(() => props.trainers.slice(0, visibleCount.value))
</script>

<template>
  <div class="home-simple-trainers">
    <table v-if="trainers.length" class="home-simple-trainers-table">
      <thead>
        <tr>
          <th scope="col">Profissional</th>
          <th scope="col" class="home-simple-social-heading"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="trainer in visibleTrainers" :key="trainer.trainerId">
          <td>
            <label v-if="selectable" class="trainer-table-choice">
              <input
                type="checkbox"
                :checked="chosenIds.includes(trainer.trainerId)"
                :disabled="(sentIds ?? []).includes(trainer.trainerId) || (!chosenIds.includes(trainer.trainerId) && chosenIds.length >= 20)"
                :aria-label="'Selecionar ' + trainerDisplayName(trainer.name)"
                @change="updateSelection(trainer.trainerId, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ trainerDisplayName(trainer.name) }}</span>
            </label>
            <template v-else>{{ trainerDisplayName(trainer.name) }}</template>
          </td>
          <td class="home-simple-social-cell">
            <a
              v-if="trainer.instagram && trainerInstagramUrl(trainer.instagram)"
              :href="trainerInstagramUrl(trainer.instagram)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="'Instagram de ' + trainerDisplayName(trainer.name)"
              title="Ver Instagram"
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
          </td>
        </tr>
      </tbody>
    </table>
    <button
      v-if="trainers.length > visibleCount"
      type="button"
      class="home-more-results"
      @click="visibleCount += 10"
    >
      Mais resultados
    </button>
  </div>
</template>

<style scoped>
.home-simple-trainers-table {
  width: 100%;
  max-width: 100%;
  margin: 0;
  border-collapse: collapse;
  color: var(--ink);
  text-align: left;
  table-layout: auto;
}
.home-simple-trainers-table th,
.home-simple-trainers-table td {
  padding: 6px 9px;
  border-bottom: 1px solid var(--line);
}
.home-simple-trainers-table th {
  font-weight: 700;
}
.trainer-table-choice {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.trainer-table-choice input {
  width: 18px;
  height: 18px;
  accent-color: var(--blue);
}
.home-simple-social-heading,
.home-simple-social-cell {
  width: 66px;
  text-align: center;
}
.home-simple-social-cell a {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  color: inherit;
}
.home-simple-social-cell svg {
  width: 21px;
  height: 21px;
}
.home-more-results {
  display: block;
  margin: 12px auto 0;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--blue-dark, var(--ink));
  text-decoration: underline;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
:global(html[data-theme='dark']) .home-more-results {
  color: #55d6a3;
}
.home-simple-empty {
  margin: 0;
  color: var(--muted);
}
</style>
