<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  requestActionDialog,
  changingRequestId,
  requestActionError,
  confirmRequestVisibilityChange,
} = useFitpesoContext()
</script>

<template>
  <div
    v-if="requestActionDialog"
    class="request-action-overlay"
    @click.self="!changingRequestId && (requestActionDialog = null)"
    @keydown.esc="!changingRequestId && (requestActionDialog = null)"
  >
    <section
      class="request-action-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-action-title"
      aria-describedby="request-action-description"
    >
      <h2 id="request-action-title">
        {{
          requestActionDialog.action === 'deactivate'
            ? 'Inativar solicitação?'
            : 'Reativar solicitação?'
        }}
      </h2>
      <p id="request-action-description">
        {{
          requestActionDialog.action === 'deactivate'
            ? 'Os profissionais deixarão de receber esta solicitação. Você poderá reativá-la até o fim da validade.'
            : 'Sua solicitação voltará a ficar disponível aos profissionais selecionados.'
        }}
      </p>
      <p class="request-action-expiry">
        Validade original:
        {{ new Date(requestActionDialog.request.validUntil * 1000).toLocaleDateString('pt-BR') }}
      </p>
      <p v-if="requestActionError" class="request-action-error" role="alert">
        {{ requestActionError }}
      </p>
      <div class="request-action-buttons">
        <button
          type="button"
          class="secondary-button"
          :disabled="Boolean(changingRequestId)"
          @click="requestActionDialog = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="Boolean(changingRequestId)"
          @click="confirmRequestVisibilityChange"
        >
          {{
            changingRequestId
              ? 'Aguarde…'
              : requestActionDialog.action === 'deactivate'
                ? 'Sim, inativar'
                : 'Sim, reativar'
          }}
        </button>
      </div>
    </section>
  </div>
</template>
