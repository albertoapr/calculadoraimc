<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  formatDateForInput,
  localTodayIso,
  maskDateInput,
  parseDateInput,
} from '../utils/dateInput'

const props = withDefaults(
  defineProps<{
    id: string
    modelValue: string
    name?: string
    required?: boolean
    min?: string
    max?: string
  }>(),
  {
    name: undefined,
    required: false,
    min: '1900-01-01',
    max: localTodayIso(),
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const typedDate = ref(formatDateForInput(props.modelValue))
const textInput = ref<HTMLInputElement | null>(null)
const nativeDateInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (value) => {
    const formatted = formatDateForInput(value)
    if (formatted !== typedDate.value) typedDate.value = formatted
  },
)

function validateTypedDate(report = false) {
  const input = textInput.value
  if (!input) return false
  const value = typedDate.value.trim()
  const parsed = parseDateInput(value, props.min, props.max)
  const message = value && !parsed ? 'Informe uma data válida no formato DD/MM/AAAA.' : ''
  input.setCustomValidity(message)
  if (parsed) emit('update:modelValue', parsed)
  else if (!value) emit('update:modelValue', '')
  if (report && message) input.reportValidity()
  return Boolean(parsed)
}

function onTextInput(event: Event) {
  typedDate.value = maskDateInput((event.target as HTMLInputElement).value)
  textInput.value?.setCustomValidity('')
  if (typedDate.value.length === 10) validateTypedDate()
  else emit('update:modelValue', '')
}

function onNativeDate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  typedDate.value = formatDateForInput(value)
  textInput.value?.setCustomValidity('')
  emit('update:modelValue', value)
  textInput.value?.focus()
}

function openCalendar() {
  const input = nativeDateInput.value
  if (!input) return
  try {
    input.showPicker()
  } catch {
    input.focus()
    input.click()
  }
}

defineExpose({ validate: () => validateTypedDate(true) })
</script>

<template>
  <div class="date-input-with-picker">
    <input
      :id="id"
      ref="textInput"
      :name="name"
      :value="typedDate"
      type="text"
      inputmode="numeric"
      autocomplete="bday"
      placeholder="DD/MM/AAAA"
      maxlength="10"
      :required="required"
      @input="onTextInput"
      @blur="validateTypedDate()"
    />
    <button
      type="button"
      class="date-picker-button"
      aria-label="Abrir calendário"
      title="Abrir calendário"
      @click="openCalendar"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 10h18" />
      </svg>
    </button>
    <input
      ref="nativeDateInput"
      class="date-picker-native"
      type="date"
      :value="modelValue"
      :min="min"
      :max="max"
      tabindex="-1"
      aria-hidden="true"
      @change="onNativeDate"
    />
  </div>
</template>
