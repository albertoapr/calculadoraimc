<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  academies: string[]
  academy: string
}>()

const emit = defineEmits<{
  confirm: [academy: string]
  close: []
}>()

const selectedAcademy = ref(props.academy)
const selectElement = ref<HTMLSelectElement | null>(null)

onMounted(() => selectElement.value?.focus())

function confirmSelection() {
  if (props.academies.includes(selectedAcademy.value)) emit('confirm', selectedAcademy.value)
}
</script>

<template>
  <div
    class="academy-dialog-backdrop"
    @click.self="emit('close')"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <section
      class="academy-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="academy-dialog-title"
    >
      <h2 id="academy-dialog-title">
        <span class="academy-dialog-title-primary">Selecione</span>
        <span class="academy-dialog-title-secondary"> a academia</span>
      </h2>
      <label for="academy-dialog-select">Academia</label>
      <select
        id="academy-dialog-select"
        ref="selectElement"
        v-model="selectedAcademy"
      >
        <option value="" disabled>Selecione uma academia</option>
        <option v-for="item in academies" :key="item" :value="item">
          {{ item }}
        </option>
      </select>
      <p v-if="!academies.length" class="academy-dialog-empty">
        Nenhuma academia encontrada para esta cidade.
      </p>
      <div class="academy-dialog-actions">
        <button type="button" class="academy-dialog-cancel" @click="emit('close')">
          Cancelar
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="!academies.includes(selectedAcademy)"
          @click="confirmSelection"
        >
          OK
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.academy-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.58);
}
.academy-dialog {
  width: min(100%, 430px);
  display: grid;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card-bg);
  color: var(--ink);
  text-align: left;
  box-shadow: 0 16px 55px rgba(0, 0, 0, 0.25);
}
.academy-dialog h2 {
  margin: 0 0 8px;
  font-size: 22px;
  text-align: center;
}
.academy-dialog-title-primary {
  color: #286b4e;
}
.academy-dialog-title-secondary {
  color: #263f33;
}
.academy-dialog label {
  font-weight: 700;
}
.academy-dialog select {
  width: 100%;
  min-height: 48px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card-bg);
  color: var(--ink);
  color-scheme: normal;
}
:global(html[data-theme='dark']) .academy-dialog {
  background: #1b2720;
  border-color: #3b4b40;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .academy-dialog h2,
:global(html[data-theme='dark']) .academy-dialog label {
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .academy-dialog-title-primary {
  color: #55d6a3;
}
:global(html[data-theme='dark']) .academy-dialog-title-secondary {
  color: #f1f5f3;
}
:global(html[data-theme='dark']) .academy-dialog select {
  color-scheme: dark;
  background: #17211b;
  border-color: #3b4b40;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .academy-dialog select option {
  background: #17211b;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .academy-dialog-cancel {
  border-color: #3b4b40;
  background: #26342b;
  color: #f4f5f0;
}
:global(html[data-theme='dark']) .academy-dialog-empty {
  color: #b5c0b8;
}
.academy-dialog-empty {
  margin: 0;
  color: var(--muted);
}
.academy-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
.academy-dialog-actions button {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 10px;
}
.academy-dialog-cancel {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
}
.academy-dialog :focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
</style>
