<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  openTrainersForRequest,
  customerRequests,
  customerRequestsStatus,
  changingRequestId,
  goHome,
  openCustomerRequests,
  changeRequestVisibility,
  acceptProposal,
} = useFitpesoContext()
</script>

<template>
  <section class="customer-requests-view" aria-labelledby="page-title">
    <p v-if="customerRequestsStatus" class="status" role="status">{{ customerRequestsStatus }}</p>
    <button class="secondary-button" type="button" @click="openCustomerRequests">
      Atualizar propostas
    </button>
    <article
      v-for="request in customerRequests"
      :key="request.requestId"
      class="customer-request-card"
    >
      <h2>
        {{ request.city }}<span v-if="request.objective"> · {{ request.objective }}</span>
      </h2>
      <p>
        Status:
        {{
          request.lifecycle === 'ACCEPTED'
            ? 'Atendimento iniciado'
            : request.requestExpired
              ? 'Solicitação expirada'
              : request.lifecycle === 'CLOSED'
                ? 'Solicitação fechada; propostas válidas ainda podem ser escolhidas'
                : request.lifecycle === 'INACTIVE'
                  ? 'Inativa temporariamente'
                  : 'Recebendo propostas'
        }}
      </p>
      <p v-if="request.acceptedAt">
        Atendimento iniciado em {{ new Date(request.acceptedAt).toLocaleString('pt-BR') }}.
      </p>
      <p>
        {{ request.proposalCount }} de até 5 propostas · válida até
        {{ new Date(request.validUntil * 1000).toLocaleDateString('pt-BR') }}
      </p>
      <p v-if="!request.proposals.length">
        {{
          request.lifecycle === 'INACTIVE'
            ? 'Solicitação pausada. Nenhum personal poderá enviar propostas até a reativação.'
            : 'Ainda não há propostas. Confira novamente mais tarde.'
        }}
      </p>
      <button
        v-if="
          !request.requestExpired &&
          request.validUntil * 1000 > Date.now() &&
          request.lifecycle === 'OPEN'
        "
        class="primary-button"
        type="button"
        @click="openTrainersForRequest(request)"
      >
        Enviar para personais
      </button>
      <button
        v-if="
          !request.requestExpired &&
          request.validUntil * 1000 > Date.now() &&
          request.lifecycle === 'OPEN' &&
          request.proposalCount === 0 &&
          request.proposals.length === 0
        "
        class="secondary-button"
        type="button"
        :disabled="Boolean(changingRequestId)"
        @click="changeRequestVisibility(request, 'deactivate')"
      >
        Inativar solicitação
      </button>
      <button
        v-if="
          !request.requestExpired &&
          request.validUntil * 1000 > Date.now() &&
          request.lifecycle === 'INACTIVE'
        "
        class="secondary-button"
        type="button"
        :disabled="Boolean(changingRequestId)"
        @click="changeRequestVisibility(request, 'reactivate')"
      >
        Reativar solicitação
      </button>
      <div
        v-for="proposal in request.proposals"
        :key="proposal.trainerId"
        class="customer-proposal-card"
      >
        <h3>{{ proposal.name }}</h3>
        <p>
          <strong>Valor:</strong>
          {{
            proposal.monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          }}
        </p>
        <p v-if="proposal.message">{{ proposal.message }}</p>
        <p>
          Válida até {{ new Date(proposal.validUntil * 1000).toLocaleString('pt-BR')
          }}<span v-if="proposal.expired"> · Expirada</span>
        </p>
        <p
          v-if="proposal.status === 'OPEN' && !proposal.expired && request.lifecycle !== 'ACCEPTED'"
          class="proposal-contact-links"
        >
          <a
            :href="'https://wa.me/' + proposal.whatsapp.replace(/\D/g, '')"
            target="_blank"
            rel="noopener noreferrer"
            >Conversar pelo WhatsApp</a
          ><a
            v-if="proposal.instagram"
            :href="'https://www.instagram.com/' + proposal.instagram.replace(/^@/, '') + '/'"
            target="_blank"
            rel="noopener noreferrer"
            >Instagram</a
          >
        </p>
        <button
          v-if="request.lifecycle !== 'ACCEPTED' && proposal.status === 'OPEN' && !proposal.expired"
          class="primary-button"
          type="button"
          @click="acceptProposal(request, proposal)"
        >
          Aceitar proposta
        </button>
        <p v-else-if="proposal.status === 'ACCEPTED'">Proposta escolhida</p>
      </div>
    </article>
    <button class="back-button" type="button" @click="goHome">Início</button>
  </section>
</template>
