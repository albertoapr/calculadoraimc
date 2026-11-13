<script setup lang="ts">
import ProfissionaisListView from './ProfissionaisListView.vue'
import type { PublicTrainer } from '../../services/profissionaisService'

defineProps<{
  selectingForDraft: boolean
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
  'request-trainer': [id: string]
}>()
</script>

<template>
  <section class="home-trainer-directory public-directory" aria-labelledby="page-title">
    <div v-if="selectingForDraft" class="home-trainer-controls">
      <label class="home-academy-select">
        <span class="sr-only">Filtrar por academia</span>
        <select
          :value="academy"
          @change="emit('update:academy', ($event.target as HTMLSelectElement).value)"
          aria-label="Filtrar profissionais por academia"
        >
          <option value="">Todas as academias</option>
          <option v-for="academy in academies" :key="academy" :value="academy">
            {{ academy }}
          </option>
        </select>
      </label>
      <button
        v-if="selectingForDraft"
        class="primary-button home-proposal-button"
        type="button"
        :disabled="selectedIds.length === 0"
        @click="emit('continue')"
      >
        Continuar com {{ selectedIds.length }}
        {{ selectedIds.length === 1 ? 'personal' : 'personais' }} →
      </button>
      <button
        v-else-if="!selectingForDraft"
        class="primary-button home-proposal-button"
        type="button"
        :disabled="
          sharingBusy ||
          checkingRequests ||
          !!requestsError ||
          (!!activeRequest && (activeRequest.city !== city || activeRequest.proposalCount >= 5))
        "
        @click="emit('request-proposal')"
      >
        {{
          sharingBusy
            ? 'Enviando…'
            : checkingRequests
              ? 'Consultando…'
              : activeRequest
                ? 'Enviar solicitação'
                : 'Solicitar Atendimento'
        }}
      </button>
    </div>
    <p v-if="selectingForDraft" class="home-list-message">
      Profissionais de {{ requestCity }} · Gênero:
      {{ requestGender === 'indiferente' ? 'sem preferência' : requestGender }}
    </p>
    <p v-if="!selectingForDraft && activeRequest" class="home-list-message">
      <a href="#minhas-solicitacoes" @click.prevent="emit('open-requests')"
        >Ver solicitação aberta</a
      >
      · {{ activeRequest.city }}
    </p>
    <p
      v-if="!selectingForDraft && activeRequest && activeRequest.city !== city"
      class="home-list-message"
    >
      Para enviar esta solicitação, busque profissionais em {{ activeRequest.city }}.
    </p>
    <p
      v-else-if="!selectingForDraft && activeRequest && activeRequest.proposalCount >= 5"
      class="home-list-message"
    >
      Esta solicitação já atingiu o limite de propostas.
    </p>
    <p v-if="!selectingForDraft && requestsError" class="home-list-message" role="alert">
      {{ requestsError }}
      <button type="button" @click="emit('refresh-requests')">Tentar novamente</button>
    </p>
    <p v-if="!selectingForDraft && sharingMessage" class="home-list-message" role="status">
      {{ sharingMessage }}
    </p>
    <p v-if="!city" class="home-list-message">
      Selecione sua cidade na tela inicial para encontrar profissionais.
    </p>
    <p v-else-if="loading" class="home-list-message" role="status">Carregando profissionais…</p>
    <p v-else-if="error" class="home-list-message" role="alert">
      {{ error }} <button type="button" @click="emit('retry')">Tentar novamente</button>
    </p>
    <template v-else>
      <p class="home-list-heading">
        {{ trainers.length }} {{ trainers.length === 1 ? 'personal' : 'personais' }} em {{ city }}
      </p>
      <ProfissionaisListView
        :show-request-link="!selectingForDraft"
        @request-trainer="(id) => emit('request-trainer', id)"
        :trainers="trainers"
        :selected-ids="selectedIds"
        :selectable="
          selectingForDraft ||
          (!selectingForDraft &&
            !!signedInName &&
            !!activeRequest &&
            !checkingRequests &&
            !requestsError)
        "
        :sent-ids="sentIds"
        @update:selected-ids="(ids) => emit('update:selectedIds', ids)"
      />
      <p v-if="!trainers.length" class="home-list-message">
        Nenhum profissional encontrado para os critérios selecionados.
      </p>
    </template>
    <button
      v-if="!selectingForDraft && city && !loading && !error"
      class="primary-button home-proposal-button"
      type="button"
      :disabled="sharingBusy || checkingRequests || !!requestsError || (!!activeRequest && (activeRequest.city !== city || activeRequest.proposalCount >= 5))"
      @click="emit('request-proposal')"
    >
      {{ sharingBusy ? 'Enviando…' : checkingRequests ? 'Consultando…' : activeRequest ? 'Enviar solicitação' : 'Solicitar atendimento' }}
    </button>
  </section>
</template>

<style scoped>
.home-trainer-directory {
  display: grid;
  gap: 16px;
  margin: 22px 0;
}
.home-trainer-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}
.home-trainer-controls button,
.home-academy-select select {
  min-width: 0;
  width: 100%;
  min-height: 48px;
  font: inherit;
}
.home-academy-select select {
  color: inherit;
  background: var(--input-bg, transparent);
  border: 1px solid currentColor;
  border-radius: 12px;
  padding: 10px;
}
.home-list-heading,
.home-list-message {
  margin: 0;
}
@media (max-width: 700px) {
  .home-trainer-controls {
    grid-template-columns: 1fr 1fr;
  }
  .home-trainer-controls .home-proposal-button {
    grid-column: 1 / -1;
  }
}
</style>
