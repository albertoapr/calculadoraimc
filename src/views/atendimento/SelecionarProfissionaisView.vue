<script setup lang="ts">
import ProfissionaisDirectoryView from '../profissionais/ProfissionaisDirectoryView.vue'
import type { PublicTrainer } from '../../services/profissionaisService'

defineProps<{
  draftSelection: boolean
  academy: string
  academies: string[]
  trainers: PublicTrainer[]
  selectedIds: string[]
  sentIds: string[]
  city: string
  requestCity: string
  requestGender: string
  signedInName: string
  activeRequest: { city: string; proposalCount: number } | null | undefined
  checkingRequests: boolean
  requestsError: string
  sharingBusy: boolean
  sharingMessage: string
  loading: boolean
  error: string
}>()
const emit = defineEmits<{
  'update:academy': [value: string]
  'update:selectedIds': [ids: string[]]
  continue: []
  'request-proposal': []
  'open-requests': []
  'refresh-requests': []
  retry: []
}>()
</script>

<template>
  <div class="trainer-selection-stage">
    <p class="trainer-selection-instruction">Escolha até 20 profissionais</p>
    <ProfissionaisDirectoryView
      :selecting-for-draft="true"
      :academy="academy"
      :academies="academies"
      :trainers="trainers"
      :selected-ids="selectedIds"
      :sent-ids="sentIds"
      :city="city"
      :request-city="requestCity"
      :request-gender="requestGender"
      :signed-in-name="signedInName"
      :active-request="activeRequest"
      :checking-requests="checkingRequests"
      :requests-error="requestsError"
      :sharing-busy="sharingBusy"
      :sharing-message="sharingMessage"
      :loading="loading"
      :error="error"
      @update:academy="(value) => emit('update:academy', value)"
      @update:selected-ids="(ids) => emit('update:selectedIds', ids)"
      @continue="emit('continue')"
      @request-proposal="emit('request-proposal')"
      @open-requests="emit('open-requests')"
      @refresh-requests="emit('refresh-requests')"
      @retry="emit('retry')"
    />
  </div>
</template>

<style scoped>
.trainer-selection-stage {
  display: grid;
  gap: 12px;
}
.trainer-selection-instruction {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}
</style>
