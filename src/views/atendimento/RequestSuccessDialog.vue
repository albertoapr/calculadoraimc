<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { requestSent, goHome, openSentRequests } = useFitpesoContext()
</script>

<template>
<div v-if="requestSent" class="success-overlay" role="presentation" @click.self="goHome">
        <section
          class="success-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-sent-title"
        >
          <div class="success-mark" aria-hidden="true">✓</div>
          <h2 id="request-sent-title">Solicitação registrada!</h2>
          <p>
            Sua solicitação foi criada! Agora, envie-a para algum personal para receber uma
            proposta. Ela ficará disponível por até 7 dias.
          </p>
          <button class="primary-button" type="button" @click="openSentRequests">
            Ver minhas solicitações
          </button>
        </section>
      </div>
</template>
