<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AcademyWrite } from '../../services/academiesService'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import HomeHeader from '../layout/HomeHeader.vue'
const {
  theme,
  activeCities,
  activeCitiesError,
  activeCitiesLoading,
  loadActiveCities,
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
  sendTrainerSignup,
} = useFitpesoContext()

const signupCity = ref('')
const extraCity = ref('')
const signupAcademyId = ref('')
const cityByAcademy = ref<Record<string, string>>({})
const newAcademies = ref<AcademyWrite[]>([])
const addingAcademy = ref(false)
const newAcademyName = ref('')
const newAcademyNeighborhood = ref('')
const academyCreateError = ref('')
const academyChoices = computed(() => [...registeredAcademies.value, ...newAcademies.value.map((academy, index) => ({ ...academy, academyId: `draft-${index}`, state: activeCities.value.find(city => city.cityKey === academy.city)?.state ?? '', createdAt: '', updatedAt: '' }))])
const academyLabel = (academy: { name: string; neighborhood: string }) => `${academy.name} — ${academy.neighborhood}`
const signupOptions = computed(() => academyChoices.value
  .filter(academy => academy.city === signupCity.value || (extraCity.value && academy.city === extraCity.value))
  .sort((a, b) => academyLabel(a).localeCompare(academyLabel(b), 'pt-BR')))
