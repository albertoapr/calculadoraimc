<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  trainerRequest,
  trainerProposalPrice,
  trainerProposalMessage,
  trainerProposalSubmitting,
  trainerRequestStatus,
  submitTrainerProposal,
} = useFitpesoContext()
</script>

<template>
  <section class="trainer-request-view" aria-labelledby="page-title">
    <p v-if="trainerRequestStatus" class="status" role="status" aria-live="polite">
      {{ trainerRequestStatus }}
    </p>
    <div v-else-if="trainerRequest" class="trainer-request-details">
      <dl>
        <div>
          <dt>Nome</dt>
          <dd>{{ trainerRequest.clientName }}</dd>
        </div>
        <div v-if="trainerRequest.age">
          <dt>Idade</dt>
          <dd>{{ trainerRequest.age }} anos</dd>
        </div>
        <div v-if="trainerRequest.clientGender">
          <dt>Gênero do cliente</dt>
          <dd>
            {{
              trainerRequest.clientGender === 'feminino'
                ? 'Mulher'
                : trainerRequest.clientGender === 'masculino'
                  ? 'Homem'
                  : 'Prefere não informar'
            }}
          </dd>
        </div>
        <div>
          <dt>Cidade</dt>
          <dd>{{ trainerRequest.city }}</dd>
        </div>
        <div v-if="trainerRequest.objective">
          <dt>Objetivo</dt>
          <dd>{{ trainerRequest.objective }}</dd>
        </div>
        <div>
          <dt>Participantes</dt>
          <dd>{{ trainerRequest.withCompanion ? 'Com um acompanhante' : 'Sozinho' }}</dd>
        </div>
        <div v-if="trainerRequest.desiredDuration">
          <dt>Tempo de acompanhamento</dt>
          <dd>{{ trainerRequest.desiredDuration }}</dd>
        </div>
        <div v-if="trainerRequest.attendsGym">
          <dt>Frequenta academia</dt>
          <dd>Sim</dd>
        </div>
        <div v-if="trainerRequest.attendsGym && trainerRequest.gymName">
          <dt>Qual?</dt>
          <dd>{{ trainerRequest.gymName }}</dd>
        </div>
        <div>
          <dt>Disponibilidade para treino</dt>
          <dd>
            {{
              [
                trainerRequest.trainingDays.length
                  ? `Dias: ${trainerRequest.trainingDays.join(', ')}`
                  : '',
                trainerRequest.trainingStartTime && trainerRequest.trainingEndTime
                  ? `Horário: ${trainerRequest.trainingStartTime} às ${trainerRequest.trainingEndTime}`
                  : trainerRequest.trainingShifts.length
                    ? `Turnos: ${trainerRequest.trainingShifts.join(', ')}`
                    : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'Não informada'
            }}
          </dd>
        </div>
      </dl>
      <p class="trainer-request-expiry">
        Válida até {{ new Date(trainerRequest.validUntil * 1000).toLocaleString('pt-BR') }}.
      </p>
      <form
        v-if="!trainerRequest.proposalAlreadySent"
        class="form contact-fields"
        @submit.prevent="submitTrainerProposal"
      >
        <label class="field field-wide" for="trainer-proposal-price"
          ><span class="field-label">Valor mensal (R$)</span
          ><input
            id="trainer-proposal-price"
            v-model="trainerProposalPrice"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            inputmode="decimal"
            required
        /></label>
        <label class="field field-wide" for="trainer-proposal-message"
          ><span class="field-label">Mensagem <span>opcional</span></span
          ><textarea
            id="trainer-proposal-message"
            v-model="trainerProposalMessage"
            maxlength="500"
            rows="4"
            placeholder="Apresente sua proposta"
          ></textarea>
        </label>
        <button
          class="primary-button field-wide"
          type="submit"
          :disabled="trainerProposalSubmitting"
        >
          {{ trainerProposalSubmitting ? 'Enviando…' : 'Enviar proposta' }}
        </button>
      </form>
      <p v-else class="status">Você já enviou uma proposta para esta solicitação.</p>
    </div>
  </section>
</template>
