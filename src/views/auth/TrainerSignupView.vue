<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  theme,
  availableCities,
  academyOptions,
  addAcademy,
  signupAcademyChoice,
  signupOtherAcademy,
  trainerForm,
  trainerStatus,
  trainerVerificationLink,
  trainerSubmitting,
  setGoogleButtonContainer,
  googleProfileStatus,
  goBackFromTitle,
  closeTrainerSignup,
  toggleTrainerCity,
  suggestTrainerSlug,
  sendTrainerSignup,
} = useFitpesoContext()
</script>

<template>
  <section class="calculator" aria-labelledby="page-title">
    <header class="hero">
      <div class="brand" aria-label="FitPeso — Rede de treinadores">
        <svg class="dumbbell-icon" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M6 15v10m5-14v18m18-18v18m5-14v10M11 20h18" />
          <path d="M4 15h4v10H4zm5-4h4v18H9zm18 0h4v18h-4zm5 4h4v10h-4z" />
        </svg>
        <span class="brand-lockup"
          ><span class="brand-default"
            ><span class="brand-fit">Fit</span><span class="brand-peso">Peso</span></span
          ><small class="brand-tagline">Rede de treinadores</small></span
        >
      </div>
      <hr class="personal-divider" />
      <h1 id="page-title">
        <button
          type="button"
          class="title-back-button"
          aria-label="Voltar"
          @click="goBackFromTitle"
        >
          &lt;
        </button>
        Cadastro de personal
      </h1>
      <p class="intro">
        Preencha seus dados para receber solicitações de usuários. Confirme o WhatsApp informado
        para ativar seu perfil.
      </p>
    </header>

    <form class="form contact-fields trainer-signup-form" @submit.prevent="sendTrainerSignup">
      <div class="google-fill field-wide trainer-contact-reminder">
        <p>
          Antes de enviar o cadastro, baixe e salve o cartão de contato da Beta para receber o
          retorno.
        </p>
        <a
          class="trainer-contact-card"
          href="https://drive.usercontent.google.com/download?id=1itlX4W0doax1jYpc7GkGa-hM2v8rZ98l&amp;export=download"
          download="Beta.vcf"
          >Baixar cartão de contato da Beta</a
        >
        <small>WhatsApp: +55 21 97111-8383</small>
      </div>
      <div class="google-fill field-wide">
        <p>Complete nome e e-mail com sua conta Google</p>
        <div :ref="setGoogleButtonContainer" class="google-button-container"></div>
        <small v-if="googleProfileStatus" role="status" aria-live="polite">{{
          googleProfileStatus
        }}</small>
      </div>
      <label class="field field-wide" for="trainer-name"
        ><span class="field-label">Nome completo</span>
        <input
          id="trainer-name"
          v-model="trainerForm.name"
          name="trainerName"
          type="text"
          autocomplete="name"
          minlength="2"
          maxlength="80"
          placeholder="Seu nome completo"
          @blur="suggestTrainerSlug"
          required
        />
      </label>
      <label class="field field-wide" for="trainer-sex"
        ><span class="field-label">Sexo</span>
        <select id="trainer-sex" v-model="trainerForm.sex" name="trainerSex" required>
          <option disabled value="">Selecione</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
        </select>
      </label>
      <label class="field field-wide" for="trainer-slug"
        ><span class="field-label">Endereço do seu perfil</span>
        <input
          id="trainer-slug"
          v-model="trainerForm.slug"
          name="trainerSlug"
          type="text"
          autocapitalize="none"
          maxlength="40"
          pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])"
          placeholder="joao-silva"
          required
        />
        <small
          >Seu perfil será ativado em https://{{
            trainerForm.slug || 'seu-identificador'
          }}.fitpeso.com.br após a confirmação do WhatsApp.</small
        >
      </label>
      <label class="field field-wide" for="trainer-phone"
        ><span class="field-label">Telefone</span>
        <input
          id="trainer-phone"
          v-model="trainerForm.phone"
          name="trainerPhone"
          type="tel"
          autocomplete="tel"
          inputmode="tel"
          maxlength="20"
          placeholder="(21) 99999-9999"
          required
        />
      </label>
      <label class="field field-wide" for="trainer-birth-date"
        ><span class="field-label">Data de nascimento <span>opcional</span></span>
        <input
          id="trainer-birth-date"
          v-model="trainerForm.dateOfBirth"
          name="trainerBirthDate"
          type="date"
          autocomplete="bday"
          min="1900-01-01"
          :max="new Date().toISOString().slice(0, 10)"
        />
      </label>
      <label class="field field-wide" for="trainer-email"
        ><span class="field-label">E-mail <span>opcional</span></span>
        <input
          id="trainer-email"
          v-model="trainerForm.email"
          name="trainerEmail"
          type="email"
          autocomplete="email"
          maxlength="254"
          placeholder="voce@exemplo.com"
        />
      </label>
      <fieldset class="availability-group field-wide trainer-city-group">
        <legend>Cidades de atuação <span>(escolha de 1 a 2)</span></legend>
        <div class="availability-options">
          <label v-for="city in availableCities" :key="city" class="availability-option">
            <input
              type="checkbox"
              :checked="trainerForm.cities.includes(city)"
              :disabled="!trainerForm.cities.includes(city) && trainerForm.cities.length >= 2"
              @change="toggleTrainerCity(city)"
            />
            <span>{{ city }}</span>
          </label>
        </div>
      </fieldset>
      <label class="field field-wide" for="trainer-instagram"
        ><span class="field-label">Perfil do Instagram</span>
        <fieldset class="availability-group field-wide">
          <legend>Academias onde atende (até 5)</legend>
          <div class="public-academy-add">
            <select v-model="signupAcademyChoice" aria-label="Selecionar academia">
              <option value="">Selecione uma academia</option>
              <option v-for="option in academyOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
            <input
              v-if="signupAcademyChoice === 'Outros'"
              v-model="signupOtherAcademy"
              type="text"
              maxlength="60"
              placeholder="Nome da academia"
              aria-label="Nome da academia"
            />
            <button
              type="button"
              class="secondary-button"
              :disabled="
                trainerForm.academias.length >= 5 ||
                !signupAcademyChoice ||
                (signupAcademyChoice === 'Outros' && !signupOtherAcademy.trim())
              "
              @click="
                () => {
                  addAcademy(trainerForm.academias, signupAcademyChoice, signupOtherAcademy)
                  signupAcademyChoice = ''
                  signupOtherAcademy = ''
                }
              "
            >
              Adicionar
            </button>
          </div>
          <div v-for="(gym, index) in trainerForm.academias" :key="gym" class="public-academy-item">
            <span>{{ gym }}</span><button
              type="button"
              :aria-label="'Remover ' + gym"
              @click="trainerForm.academias.splice(index, 1)"
            >
              Remover
            </button>
          </div>
          <small>{{ trainerForm.academias.length }}/5 academias</small>
        </fieldset>
        <input
          id="trainer-instagram"
          v-model="trainerForm.instagram"
          name="instagram"
          type="text"
          autocomplete="url"
          maxlength="100"
          placeholder="@seuperfil ou instagram.com/seuperfil"
          required
        />
      </label>
      <label class="field field-wide" for="trainer-cref"
        ><span class="field-label"
          >Registro do conselho de Educação Física <span>opcional</span></span
        >
        <input
          id="trainer-cref"
          v-model="trainerForm.cref"
          name="cref"
          type="text"
          maxlength="40"
          placeholder="Ex.: CREF 000000-G/RJ"
        />
      </label>
      <button class="primary-button field-wide" type="submit" :disabled="trainerSubmitting">
        {{ trainerSubmitting ? 'Salvando cadastro…' : 'Enviar cadastro' }}
        <span aria-hidden="true">→</span>
      </button>
      <p v-if="trainerStatus" class="status field-wide" role="status" aria-live="polite">
        {{ trainerStatus }}
      </p>
      <a
        v-if="trainerVerificationLink"
        class="primary-button field-wide"
        :href="trainerVerificationLink"
        target="_blank"
        rel="noopener noreferrer"
        >Confirmar WhatsApp com a Beta <span aria-hidden="true">→</span></a
      >
    </form>
    <button class="back-button" type="button" @click="closeTrainerSignup">Início</button>
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
