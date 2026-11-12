<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  theme,
  loginAsTrainer,
  customerLoginError,
  loginIdentifier,
  loginStep,
  loginIdentifierKind,
  emailLoginPending,
  emailLoginSubmitting,
  emailLoginError,
  customerLoginVerificationLink,
  showCustomerLoginDialog,
  customerLoginSubmitting,
  trainerLoginError,
  trainerLoginLink,
  trainerLoginDialog,
  trainerLoginSubmitting,
  requestLoginReturn,
  setGoogleButtonContainer,
  goBackFromTitle,
  whatsappChecking,
  whatsappConfirmed,
  whatsappNetworkError,
  whatsappProgressStartedAt,
  whatsappProgress,
  whatsappSecondsRemaining,
  markWhatsAppOpened,
  changeLoginProfile,
  pollTrainerWhatsAppLogin,
  pollCustomerLogin,
  continueLoginIdentifier,
  returnToLoginIdentifier,
  submitIdentityLogin,
  pollEmailLogin,
  openCustomerSignupFromLogin,
} = useFitpesoContext()
</script>

<template>
  <section class="calculator customer-signup login-screen" aria-labelledby="customer-login-title">
    <header class="hero">
      <div class="brand" aria-label="FitPeso — Rede de treinadores">
        <span class="brand-lockup"
          ><span class="brand-default"
            ><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span
          ></span
        >
      </div>
      <hr class="personal-divider" />
      <h1 id="customer-login-title">
        <button
          type="button"
          class="title-back-button"
          aria-label="Voltar"
          @click="goBackFromTitle"
        >
          &lt;
        </button>
        Login
      </h1>
      <p class="intro">
        {{
          loginStep === 1
            ? 'Informe seu WhatsApp ou e-mail para acessar o FitPeso.'
            : 'Confirme seu acesso com segurança, sem senha nem data de nascimento.'
        }}
      </p>
    </header>

    <form
      v-if="loginStep === 1"
      class="form login-step-form"
      @submit.prevent="continueLoginIdentifier"
    >
      <label class="field field-wide" for="login-identifier">
        <span class="field-label">WhatsApp ou e-mail</span>
        <input
          id="login-identifier"
          v-model="loginIdentifier"
          type="text"
          inputmode="email"
          autocomplete="username"
          maxlength="254"
          placeholder="(21) 99999-9999 ou seu@email.com"
          required
          @input="emailLoginError = ''"
        />
      </label>
      <label class="login-profile-option field-wide" for="login-as-trainer">
        <input
          id="login-as-trainer"
          v-model="loginAsTrainer"
          type="checkbox"
          :disabled="requestLoginReturn"
          @change="changeLoginProfile"
        />
        <span>Entrar como personal trainer</span>
      </label>
      <p v-if="emailLoginError" class="login-validation-error field-wide" role="alert">
        {{ emailLoginError }}
      </p>
      <button class="primary-button field-wide" type="submit">Continuar</button>
      <div class="login-google-alternative field-wide">
        <span>ou</span>
        <div :ref="setGoogleButtonContainer" class="google-button-container"></div>
      </div>
    </form>

    <div v-else class="login-second-step">
      <div class="login-identity-summary">
        <span>{{ loginIdentifierKind === 'whatsapp' ? 'WhatsApp' : 'E-mail' }}</span>
        <strong>{{ loginIdentifier }}</strong>
        <button type="button" @click="returnToLoginIdentifier">Alterar</button>
      </div>
      <form
        v-if="!emailLoginPending"
        class="form login-step-form"
        @submit.prevent="submitIdentityLogin"
      >
        <p v-if="loginIdentifierKind === 'whatsapp'" class="login-step-note field-wide">
          Após continuar, você enviará uma mensagem para a Beta pelo WhatsApp. A confirmação será
          automática.
        </p>
        <p v-else class="login-step-note field-wide">
          Enviaremos um link de confirmação para seu e-mail. Sua conta só será acessada após
          confirmar o link.
        </p>
        <p
          v-if="
            loginIdentifierKind === 'email'
              ? emailLoginError
              : loginAsTrainer
                ? trainerLoginError
                : customerLoginError
          "
          class="login-validation-error field-wide"
          role="alert"
          aria-live="assertive"
        >
          {{
            loginIdentifierKind === 'email'
              ? emailLoginError
              : loginAsTrainer
                ? trainerLoginError
                : customerLoginError
          }}
        </p>
        <button
          id="login-confirm-action"
          class="primary-button field-wide"
          type="submit"
          :disabled="customerLoginSubmitting || trainerLoginSubmitting || emailLoginSubmitting"
        >
          {{
            customerLoginSubmitting || trainerLoginSubmitting || emailLoginSubmitting
              ? 'Preparando acesso…'
              : loginIdentifierKind === 'email'
                ? 'Enviar link para meu e-mail'
                : 'Confirmar pelo WhatsApp'
          }}
        </button>
      </form>
      <div v-else class="login-email-waiting" role="status" aria-live="polite">
        <h2>Confira seu e-mail</h2>
        <p>
          Enviamos um link de confirmação para <strong>{{ loginIdentifier }}</strong>.
        </p>
        <p>
          Abra o link, confirme o acesso e volte para esta tela. A entrada será concluída
          automaticamente.
        </p>
        <button class="secondary-button" type="button" @click="pollEmailLogin">
          Já confirmei meu e-mail
        </button>
      </div>
    </div>

    <button
      v-if="loginStep === 1"
      class="back-button"
      type="button"
      @click="openCustomerSignupFromLogin"
    >
      Criar cadastro
    </button>
    <div
      v-if="loginAsTrainer ? trainerLoginDialog : showCustomerLoginDialog"
      class="success-overlay"
      role="presentation"
    >
      <section
        class="success-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-login-confirm-title"
      >
        <div
          class="whatsapp-wait-icon"
          :class="{ 'is-confirmed': whatsappConfirmed }"
          aria-hidden="true"
        >
          {{ whatsappConfirmed ? '✓' : '↻' }}
        </div>
        <h2 id="customer-login-confirm-title">
          {{ whatsappConfirmed ? 'WhatsApp confirmado! Entrando…' : 'Confirme seu login' }}
        </h2>
        <p>
          Toque no botão e envie a mensagem com o código para a Beta no WhatsApp. Depois, volte para
          esta tela e aguarde a confirmação automática.
        </p>
        <a
          v-if="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink"
          class="primary-button customer-verification-link"
          @click="markWhatsAppOpened"
          :href="loginAsTrainer ? trainerLoginLink : customerLoginVerificationLink"
          target="_blank"
          rel="noopener noreferrer"
          >{{
            whatsappProgressStartedAt ? 'Abrir WhatsApp novamente' : 'Enviar mensagem para a Beta'
          }}</a
        >
        <div v-if="whatsappProgressStartedAt" class="whatsapp-progress">
          <p v-if="!whatsappConfirmed" role="status">
            {{
              whatsappProgress < 100
                ? `Verificando confirmação… ${whatsappSecondsRemaining} s`
                : 'Ainda não recebemos sua confirmação. Confira se enviou a mensagem no WhatsApp.'
            }}
          </p>
          <div
            role="progressbar"
            aria-label="Tempo de espera pela confirmação"
            :aria-valuenow="whatsappProgress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuetext="`${whatsappProgress}% do período de espera`"
            class="whatsapp-progress-track"
          >
            <span :style="{ width: `${whatsappProgress}%` }"></span>
          </div>
          <small
            >{{ whatsappProgress }}% do período de espera · Não precisa atualizar a página.</small
          >
        </div>
        <p v-if="whatsappNetworkError" role="status">
          Não foi possível consultar agora. Tentaremos novamente automaticamente.
        </p>
        <button
          v-if="whatsappProgress >= 100 && !whatsappConfirmed"
          class="primary-button"
          type="button"
          :disabled="whatsappChecking"
          @click="loginAsTrainer ? pollTrainerWhatsAppLogin() : pollCustomerLogin()"
        >
          Código já enviado
        </button>
        <button class="back-button" type="button" @click="returnToLoginIdentifier">Cancelar</button>
      </section>
    </div>
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