watch(signupCity, () => { signupAcademyId.value = ''; addingAcademy.value = false; academyCreateError.value = '' })
watch(() => trainerForm.cities[0], city => {
  if (city && !signupCity.value) signupCity.value = city
}, { immediate: true })
function cityForAcademy(name: string) {
  const matches = academyChoices.value.filter(academy => academyLabel(academy) === name || academy.name === name)
  return matches.find(academy => academy.city === cityByAcademy.value[name])?.city ??
    (matches.length === 1 ? matches[0]?.city : matches.find(academy => trainerForm.cities.includes(academy.city))?.city)
}
const actingCities = computed(() => [...new Set([signupCity.value, extraCity.value, ...trainerForm.academias.map(cityForAcademy)].filter((city): city is string => Boolean(city)))])
const chosenAcademy = computed(() => signupOptions.value.find(academy => academy.academyId === signupAcademyId.value))
const canAdd = computed(() => {
  const academy = chosenAcademy.value
  return Boolean(academy && trainerForm.academias.length < 5 &&
    !trainerForm.academias.includes(academyLabel(academy)) &&
    actingCities.value.length <= 2)
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
function saveNewAcademy() {
  const name = newAcademyName.value.trim().replace(/\s+/g, ' ')
  const neighborhood = newAcademyNeighborhood.value.trim().replace(/\s+/g, ' ')
  const city = signupCity.value
  academyCreateError.value = ''
  if (!city || name.length < 2 || neighborhood.length < 2 || name.length + neighborhood.length + 3 > 60) {
    academyCreateError.value = 'Informe nome e bairro válidos (até 60 caracteres juntos, incluindo o separador).'
    return
  }
  if (trainerForm.academias.length >= 5 || actingCities.value.length > 2) {
    academyCreateError.value = 'Limite de cinco academias e duas cidades de atuação.'
    return
  }
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const existing = academyChoices.value.find(academy => academy.city === city &&
    normalize(academy.name) === normalize(name) && normalize(academy.neighborhood) === normalize(neighborhood))
  if (existing) {
    signupAcademyId.value = existing.academyId
  } else {
    newAcademies.value.push({ name, city, neighborhood, address: '', zipCode: '', active: true })
    signupAcademyId.value = 'draft-' + (newAcademies.value.length - 1)
  }
  addSignupAcademy()
  addingAcademy.value = false
  newAcademyName.value = ''
  newAcademyNeighborhood.value = ''
}
function removeSignupAcademy(index: number) {
  const name = trainerForm.academias[index]
  if (name) delete cityByAcademy.value[name]
  trainerForm.academias.splice(index, 1)
  trainerForm.cities = [...actingCities.value]
}
function submitSignup() {
  if (activeCitiesLoading.value || activeCitiesError.value || !activeCities.value.some(city => city.cityKey === signupCity.value)) {
    trainerStatus.value = 'Selecione uma cidade de atuação ativa.'
    return
  }
  if (actingCities.value.length > 2) {
    trainerStatus.value = 'Escolha até duas cidades de atuação.'
    return
  }
  if (trainerForm.academias.length && (academiesLoading.value || academiesError.value ||
      trainerForm.academias.some(name => !cityForAcademy(name)))) {
    trainerStatus.value = 'Confira as academias selecionadas ou remova-as para concluir sem academia.'
    return
  }
  trainerForm.cities = [...actingCities.value]
  if (addingAcademy.value) {
    academyCreateError.value = 'Salve ou cancele a nova academia antes de concluir.'
    return
  }
  const academyIds = registeredAcademies.value.filter(academy =>
    trainerForm.academias.some(name => (academyLabel(academy) === name || academy.name === name) &&
      cityForAcademy(name) === academy.city),
  ).map(academy => academy.academyId)
  void sendTrainerSignup(
    newAcademies.value.filter(academy => trainerForm.academias.includes(academyLabel(academy)) &&
      cityForAcademy(academyLabel(academy)) === academy.city),
    academyIds,
  )
}
</script>

<template>
  <section class="calculator trainer-signup-screen" aria-labelledby="page-title">
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
        Informe os dados básicos e confirme seu WhatsApp. Você poderá completar seu perfil depois.
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
          required
        />
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
      <label class="field field-wide" for="signup-city">
          <span class="field-label">Cidade de atuação</span>
          <select id="signup-city" v-model="signupCity" :disabled="activeCitiesLoading" required>
            <option value="">Selecione a cidade</option>
            <option v-for="city in activeCities" :key="city.cityId" :value="city.cityKey">{{ city.name }}, {{ city.state }}</option>
          </select>
        </label>
        <div v-if="activeCitiesError" role="alert">
          {{ activeCitiesError }}
          <button type="button" class="secondary-button" @click="loadActiveCities(true)">Tentar novamente</button>
        </div>
      <label class="field field-wide" for="signup-extra-city">
        <span class="field-label">Outra cidade de atuação (opcional)</span>
        <select id="signup-extra-city" v-model="extraCity" :disabled="activeCitiesLoading">
          <option value="">Nenhuma</option>
          <option v-for="city in activeCities" :key="city.cityId" :value="city.cityKey" :disabled="city.cityKey === signupCity">{{ city.name }}, {{ city.state }}</option>
        </select>
      </label>
      <details class="field-wide optional-signup-section" :open="Boolean(betaAcademyHint) || undefined">
        <summary>Academias onde atende (opcional)</summary>
        <small>Adicione até cinco academias, se desejar. Você também poderá fazer isso depois.</small>
        <small v-if="betaAcademyHint" role="status">{{ betaAcademyHint }}</small>
        <p v-if="academiesLoading" role="status">Carregando academias…</p>
        <div v-else-if="academiesError" role="alert">
          {{ academiesError }}
          <button type="button" class="secondary-button" @click="refreshRegisteredAcademies">Tentar novamente</button>
        </div>
        <div class="public-academy-add">
          <select v-model="signupAcademyId" aria-label="Selecionar academia" :disabled="!signupCity || academiesLoading || Boolean(academiesError)">
            <option value="">Selecione uma academia</option>
            <option v-for="academy in signupOptions" :key="academy.academyId" :value="academy.academyId">{{ academyLabel(academy) }} ({{ academy.city }})</option>
          </select>
          <button type="button" class="secondary-button" :disabled="!canAdd" @click="addSignupAcademy">Adicionar</button>
        </div>
        <button type="button" class="secondary-button signup-new-academy-button" :disabled="!signupCity || academiesLoading || Boolean(academiesError) || trainerSubmitting || trainerForm.academias.length >= 5" @click="addingAcademy = !addingAcademy; academyCreateError = ''">
          + Cadastrar academia
        </button>
        <div v-if="addingAcademy" class="signup-new-academy">
          <p>Não encontrou sua academia em {{ signupCity }}? Informe os dados abaixo. Ela será cadastrada após a confirmação do seu WhatsApp.</p>
          <label class="field field-wide" for="signup-new-academy-name">
            <span class="field-label">Nome da academia</span>
            <input id="signup-new-academy-name" v-model="newAcademyName" maxlength="55" autocomplete="organization" @keydown.enter.prevent="saveNewAcademy" />
          </label>
          <label class="field field-wide" for="signup-new-academy-neighborhood">
            <span class="field-label">Bairro</span>
            <input id="signup-new-academy-neighborhood" v-model="newAcademyNeighborhood" maxlength="55" @keydown.enter.prevent="saveNewAcademy" />
          </label>
          <button type="button" class="primary-button" @click="saveNewAcademy">Adicionar academia</button>
          <button type="button" class="secondary-button" @click="addingAcademy = false; academyCreateError = ''">Cancelar</button>
          <p v-if="academyCreateError" role="alert">{{ academyCreateError }}</p>
        </div>
        <small v-if="signupCity && !academiesLoading && !academiesError && !signupOptions.length">Nenhuma academia cadastrada nesta cidade.</small>
        <div v-for="(gym, index) in trainerForm.academias" :key="gym" class="public-academy-item">
          <span>{{ gym }} — {{ cityForAcademy(gym) || 'Cidade não identificada' }}</span>
          <button type="button" :aria-label="'Remover ' + gym" @click="removeSignupAcademy(index)">Remover</button>
        </div>
        <small>{{ trainerForm.academias.length }}/5 academias</small>
        <small>Cidades de atuação: {{ actingCities.join(', ') || 'Nenhuma cidade selecionada' }} (até 2)</small>
      </details>
      <details class="field-wide optional-signup-section">
        <summary>Outros dados (opcional)</summary>
        <label class="field field-wide" for="trainer-sex">
          <span class="field-label">Sexo</span>
          <select id="trainer-sex" v-model="trainerForm.sex" name="trainerSex">
            <option value="">Informar depois</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
        </label>
      <label class="field field-wide" for="trainer-instagram">
        <span class="field-label">Perfil do Instagram <span>opcional</span></span>
        <input
          id="trainer-instagram"
          v-model="trainerForm.instagram"
          name="instagram"
          type="text"
          autocomplete="url"
          maxlength="100"
          placeholder="@seuperfil ou instagram.com/seuperfil"
        />
      </label>
      </details>
      <button class="primary-button field-wide" type="submit" :disabled="trainerSubmitting">
        {{ trainerSubmitting ? 'Salvando cadastro…' : 'Criar meu perfil' }}
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

<style scoped>
.optional-signup-section { border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.optional-signup-section summary { cursor: pointer; font-weight: 600; }
.optional-signup-section > :not(summary) { margin-top: 10px; }

.signup-new-academy-button { width: 100%; margin-top: 8px; }
.signup-new-academy { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-top: 10px; min-width: 0; }
.signup-new-academy input { width: 100%; min-width: 0; }
.signup-new-academy p { margin: 0; }

.trainer-signup-screen :deep(.fitpeso-home-topbar) {
  margin-bottom: 0;
}
.trainer-signup-screen .personal-divider {
  margin-top: 2px;
}
</style>
