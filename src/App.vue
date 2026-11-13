<script setup lang="ts">
import { provide } from 'vue'
import { useFitpesoApp } from './composables/useFitpesoApp'
import { fitpesoKey } from './composables/fitpesoContext'
import TrainerSignupView from './views/auth/TrainerSignupView.vue'
import LoginView from './views/auth/LoginView.vue'
import CustomerSignupView from './views/auth/CustomerSignupView.vue'
import HomeHeader from './views/layout/HomeHeader.vue'
import PageHeader from './views/layout/PageHeader.vue'
import MyProfileView from './views/account/MyProfileView.vue'
import TrainerRequestView from './views/account/TrainerRequestView.vue'
import TrainerRequestsView from './views/account/TrainerRequestsView.vue'
import CustomerRequestsView from './views/account/CustomerRequestsView.vue'
import AdminTrainerView from './views/account/AdminTrainerView.vue'
import AdminTrainersView from './views/account/AdminTrainersView.vue'
import ProfessionalRegistrationView from './views/account/ProfessionalRegistrationView.vue'
import AssessmentFormView from './views/assessment/AssessmentFormView.vue'
import AssessmentResultView from './views/assessment/AssessmentResultView.vue'
import ServiceRequestView from './views/atendimento/ServiceRequestView.vue'
import AppFooter from './views/layout/AppFooter.vue'
const context = useFitpesoApp()
provide(fitpesoKey, context)
const {
  ConsultarProfissionaisView,
  SelecionarProfissionaisView,
  isRootHome,
  viewMode,
  showRequestForm,
  requestSent,
  selectingTrainersForDraft,
  publicTrainerCity,
  publicTrainerAcademy,
  homeSelectedTrainerIds,
  sharingRequestId,
  sharingRequestMessage,
  sharingRequestBusy,
  activeCustomerRequest,
  checkingCustomerRequests,
  customerRequestsLookupError,
  searchHomeTrainers,
  requestProposalFromHome,
  refreshShareableRequests,
  publicTrainersLoading,
  publicTrainersError,
  publicTrainerAcademies,
  publicFilteredTrainers,
  openPublicTrainers,
  customerRequests,
  changingRequestId,
  requestActionDialog,
  requestActionError,
  showTrainerSignup,
  showCustomerSignup,
  showCustomerLogin,
  customerSignedInName,
  customerIsAdmin,
  form,
  result,
  evaluating,
  evaluationProgress,
  status,
  goHome,
  openRequestForm,
  returnToDraftSummary,
  openSentRequests,
  openCustomerRequests,
  confirmRequestVisibilityChange,
} = context
</script>

