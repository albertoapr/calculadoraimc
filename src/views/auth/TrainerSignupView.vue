<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BirthDatePicker from '../../components/BirthDatePicker.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import HomeHeader from '../layout/HomeHeader.vue'
const {
  theme,
  availableCities,
  registeredAcademies,
  academiesLoading,
  academiesError,
  refreshRegisteredAcademies,
  referralCode,
  trainerForm,
  trainerStatus,
  betaTrainerSignupToken,
  betaAcademyHint,
  trainerVerificationLink,
  trainerSubmitting,
  setGoogleButtonContainer,
  googleProfileStatus,
  goBackFromTitle,
  closeTrainerSignup,
  suggestTrainerSlug,
  sendTrainerSignup,
} = useFitpesoContext()

const signupCity = ref('')
const signupAcademyId = ref('')
const cityByAcademy = ref<Record<string, string>>({})
const academyLabel = (academy: { name: string; neighborhood: string }) => `${academy.name} — ${academy.neighborhood}`
const signupOptions = computed(() => registeredAcademies.value
  .filter(academy => academy.city === signupCity.value)
  .sort((a, b) => academyLabel(a).localeCompare(academyLabel(b), 'pt-BR')))
watch(signupCity, () => { signupAcademyId.value = '' })
function cityForAcademy(name: string) {
  const matches = registeredAcademies.value.filter(academy => academyLabel(academy) === name || academy.name === name)
  return matches.find(academy => academy.city === cityByAcademy.value[name])?.city ??
    (matches.length === 1 ? matches[0]?.city : matches.find(academy => trainerForm.cities.includes(academy.city))?.city)
}
const actingCities = computed(() => [...new Set(trainerForm.academias.map(cityForAcademy).filter((city): city is string => Boolean(city)))])
const chosenAcademy = computed(() => signupOptions.value.find(academy => academy.academyId === signupAcademyId.value))
const canAdd = computed(() => {
  const academy = chosenAcademy.value
  return Boolean(academy && trainerForm.academias.length < 5 &&
    !trainerForm.academias.includes(academyLabel(academy)) &&
    (actingCities.value.includes(academy.city) || actingCities.value.length < 2))
})
function addSignupAcademy() {
  const academy = chosenAcademy.value
  if (!academy || !canAdd.value) return
  const label = academyLabel(academy)
  cityByAcademy.value[label] = academy.city
  trainerForm.academias.push(label)
  trainerForm.cities = [...actingCities.value]
  signupAcademyId.value = ''
}
function removeSignupAcademy(index: number) {
  const name = trainerForm.academias[index]
  if (name) delete cityByAcademy.value[name]
  trainerForm.academias.splice(index, 1)
  trainerForm.cities = [...actingCities.value]
}
function submitSignup() {
  if (academiesLoading.value || academiesError.value || !trainerForm.academias.length ||
      trainerForm.academias.some(name => !cityForAcademy(name))) {
    trainerStatus.value = 'Selecione pelo menos uma academia cadastrada e confira as academias informadas.'
    return
  }
  trainerForm.cities = [...actingCities.value]
  void sendTrainerSignup()
}
</script>

<template>
  <section class="calculator" aria-labelledby="page-title">
    <HomeHeader />
    <header class="hero">
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
      <p v-if="betaTrainerSignupToken" class="intro">
        Seu WhatsApp já foi confirmado pela Beta. Complete os campos obrigatórios para ativar o
        perfil sem uma nova confirmação.
      </p>
      <p v-else class="intro">
        Preencha seus dados para receber solicitações de usuários. Confirme o WhatsApp informado
        para ativar seu perfil.
      </p>
    </header>

    <form class="form contact-fields trainer-signup-form" @submit.prevent="submitSignup">
      <div v-if="!betaTrainerSignupToken" class="google-fill field-wide">
        <p>Complete nome e e-mail com sua conta Google</p>
        <div :ref="setGoogleButtonContainer" class="google-button-container"></div>
        <small v-if="googleProfileStatus" role="status" aria-live="polite">{{
          googleProfileStatus
        }}</small>
      </div>
      <label v-if="referralCode" class="field field-wide" for="trainer-referral">
        <span class="field-label">Indicado por outro personal</span>
        <input id="trainer-referral" :value="referralCode" readonly aria-readonly="true" />
        <small>Este código será associado ao seu cadastro quando você concluir a inscrição.</small>
      </label>
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
          >Seu perfil será ativado em https://fitpeso.com.br/personal/{{
            trainerForm.slug || 'seu-identificador'
          }}
          após a confirmação do WhatsApp.</small
        >
      </label>
      <label class="field field-wide" for="trainer-phone"
        ><span class="field-label">Telefone</span>
        <input
          id="trainer-phone"
          v-model="trainerForm.phone"
          :readonly="Boolean(betaTrainerSignupToken)"
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
        <BirthDatePicker
          id="trainer-birth-date"
          v-model="trainerForm.dateOfBirth"
          name="trainerBirthDate"
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
      <fieldset class="availability-group field-wide">
        <legend>Academias onde atende (até 5)</legend>
        <small v-if="betaAcademyHint" role="status">{{ betaAcademyHint }}</small>
        <label class="field field-wide" for="signup-city">
          <span class="field-label">Cidade</span>
          <select id="signup-city" v-model="signupCity">
            <option value="">Selecione a cidade</option>
            <option v-for="city in availableCities" :key="city" :value="city">{{ city }}</option>
          </select>
        </label>
        <p v-if="academiesLoading" role="status">Carregando academias…</p>
        <div v-else-if="academiesError" role="alert">
          {{ academiesError }}
          <button type="button" class="secondary-button" @click="refreshRegisteredAcademies">Tentar novamente</button>
        </div>
        <div class="public-academy-add">
          <select v-model="signupAcademyId" aria-label="Selecionar academia" :disabled="!signupCity || academiesLoading || Boolean(academiesError)">
            <option value="">Selecione uma academia</option>
            <option v-for="academy in signupOptions" :key="academy.academyId" :value="academy.academyId">{{ academyLabel(academy) }}</option>
          </select>
          <button type="button" class="secondary-button" :disabled="!canAdd" @click="addSignupAcademy">Adicionar</button>
        </div>
        <small v-if="signupCity && !academiesLoading && !academiesError && !signupOptions.length">Nenhuma academia cadastrada nesta cidade.</small>
        <div v-for="(gym, index) in trainerForm.academias" :key="gym" class="public-academy-item">
          <span>{{ gym }} — {{ cityForAcademy(gym) || 'Cidade não identificada' }}</span>
          <button type="button" :aria-label="'Remover ' + gym" @click="removeSignupAcademy(index)">Remover</button>
        </div>
        <small>{{ trainerForm.academias.length }}/5 academias</small>
        <small>Cidades de atuação: {{ actingCities.join(', ') || 'Nenhuma academia selecionada' }} (até 2)</small>
      </fieldset>
      <label class="field field-wide" for="trainer-instagram">
        <span class="field-label">Perfil do Instagram <span v-if="betaTrainerSignupToken">(opcional; pode preencher depois)</span></span>
        <input
          id="trainer-instagram"
          v-model="trainerForm.instagram"
          name="instagram"
          type="text"
          autocomplete="url"
          maxlength="100"
          placeholder="@seuperfil ou instagram.com/seuperfil"
          :required="!betaTrainerSignupToken"
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
        {{ trainerSubmitting ? 'Salvando cadastro…' : betaTrainerSignupToken ? 'Concluir cadastro' : 'Enviar cadastro' }}
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
