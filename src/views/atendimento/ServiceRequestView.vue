<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const {
  minutesToTime,
  trainingTimeRanges,
  publicTrainerAcademies,
  selectedTrainerIds,
  selectedTrainerNames,
  customerSignedInName,
  trainingDayOptions,
  supportedRequestCities,
  form,
  trainingStartMinutes,
  trainingEndMinutes,
  selectTrainingTimeRange,
  submittingRequest,
  otherGymName,
  selectTrainersForDraft,
  confirmServiceRequest,
} = useFitpesoContext()

type AccordionSection =
  | 'profile'
  | 'objective'
  | 'frequency'
  | 'schedule'
  | 'location'
  | 'participants'
  | 'duration'
  | 'professionals'

const expandedSection = ref<AccordionSection | null>('profile')

function toggleSection(section: AccordionSection) {
  expandedSection.value = expandedSection.value === section ? null : section
}

const estimatedValue = computed(() => {
  const lessons = form.singleLesson ? 1 : Number(form.sessionsPerWeek) * 4
  const amount = lessons * 40 * (form.withCompanion ? 2 : 1)
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
})

const genderLabel = computed(() =>
  form.clientGender === 'feminino'
    ? 'Mulher'
    : form.clientGender === 'masculino'
      ? 'Homem'
      : 'Prefiro não informar',
)
const professionalGenderLabel = computed(() =>
  form.trainerGenderPreference === 'feminino'
    ? 'Feminino'
    : form.trainerGenderPreference === 'masculino'
      ? 'Masculino'
      : 'Sem preferência',
)
</script>