<template>
  <main class="page-shell">
    <TrainerSignupView v-if="showTrainerSignup" />

    <LoginView v-else-if="showCustomerLogin" />

    <CustomerSignupView v-else-if="showCustomerSignup" />

    <section
      v-else
      class="calculator"
      :aria-labelledby="
        viewMode === 'home' && !result
          ? undefined
          : viewMode === 'contact'
            ? 'contact-form-title'
            : 'page-title'
      "
      :aria-label="viewMode === 'home' && !result ? 'FitPeso' : undefined"
    >
      <HomeHeader />
      <PageHeader v-if="!(viewMode === 'home' && !result && isRootHome)" />

      <MyProfileView v-if="viewMode === 'my-profile'" />

      <TrainerRequestView v-if="viewMode === 'trainer-request'" />

      <TrainerRequestsView v-if="viewMode === 'trainer-requests'" />

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
            {{
              new Date(requestActionDialog.request.validUntil * 1000).toLocaleDateString('pt-BR')
            }}
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
      <CustomerRequestsView v-if="viewMode === 'customer-requests'" />

      <AdminTrainerView v-if="viewMode === 'admin-trainer' && customerIsAdmin" />
      <AdminTrainersView v-if="viewMode === 'admin-trainers' && customerIsAdmin" />
      <ProfessionalRegistrationView v-if="viewMode === 'professional-registration'" />

      <ConsultarProfissionaisView
        v-if="viewMode === 'public-trainers'"
        :academy="publicTrainerAcademy"
        :academies="publicTrainerAcademies"
        :trainers="publicFilteredTrainers"
        :selected-ids="homeSelectedTrainerIds"
        :sent-ids="
          sharingRequestId
            ? (customerRequests.find((request) => request.requestId === sharingRequestId)
                ?.selectedTrainerIds ?? [])
            : []
        "
        :city="publicTrainerCity"
        :request-city="form.city"
        :request-gender="form.trainerGenderPreference"
        :signed-in-name="customerSignedInName"
        :active-request="activeCustomerRequest"
        :checking-requests="checkingCustomerRequests"
        :requests-error="customerRequestsLookupError"
        :sharing-busy="sharingRequestBusy"
        :sharing-message="sharingRequestMessage"
        :loading="publicTrainersLoading"
        :error="publicTrainersError"
        @update:academy="
          (value) => {
            publicTrainerAcademy = value
          }
        "
        @update:selected-ids="
          (ids) => {
            homeSelectedTrainerIds = ids
          }
        "
        @continue="returnToDraftSummary"
        @request-proposal="requestProposalFromHome"
        @open-requests="openCustomerRequests"
        @refresh-requests="refreshShareableRequests"
        @retry="searchHomeTrainers"
      />
      <SelecionarProfissionaisView
        v-if="viewMode === 'select-trainers'"
        :draft-selection="selectingTrainersForDraft"
        :academy="publicTrainerAcademy"
        :academies="publicTrainerAcademies"
        :trainers="publicFilteredTrainers"
        :selected-ids="homeSelectedTrainerIds"
        :sent-ids="
          sharingRequestId
            ? (customerRequests.find((request) => request.requestId === sharingRequestId)
                ?.selectedTrainerIds ?? [])
            : []
        "
        :city="publicTrainerCity"
        :request-city="form.city"
        :request-gender="form.trainerGenderPreference"
        :signed-in-name="customerSignedInName"
        :active-request="activeCustomerRequest"
        :checking-requests="checkingCustomerRequests"
        :requests-error="customerRequestsLookupError"
        :sharing-busy="sharingRequestBusy"
        :sharing-message="sharingRequestMessage"
        :loading="publicTrainersLoading"
        :error="publicTrainersError"
        @update:academy="
          (value) => {
            publicTrainerAcademy = value
          }
        "
        @update:selected-ids="
          (ids) => {
            homeSelectedTrainerIds = ids
          }
        "
        @continue="returnToDraftSummary"
        @request-proposal="requestProposalFromHome"
        @open-requests="openCustomerRequests"
        @refresh-requests="refreshShareableRequests"
        @retry="searchHomeTrainers"
      />
      <div v-if="viewMode === 'home' && !result && isRootHome" class="home-actions root-home-actions">
        <div class="home-action">
          <h1 class="home-gym-title"><span class="brand-fit">Minha</span> <span class="brand-peso">academia</span></h1>
          <select
            id="home-academy"
            v-model="publicTrainerAcademy"
            class="home-academy-select"
            aria-label="Minha academia"
            :disabled="!publicTrainerCity || publicTrainersLoading"
          >
            <option value="">Todos</option>
            <option v-for="academy in publicTrainerAcademies" :key="academy" :value="academy">{{ academy }}</option>
          </select>
          <button class="primary-button" type="button" @click="openPublicTrainers">
            <span class="home-action-copy"
              ><strong>Buscar Personal</strong
              ><small>Encontre profissionais na sua cidade</small></span
            >
          </button>
          <nav class="header-auth-links" aria-label="Links da página inicial" style="display: flex; justify-content: center; margin-top: 12px">
            <a href="#cadastro-personal" class="header-login-link">Sou personal trainer</a>
            <span class="header-auth-divider" aria-hidden="true">|</span>
            <a href="#sobre" class="header-signup-link" @click.prevent="viewMode = 'about'">Sobre</a>
          </nav>
        </div>
      </div>
      <div v-if="viewMode === 'home' && !result && !isRootHome" class="home-actions">
        <div class="home-action">
          <button class="primary-button" type="button" @click="openRequestForm">
            Solicitar Proposta
          </button>
        </div>
      </div>

      <section v-if="viewMode === 'about'" class="fitpeso-about-page" aria-labelledby="page-title">
        <p>O FitPeso conecta pessoas que desejam treinar a profissionais de Educação Física.</p>
        <p>Encontre profissionais na sua cidade, informe suas preferências de atendimento e solicite propostas para escolher a opção mais adequada.</p>
      </section>

      <AssessmentFormView v-if="viewMode === 'assessment' && !result" />

      <AssessmentResultView v-else-if="viewMode === 'assessment' && result" />

      <ServiceRequestView v-if="viewMode === 'contact' && showRequestForm" />

      <div
        v-if="evaluating"
        class="evaluation-overlay"
        role="status"
        aria-live="polite"
        :aria-label="`Avaliando: ${evaluationProgress}%`"
      >
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
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
      <AppFooter />
    </section>
  </main>
</template>
