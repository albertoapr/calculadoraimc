<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { trainerReceivedRequests, trainerRequestsStatus, goHome, openTrainerReceivedRequests } =
  useFitpesoContext()
</script>

<template>
  <section class="customer-requests-view" aria-labelledby="page-title">
    <p v-if="trainerRequestsStatus" class="status" role="status">{{ trainerRequestsStatus }}</p>
    <button class="secondary-button" type="button" @click="openTrainerReceivedRequests">
      Atualizar solicitações
    </button>
    <article
      v-for="request in trainerReceivedRequests"
      :key="request.requestId"
      class="customer-request-card"
    >
      <h2>
        {{ request.city }}<span v-if="request.objective"> · {{ request.objective }}</span>
      </h2>
      <p>Cliente: {{ request.clientName }}</p>
      <p>Recebida em {{ new Date(request.createdAt).toLocaleString('pt-BR') }}</p>
      <p>Válida até {{ new Date(request.validUntil * 1000).toLocaleString('pt-BR') }}</p>
      <a class="secondary-button" :href="'/?token=' + encodeURIComponent(request.token)"
        >Ver solicitação e enviar proposta</a
      >
    </article>
    <button class="back-button" type="button" @click="goHome">Início</button>
  </section>
</template>
