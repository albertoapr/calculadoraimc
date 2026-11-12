<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
import HomeHeader from '../layout/HomeHeader.vue'
const {
  theme,
  customerForm,
  signupContact,
  signupStep,
  customerStatus,
  customerVerificationLink,
  customerVerificationComplete,
  customerSubmitting,
  goBackFromTitle,
  closeCustomerSignup,
  pollCustomerVerification,
  continueSignupContact,
  sendCustomerSignup,
} = useFitpesoContext()
</script>

<template>
  <section class="calculator customer-signup" aria-labelledby="customer-signup-title">
    <HomeHeader />
    <header class="hero">
      <hr class="personal-divider" />
      <h1 id="customer-signup-title">
        <button
          type="button"
          class="title-back-button"
          aria-label="Voltar"
          @click="goBackFromTitle"
        >
          &lt;
        </button>
        Cadastro de cliente
      </h1>
    </header>
    <form
      v-if="!customerVerificationLink && signupStep === 1"
      class="form login-step-form"
      @submit.prevent="continueSignupContact"
    >
      <p class="field-wide intro">
        Informe apenas seu WhatsApp ou e-mail. Pelo WhatsApp, a Beta confirma seu número e informa
        seu nome automaticamente.
      </p>
      <label class="field field-wide" for="signup-contact"
        ><span class="field-label">WhatsApp ou e-mail</span>
        <input
          id="signup-contact"
          v-model="signupContact"
          name="signupContact"
          autocomplete="username"
          type="text"
          maxlength="254"
          placeholder="(21) 99999-9999 ou seu@email.com"
          required
        />
      </label>
      <button class="primary-button field-wide" type="submit" :disabled="customerSubmitting">
        {{ customerSubmitting ? 'Preparando confirmação…' : 'Continuar' }}
      </button>
    </form>
    <form v-else-if="!customerVerificationLink" class="form" @submit.prevent="sendCustomerSignup">
      <p class="field-wide intro">
        Para continuar pelo e-mail, informe seu nome e WhatsApp. O número será confirmado com a
        Beta. A data de nascimento será solicitada apenas quando pedir atendimento.
      </p>
      <label class="field field-wide" for="customer-name"
        ><span class="field-label">Seu nome</span>
        <input
          id="customer-name"
          v-model="customerForm.name"
          name="customerName"
          type="text"
          autocomplete="name"
          minlength="2"
          maxlength="80"
          placeholder="Como podemos chamar você?"
          required
        />
      </label>
      <label class="field field-wide" for="customer-whatsapp"
        ><span class="field-label">WhatsApp com DDD</span>
        <input
          id="customer-whatsapp"
          v-model="customerForm.whatsapp"
          name="customerWhatsapp"
          type="tel"
          autocomplete="tel"
          inputmode="tel"
          maxlength="20"
          placeholder="(21) 99999-9999"
          required
        />
      </label>
      <label class="field field-wide" for="customer-email"
        ><span class="field-label">E-mail <span>opcional</span></span>
        <input
          id="customer-email"
          v-model="customerForm.email"
          name="customerEmail"
          type="email"
          autocomplete="email"
          maxlength="254"
          placeholder="voce@exemplo.com"
        />
      </label>
      <button class="primary-button field-wide" type="submit" :disabled="customerSubmitting">
        {{ customerSubmitting ? 'Preparando confirmação…' : 'Confirmar WhatsApp' }}
      </button>
    </form>
    <div v-else class="customer-signup-confirmation">
      <p class="status" role="status" aria-live="polite">{{ customerStatus }}</p>
      <a
        v-if="!customerVerificationComplete"
        class="primary-button customer-verification-link"
        :href="customerVerificationLink"
        target="_blank"
        rel="noopener noreferrer"
        >Confirmar WhatsApp</a
      >
      <button
        v-if="!customerVerificationComplete"
        class="secondary-button"
        type="button"
        @click="pollCustomerVerification"
      >
        Código já enviado
      </button>
      <button v-else class="primary-button" type="button" @click="closeCustomerSignup">
        Concluir cadastro
      </button>
      <small
        >O botão abre uma conversa com a Beta e prepara o número e o código. A Beta deverá enviar
        também o nome exibido no WhatsApp à rota de confirmação. Esse nome não comprova titularidade
        da linha.</small
      >
    </div>
    <p v-if="customerStatus && !customerVerificationLink" class="status" role="alert">
      {{ customerStatus }}
    </p>
    <button class="back-button" type="button" @click="closeCustomerSignup">Início</button>
    <div
      class="box-footer"
      role="group"
      aria-label="Aparência e contato"
      style="display: flex; justify-content: space-between; align-items: center"
    >
      <a
        class="box-contact-link"
        style="margin-right: auto; margin-left: 0; justify-self: start"
        href="https://wa.me/5521987741518?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso."
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg class="box-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.6 3.5h3l1.3 4.1-2 1.7a15.1 15.1 0 0 0 5.8 5.8l1.7-2 4.1 1.3v3a2 2 0 0 1-2.2 2C10.8 18.9 5.1 13.2 4.6 5.7a2 2 0 0 1 2-2.2Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
        <span>Fale conosco</span>
      </a>
      <div class="box-theme-actions" role="group" aria-label="Escolher tema">
        <button
          type="button"
          class="theme-icon-button"
          aria-label="Tema claro"
          title="Claro"
          :class="{ active: theme === 'light' }"
          :aria-pressed="theme === 'light'"
          @click="theme = 'light'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" />
            <path
              d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
            />
          </svg>
        </button>
        <button
          type="button"
          class="theme-icon-button"
          aria-label="Tema escuro"
          title="Escuro"
          :class="{ active: theme === 'dark' }"
          :aria-pressed="theme === 'dark'"
          @click="theme = 'dark'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>
