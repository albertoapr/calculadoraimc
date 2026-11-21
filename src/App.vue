<script setup lang="ts">
import { provide } from 'vue'
import { useFitpesoApp } from './composables/useFitpesoApp'
import { fitpesoKey } from './composables/fitpesoContext'
import TrainerSignupView from './views/auth/TrainerSignupView.vue'
import LoginView from './views/auth/LoginView.vue'
import ProfileSelectionDialog from './views/auth/ProfileSelectionDialog.vue'
import CustomerSignupView from './views/auth/CustomerSignupView.vue'
import HomeHeader from './views/layout/HomeHeader.vue'
import PageHeader from './views/layout/PageHeader.vue'
import CitySelector from './views/layout/CitySelector.vue'
import MyProfileView from './views/account/MyProfileView.vue'
import TrainerRequestView from './views/account/TrainerRequestView.vue'
import TrainerRequestsView from './views/account/TrainerRequestsView.vue'
import CustomerRequestsView from './views/account/CustomerRequestsView.vue'
import AdminTrainersView from './views/account/AdminTrainersView.vue'
import AdminCustomersView from './views/account/AdminCustomersView.vue'
import AdminAcademiesView from './views/account/AdminAcademiesView.vue'
import ProfessionalRegistrationView from './views/account/ProfessionalRegistrationView.vue'
import AssessmentFormView from './views/assessment/AssessmentFormView.vue'
import AssessmentResultView from './views/assessment/AssessmentResultView.vue'
import ServiceRequestView from './views/atendimento/ServiceRequestView.vue'
import AppFooter from './views/layout/AppFooter.vue'
import HomeView from './views/home/HomeView.vue'
import PersonalProfileView from './views/home/PersonalProfileView.vue'
import AboutView from './views/home/AboutView.vue'
import RequestActionDialog from './views/atendimento/RequestActionDialog.vue'
import RequestSuccessDialog from './views/atendimento/RequestSuccessDialog.vue'
import AssessmentProgress from './views/assessment/AssessmentProgress.vue'
const context = useFitpesoApp()
provide(fitpesoKey, context)
const {
  navigationPending,
  ConsultarProfissionaisView,
  SelecionarProfissionaisView,
  isRootHome,
  viewMode,
  showRequestForm,
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
  openRequestForTrainer,
  refreshShareableRequests,
  publicTrainersLoading,
  publicTrainersError,
  academyRouteLoading,
  academyRouteError,
  retryPublicTrainers,
  publicTrainerAcademies,
  publicFilteredTrainers,
  customerRequests,
  showTrainerSignup,
  showCustomerSignup,
  showCustomerLogin,
  profileChooserOpen,
  customerSignedInName,
  customerIsAdmin,
  form,
  result,
  status,
  returnToDraftSummary,
  openCustomerRequests,
} = context
</script>

<template>
  <main class="page-shell">
    <section v-if="navigationPending" class="calculator" role="status" aria-live="polite">
      Carregando sua sessão…
    </section>
    <TrainerSignupView v-else-if="showTrainerSignup" />

    <LoginView v-else-if="showCustomerLogin" />

    <CustomerSignupView v-else-if="showCustomerSignup" />

    <section
      v-else
      class="calculator"
      :aria-labelledby="
        viewMode === 'home' && !result
          ? undefined
          : viewMode === 'admin-academies'
            ? 'admin-academies-title'
            : viewMode === 'contact'
              ? 'contact-form-title'
              : 'page-title'
      "
      :aria-label="viewMode === 'home' && !result ? 'FitPeso' : undefined"
    >
      <HomeHeader />
      <hr v-if="viewMode === 'home' && !result && isRootHome" class="home-city-divider" />
      <PageHeader
        v-if="!viewMode.startsWith('admin-') && !(viewMode === 'home' && !result && isRootHome)"
      />
      <CitySelector
        v-if="
          !viewMode.startsWith('admin-') &&
          viewMode !== 'public-trainers' &&
          viewMode !== 'home'
        "
      />
      <HomeView v-if="viewMode === 'home' && !result && isRootHome" />

      <MyProfileView v-if="viewMode === 'my-profile'" />

      <TrainerRequestView v-if="viewMode === 'trainer-request'" />

      <TrainerRequestsView v-if="viewMode === 'trainer-requests'" />

      <RequestActionDialog />
      <CustomerRequestsView v-if="viewMode === 'customer-requests'" />

      <AdminTrainersView v-if="viewMode === 'admin-trainers' && customerIsAdmin" />
      <AdminCustomersView v-if="viewMode === 'admin-customers' && customerIsAdmin" />
      <AdminAcademiesView v-if="viewMode === 'admin-academies' && customerIsAdmin" />
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
        :loading="publicTrainersLoading || academyRouteLoading"
        :error="academyRouteError || publicTrainersError"
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
        @request-trainer="openRequestForTrainer"
        @open-requests="openCustomerRequests"
        @refresh-requests="refreshShareableRequests"
        @retry="retryPublicTrainers"
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
      <PersonalProfileView v-if="viewMode === 'home' && !result && !isRootHome" />

      <AboutView v-if="viewMode === 'about'" />

      <AssessmentFormView v-if="viewMode === 'assessment' && !result" />

      <AssessmentResultView v-else-if="viewMode === 'assessment' && result" />

      <ServiceRequestView v-if="viewMode === 'contact' && showRequestForm" />

      <AssessmentProgress />

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <RequestSuccessDialog />
      <AppFooter />
    </section>
    <ProfileSelectionDialog v-if="profileChooserOpen" />
  </main>
</template>

<style scoped>
.home-city-divider {
  border: 0;
  border-top: 1px solid var(--line);
  width: 100%;
  margin: 10px 0 18px;
}
</style>