<template>
  <form
    id="contact-fields"
    class="form contact-fields request-form request-accordion-form"
    aria-labelledby="contact-form-title"
    @submit.prevent
  >
    <p class="request-accordion-intro">Confira os dados do seu atendimento. Toque em cada linha para alterar.</p>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'profile' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'profile'" aria-controls="request-panel-profile" @click="toggleSection('profile')">
          <span class="request-accordion-icon" aria-hidden="true">👤</span>
          <span class="request-accordion-title">Perfil</span>
          <span class="request-accordion-preview">{{ form.age }} anos · {{ genderLabel }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'profile'" id="request-panel-profile" class="request-accordion-panel">
        <label class="request-accordion-label" for="accordion-age">Sua idade: <strong>{{ form.age }} anos</strong></label>
        <input id="accordion-age" v-model="form.age" class="request-accordion-age" type="range" min="15" max="100" step="1" />
        <div class="request-accordion-limits" aria-hidden="true"><span>15 anos</span><span>100 anos</span></div>
        <p class="request-accordion-label">Sexo</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Seu sexo">
          <label v-for="option in [
            { value: 'feminino', label: 'Mulher' },
            { value: 'masculino', label: 'Homem' },
            { value: 'nao_informar', label: 'Prefiro não informar' },
          ]" :key="option.value" class="request-choice">
            <input v-model="form.clientGender" type="radio" name="accordion-client-gender" :value="option.value" />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'objective' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'objective'" aria-controls="request-panel-objective" @click="toggleSection('objective')">
          <span class="request-accordion-icon" aria-hidden="true">🎯</span>
          <span class="request-accordion-title">Objetivo</span>
          <span class="request-accordion-preview">{{ form.objective || 'A definir' }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'objective'" id="request-panel-objective" class="request-accordion-panel">
        <label class="request-accordion-label" for="accordion-objective">Qual é o seu objetivo?</label>
        <select id="accordion-objective" v-model="form.objective" class="request-accordion-select">
          <option value="Emagrecimento">Emagrecimento</option>
          <option value="Hipertrofia">Ganho de massa muscular (hipertrofia)</option>
          <option value="Condicionamento físico">Condicionamento físico</option>
          <option value="Saúde e qualidade de vida">Saúde e qualidade de vida</option>
          <option value="Reabilitação">Reabilitação</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'frequency' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'frequency'" aria-controls="request-panel-frequency" @click="toggleSection('frequency')">
          <span class="request-accordion-icon" aria-hidden="true">📅</span>
          <span class="request-accordion-title">Frequência</span>
          <span class="request-accordion-preview">{{ form.sessionsPerWeek }} {{ Number(form.sessionsPerWeek) === 1 ? 'aula' : 'aulas' }}/semana · {{ form.trainingDays.join(', ') || 'Escolha os dias' }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'frequency'" id="request-panel-frequency" class="request-accordion-panel">
        <p class="request-accordion-label">Quantas aulas por semana?</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Aulas por semana">
          <label v-for="n in 4" :key="n" class="request-choice">
            <input v-model="form.sessionsPerWeek" type="radio" name="accordion-sessions" :value="String(n)" />
            <span>{{ n }}</span>
          </label>
        </div>
        <p class="request-accordion-label">Em quais dias você pode treinar?</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Dias disponíveis">
          <label v-for="day in trainingDayOptions" :key="day.value" class="request-choice">
            <input v-model="form.trainingDays" type="checkbox" :value="day.value" />
            <span>{{ day.label }}</span>
          </label>
        </div>
        <p v-if="!form.trainingDays.length" class="request-accordion-warning" role="alert">Selecione pelo menos um dia.</p>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'schedule' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'schedule'" aria-controls="request-panel-schedule" @click="toggleSection('schedule')">
          <span class="request-accordion-icon" aria-hidden="true">🕒</span>
          <span class="request-accordion-title">Horário preferencial</span>
          <span class="request-accordion-preview">{{ minutesToTime(trainingStartMinutes) }} às {{ minutesToTime(trainingEndMinutes) }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'schedule'" id="request-panel-schedule" class="request-accordion-panel">
        <p class="request-accordion-label">Escolha uma faixa de horário</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Faixas de horário">
          <button v-for="range in trainingTimeRanges" :key="range.start" type="button"
            class="request-choice training-time-button"
            :class="{ 'training-time-button-active': trainingStartMinutes === range.start }"
            :aria-pressed="trainingStartMinutes === range.start"
            @click="selectTrainingTimeRange(range.start, range.end)">
            {{ range.label }}
          </button>
        </div>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'location' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'location'" aria-controls="request-panel-location" @click="toggleSection('location')">
          <span class="request-accordion-icon" aria-hidden="true">📍</span>
          <span class="request-accordion-title">Local do atendimento</span>
          <span class="request-accordion-preview">{{ form.gymName === 'Outros' ? (otherGymName || 'Informe o local') : (form.gymName || form.city || 'A definir') }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'location'" id="request-panel-location" class="request-accordion-panel">
        <label for="accordion-city" class="request-accordion-label">Cidade</label>
        <select id="accordion-city" v-model="form.city" class="request-accordion-select">
          <option value="" disabled>Escolha uma cidade</option>
          <option v-for="city in supportedRequestCities" :key="city" :value="city">{{ city }}</option>
        </select>
        <label for="accordion-gym" class="request-accordion-label">Academia / local</label>
        <select id="accordion-gym" v-model="form.gymName" class="request-accordion-select" @change="form.attendsGym = Boolean(form.gymName)">
          <option value="" disabled>Selecione o local</option>
          <option v-for="gym in publicTrainerAcademies" :key="gym" :value="gym">{{ gym }}</option>
          <option value="Outros">Outros</option>
        </select>
        <template v-if="form.gymName === 'Outros'">
          <label for="accordion-other-gym" class="request-accordion-label">Informe o local</label>
          <input id="accordion-other-gym" v-model.trim="otherGymName" class="request-accordion-input" maxlength="100" placeholder="Nome do local" />
        </template>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'participants' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'participants'" aria-controls="request-panel-participants" @click="toggleSection('participants')">
          <span class="request-accordion-icon" aria-hidden="true">👥</span>
          <span class="request-accordion-title">Participantes</span>
          <span class="request-accordion-preview">{{ form.withCompanion ? 'Com acompanhante' : 'Sozinho' }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'participants'" id="request-panel-participants" class="request-accordion-panel">
        <p class="request-accordion-label">Como você vai treinar?</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Participantes da aula">
          <label class="request-choice"><input v-model="form.withCompanion" type="radio" name="accordion-companion" :value="false" /><span>Sozinho</span></label>
          <label class="request-choice"><input v-model="form.withCompanion" type="radio" name="accordion-companion" :value="true" /><span>Com acompanhante</span></label>
        </div>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'duration' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'duration'" aria-controls="request-panel-duration" @click="toggleSection('duration')">
          <span class="request-accordion-icon" aria-hidden="true">⏳</span>
          <span class="request-accordion-title">Duração</span>
          <span class="request-accordion-preview">{{ form.singleLesson ? 'Aula avulsa' : form.desiredDuration }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'duration'" id="request-panel-duration" class="request-accordion-panel">
        <label class="request-accordion-check"><input v-model="form.singleLesson" type="checkbox" /> Aula avulsa</label>
        <label for="accordion-duration" class="request-accordion-label">Duração do acompanhamento</label>
        <select id="accordion-duration" v-model="form.desiredDuration" class="request-accordion-select" :disabled="form.singleLesson">
          <option v-for="months in 6" :key="months" :value="months + (months === 1 ? ' mês' : ' meses')">
            {{ months }} {{ months === 1 ? 'mês' : 'meses' }}
          </option>
        </select>
      </div>
    </section>

    <section class="request-accordion-item" :class="{ 'request-accordion-open': expandedSection === 'professionals' }">
      <h3 class="request-accordion-heading">
        <button type="button" class="request-accordion-toggle" :aria-expanded="expandedSection === 'professionals'" aria-controls="request-panel-professionals" @click="toggleSection('professionals')">
          <span class="request-accordion-icon" aria-hidden="true">🧑‍🏫</span>
          <span class="request-accordion-title">Profissional</span>
          <span class="request-accordion-preview">{{ selectedTrainerIds.length ? selectedTrainerIds.length + ' selecionado(s)' : 'A definir' }}</span>
          <span class="request-accordion-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div v-if="expandedSection === 'professionals'" id="request-panel-professionals" class="request-accordion-panel">
        <p class="request-accordion-label">Gênero do personal</p>
        <div class="request-choice-row request-accordion-choices" role="group" aria-label="Gênero do personal">
          <label v-for="option in [
            { value: 'indiferente', label: 'Sem preferência' },
            { value: 'feminino', label: 'Feminino' },
            { value: 'masculino', label: 'Masculino' },
          ]" :key="option.value" class="request-choice">
            <input v-model="form.trainerGenderPreference" type="radio" name="accordion-trainer-gender" :value="option.value" />
            <span>{{ option.label }}</span>
          </label>
        </div>
        <p class="request-accordion-subtext">Preferência: {{ professionalGenderLabel }}</p>
        <p v-if="selectedTrainerNames.length" class="request-accordion-subtext">{{ selectedTrainerNames.join(', ') }}</p>
        <button type="button" class="secondary-button request-accordion-professionals-action" @click="selectTrainersForDraft">
          {{ selectedTrainerIds.length ? 'Alterar profissionais' : 'Selecionar profissionais' }} →
        </button>
      </div>
    </section>

    <div class="request-accordion-estimate" aria-live="polite">
      <span class="request-accordion-estimate-icon" aria-hidden="true">💰</span>
      <div class="request-accordion-estimate-text">
        <span>Valor estimado</span>
        <strong>a partir de {{ estimatedValue }}{{ form.singleLesson ? ' / aula' : ' / mês' }}</strong>
      </div>
    </div>

    <p v-if="!form.city || !form.gymName || (form.gymName === 'Outros' && !otherGymName.trim()) || !form.trainingDays.length" class="request-accordion-warning" role="alert">
      Preencha a cidade, o local e pelo menos um dia de treino antes de continuar.
    </p>

    <button
      class="primary-button field-wide request-accordion-submit"
      type="button"
      :disabled="submittingRequest || !form.city || !form.gymName || (form.gymName === 'Outros' && !otherGymName.trim()) || !form.trainingDays.length"
      @click="selectedTrainerIds.length ? confirmServiceRequest() : selectTrainersForDraft()"
    >
      {{
        submittingRequest
          ? 'Enviando…'
          : selectedTrainerIds.length
            ? (customerSignedInName ? 'Confirmar e enviar solicitação' : 'Entrar para confirmar solicitação')
            : 'Selecionar profissionais →'
      }}
    </button>
  </form>
</template>
