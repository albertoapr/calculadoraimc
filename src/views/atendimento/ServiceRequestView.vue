<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { trainingDate } from '../../stores/trainingDraft'
import { trainerDisplayName } from '../../utils/trainer'
import RequestAccordionItem from '../../components/RequestAccordionItem.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const {
  minutesToTime,
  trainingTimeRanges,
  publicTrainerAcademies,
  selectedTrainerIds,
  selectedTrainerNames,
  publicTrainers,
  publicTrainersLoading,
  publicTrainersError,
  customerSignedInName,
  customerForm,
  status,
  trainingDayOptions,
  supportedRequestCities,
  form,
  trainingStartMinutes,
  trainingEndMinutes,
  selectTrainingTimeRange,
  submittingRequest,
  otherGymName,
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

const expandedSection = ref<AccordionSection | null>(null)
const trainerSearch = ref('')
const MAX_TRAINERS = 20
const visibleTrainers = computed(() => {
  const query = trainerSearch.value.trim().toLocaleLowerCase('pt-BR')
  const academy = form.gymName.trim().toLocaleLowerCase('pt-BR')
  return publicTrainers.value.filter((trainer) => {
    const academies = [...(trainer.academias ?? []), trainer.gymName ?? '', trainer.academy ?? '']
    const matchesAcademy =
      !academy ||
      academy === 'outros' ||
      academies.some((name) => name.trim().toLocaleLowerCase('pt-BR') === academy)
    return matchesAcademy && (!query || trainer.name.toLocaleLowerCase('pt-BR').includes(query))
  })
})
function toggleTrainer(id: string) {
  if (selectedTrainerIds.value.includes(id)) {
    selectedTrainerIds.value = selectedTrainerIds.value.filter((value) => value !== id)
  } else if (selectedTrainerIds.value.length < MAX_TRAINERS) {
    selectedTrainerIds.value = [...selectedTrainerIds.value, id]
  }
}
watch(
  () => [form.city, form.gymName],
  () => {
    // Uma mudança de local invalida a seleção anterior, evitando envios para outra academia.
    selectedTrainerIds.value = []
  },
)

// Uma aula avulsa corresponde sempre a uma única aula, sem frequência semanal múltipla.
watch(
  () => form.singleLesson,
  (singleLesson) => {
    if (singleLesson) form.sessionsPerWeek = '1'
  },
  { immediate: true },
)

function toggleSection(section: AccordionSection) {
  expandedSection.value = expandedSection.value === section ? null : section
}

const estimatedValue = computed(() => {
  const lessons = form.singleLesson ? form.singleLessonCount : Number(form.sessionsPerWeek) * 4
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
    <div class="request-accordion-estimate" aria-live="polite">
      <span class="request-accordion-estimate-icon" aria-hidden="true">💰</span>
      <div class="request-accordion-estimate-text">
        <span>Valor estimado</span>
        <strong
          >a partir de {{ estimatedValue }}{{ form.singleLesson ? (form.singleLessonCount === 1 ? ' / aula' : ' / pacote') : ' / mês' }}</strong
        >
      </div>
    </div>

    <p class="request-accordion-intro">
      Confira os dados do seu atendimento. Toque em cada linha para alterar.
    </p>

    <RequestAccordionItem :open="expandedSection === 'profile'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'profile'"
            aria-controls="request-panel-profile"
            @click="toggleSection('profile')"
          >
            <span class="request-accordion-icon" aria-hidden="true">👤</span>
            <span class="request-accordion-title">Meu perfil</span>
            <span class="request-accordion-preview">{{ form.age }} anos · {{ genderLabel }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'profile'"
          id="request-panel-profile"
          class="request-accordion-panel"
        >
          <label class="request-accordion-label" for="accordion-age"
            >Sua idade: <strong>{{ form.age }} anos</strong></label
          >
          <input
            id="accordion-age"
            v-model="form.age"
            class="request-accordion-age"
            type="range"
            min="15"
            max="100"
            step="1"
          />
          <div class="request-accordion-limits" aria-hidden="true">
            <span>15 anos</span><span>100 anos</span>
          </div>
          <p class="request-accordion-label">Sexo</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Seu sexo"
          >
            <label
              v-for="option in [
                { value: 'feminino', label: 'Mulher' },
                { value: 'masculino', label: 'Homem' },
                { value: 'nao_informar', label: 'Prefiro não informar' },
              ]"
              :key="option.value"
              class="request-choice"
            >
              <input
                v-model="form.clientGender"
                type="radio"
                name="accordion-client-gender"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'objective'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'objective'"
            aria-controls="request-panel-objective"
            @click="toggleSection('objective')"
          >
            <span class="request-accordion-icon" aria-hidden="true">🎯</span>
            <span class="request-accordion-title">Objetivo</span>
            <span class="request-accordion-preview">{{ form.objective || 'A definir' }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'objective'"
          id="request-panel-objective"
          class="request-accordion-panel"
        >
          <label class="request-accordion-label" for="accordion-objective"
            >Qual é o seu objetivo?</label
          >
          <select id="accordion-objective" v-model="form.objective" class="request-accordion-select">
            <option value="Emagrecimento">Emagrecimento</option>
            <option value="Hipertrofia">Ganho de massa muscular (hipertrofia)</option>
            <option value="Condicionamento físico">Condicionamento físico</option>
            <option value="Saúde e qualidade de vida">Saúde e qualidade de vida</option>
            <option value="Reabilitação">Reabilitação</option>
            <option value="Outro">Outro</option>
          </select>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'duration'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'duration'"
            aria-controls="request-panel-duration"
            @click="toggleSection('duration')"
          >
            <span class="request-accordion-icon" aria-hidden="true">⏳</span>
            <span class="request-accordion-title">Duração</span>
            <span class="request-accordion-preview">{{
              (form.singleLesson ? `${form.singleLessonCount} ${form.singleLessonCount === 1 ? 'aula avulsa' : 'aulas avulsas'}` : form.desiredDuration) + ' · ' + form.preferredStartDate.split('-').reverse().join('/')
            }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'duration'"
          id="request-panel-duration"
          class="request-accordion-panel"
        >
          <label class="request-accordion-check"
            ><input v-model="form.singleLesson" type="checkbox" /> Aula avulsa</label
          >
          <template v-if="form.singleLesson">
            <label for="single-lesson-count" class="request-accordion-label">Quantidade de aulas</label>
            <select id="single-lesson-count" v-model.number="form.singleLessonCount" class="request-accordion-select">
              <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
            </select>
          </template>
          <label for="accordion-duration" class="request-accordion-label"
            >Duração do acompanhamento</label
          >
          <select
            id="accordion-duration"
            v-model="form.desiredDuration"
            class="request-accordion-select"
            :disabled="form.singleLesson"
          >
            <option
              v-for="months in 6"
              :key="months"
              :value="months + (months === 1 ? ' mês' : ' meses')"
            >
              {{ months }} {{ months === 1 ? 'mês' : 'meses' }}
            </option>
          </select>
          <label for="preferred-start-date" class="request-accordion-label">Data inicial pretendida</label>
          <input id="preferred-start-date" v-model="form.preferredStartDate" type="date" :min="trainingDate()" required class="request-accordion-select" />
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'frequency'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'frequency'"
            aria-controls="request-panel-frequency"
            @click="toggleSection('frequency')"
          >
            <span class="request-accordion-icon" aria-hidden="true">📅</span>
            <span class="request-accordion-title">Frequência</span>
            <span class="request-accordion-preview"
              >{{ form.sessionsPerWeek }}
              {{ Number(form.sessionsPerWeek) === 1 ? 'aula' : 'aulas' }}/semana ·
              {{ form.trainingDays.join(', ') || 'Escolha os dias' }}</span
            >
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'frequency'"
          id="request-panel-frequency"
          class="request-accordion-panel"
        >
          <p class="request-accordion-label">Quantas aulas por semana?</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Aulas por semana"
          >
            <label v-for="n in 4" :key="n" class="request-choice">
              <input
                v-model="form.sessionsPerWeek"
                type="radio"
                name="accordion-sessions"
                :value="String(n)"
                :disabled="form.singleLesson && n !== 1"
              />
              <span>{{ n }}</span>
            </label>
          </div>
          <p class="request-accordion-label">Em quais dias você pode treinar?</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Dias disponíveis"
          >
            <label v-for="day in trainingDayOptions" :key="day.value" class="request-choice">
              <input v-model="form.trainingDays" type="checkbox" :value="day.value" />
              <span>{{ day.label }}</span>
            </label>
          </div>
          <p v-if="!form.trainingDays.length" class="request-accordion-warning" role="alert">
            Selecione pelo menos um dia.
          </p>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'schedule'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'schedule'"
            aria-controls="request-panel-schedule"
            @click="toggleSection('schedule')"
          >
            <span class="request-accordion-icon" aria-hidden="true">🕒</span>
            <span class="request-accordion-title">Horário preferencial</span>
            <span class="request-accordion-preview"
              >{{ minutesToTime(trainingStartMinutes) }} às
              {{ minutesToTime(trainingEndMinutes) }}</span
            >
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'schedule'"
          id="request-panel-schedule"
          class="request-accordion-panel"
        >
          <p class="request-accordion-label">Escolha uma faixa de horário</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Faixas de horário"
          >
            <button
              v-for="range in trainingTimeRanges"
              :key="range.start"
              type="button"
              class="request-choice training-time-button"
              :class="{ 'training-time-button-active': trainingStartMinutes === range.start }"
              :aria-pressed="trainingStartMinutes === range.start"
              @click="selectTrainingTimeRange(range.start, range.end)"
            >
              {{ range.label }}
            </button>
          </div>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'location'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'location'"
            aria-controls="request-panel-location"
            @click="toggleSection('location')"
          >
            <span class="request-accordion-icon" aria-hidden="true">📍</span>
            <span class="request-accordion-title">Local do atendimento</span>
            <span class="request-accordion-preview">{{
              form.gymName === 'Outros'
                ? otherGymName || 'Informe o local'
                : form.gymName || form.city || 'A definir'
            }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'location'"
          id="request-panel-location"
          class="request-accordion-panel"
        >
          <label for="accordion-city" class="request-accordion-label">Cidade</label>
          <select id="accordion-city" v-model="form.city" class="request-accordion-select">
            <option value="" disabled>Escolha uma cidade</option>
            <option v-for="city in supportedRequestCities" :key="city" :value="city">
              {{ city }}
            </option>
          </select>
          <label for="accordion-gym" class="request-accordion-label">Academia / local</label>
          <select
            id="accordion-gym"
            v-model="form.gymName"
            class="request-accordion-select"
            @change="form.attendsGym = Boolean(form.gymName)"
          >
            <option value="" disabled>Selecione o local</option>
            <option v-for="gym in publicTrainerAcademies" :key="gym" :value="gym">{{ gym }}</option>
            <option value="Outros">Outros</option>
          </select>
          <template v-if="form.gymName === 'Outros'">
            <label for="accordion-other-gym" class="request-accordion-label">Informe o local</label>
            <input
              id="accordion-other-gym"
              v-model.trim="otherGymName"
              class="request-accordion-input"
              maxlength="100"
              placeholder="Nome do local"
            />
          </template>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'participants'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'participants'"
            aria-controls="request-panel-participants"
            @click="toggleSection('participants')"
          >
            <span class="request-accordion-icon" aria-hidden="true">👥</span>
            <span class="request-accordion-title">Participantes</span>
            <span class="request-accordion-preview">{{
              form.withCompanion ? 'Com acompanhante' : 'Sozinho'
            }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'participants'"
          id="request-panel-participants"
          class="request-accordion-panel"
        >
          <p class="request-accordion-label">Como você vai treinar?</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Participantes da aula"
          >
            <label class="request-choice"
              ><input
                v-model="form.withCompanion"
                type="radio"
                name="accordion-companion"
                :value="false"
              /><span>Sozinho</span></label
            >
            <label class="request-choice"
              ><input
                v-model="form.withCompanion"
                type="radio"
                name="accordion-companion"
                :value="true"
              /><span>Com acompanhante</span></label
            >
          </div>
        </div>
    </RequestAccordionItem>

    <RequestAccordionItem :open="expandedSection === 'professionals'">
      <template #header>
        <h3 class="request-accordion-heading">
          <button
            type="button"
            class="request-accordion-toggle"
            :aria-expanded="expandedSection === 'professionals'"
            aria-controls="request-panel-professionals"
            @click="toggleSection('professionals')"
          >
            <span class="request-accordion-icon" aria-hidden="true">🧑‍🏫</span>
            <span class="request-accordion-title">Profissionais</span>
            <span class="request-accordion-preview">{{
              selectedTrainerIds.length ? selectedTrainerIds.length + ' selecionado(s)' : 'A definir'
            }}</span>
            <span class="request-accordion-chevron" aria-hidden="true"></span>
          </button>
        </h3>
      </template>
        <div
          v-if="expandedSection === 'professionals'"
          id="request-panel-professionals"
          class="request-accordion-panel"
        >
          <p class="request-accordion-label">Gênero do personal</p>
          <div
            class="request-choice-row request-accordion-choices"
            role="group"
            aria-label="Gênero do personal"
          >
            <label
              v-for="option in [
                { value: 'indiferente', label: 'Sem preferência' },
                { value: 'feminino', label: 'Feminino' },
                { value: 'masculino', label: 'Masculino' },
              ]"
              :key="option.value"
              class="request-choice"
            >
              <input
                v-model="form.trainerGenderPreference"
                type="radio"
                name="accordion-trainer-gender"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
          <p class="request-accordion-subtext">Preferência: {{ professionalGenderLabel }}</p>
          <p v-if="selectedTrainerNames.length" class="request-accordion-subtext">
            {{ selectedTrainerNames.join(', ') }}
          </p>
          <label for="accordion-trainer-search" class="request-accordion-label"
            >Escolha até 20 profissionais</label
          >
          <input
            id="accordion-trainer-search"
            v-model="trainerSearch"
            type="search"
            class="request-accordion-input"
            placeholder="Buscar profissional pelo nome"
          />
          <p v-if="publicTrainersLoading" class="request-accordion-subtext" role="status">
            Carregando profissionais…
          </p>
          <p v-else-if="publicTrainersError" class="request-accordion-warning" role="alert">
            {{ publicTrainersError }}
          </p>
          <div
            v-else
            class="request-trainer-scroll"
            role="group"
            aria-label="Selecionar profissionais"
          >
            <div
              v-for="trainer in visibleTrainers"
              :key="trainer.trainerId"
              class="request-trainer-row"
            >
              <label class="request-trainer-label">
                <input
                  type="checkbox"
                  :checked="selectedTrainerIds.includes(trainer.trainerId)"
                  :disabled="
                    !selectedTrainerIds.includes(trainer.trainerId) &&
                    selectedTrainerIds.length >= MAX_TRAINERS
                  "
                  @change="toggleTrainer(trainer.trainerId)"
                />
                <span>{{ trainerDisplayName(trainer.name) }}</span>
              </label>
              <a
                v-if="trainer.instagram"
                :href="
                  trainer.instagram.startsWith('http')
                    ? trainer.instagram
                    : 'https://www.instagram.com/' + trainer.instagram.replace(/^@/, '')
                "
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="'Instagram de ' + trainer.name"
                >Instagram ↗</a
              >
            </div>
            <p v-if="!visibleTrainers.length" class="request-accordion-subtext">
              Nenhum profissional encontrado para este local.
            </p>
          </div>
          <p class="request-accordion-subtext" aria-live="polite">
            {{ selectedTrainerIds.length }} de 20 profissionais selecionados
          </p>
        </div>
    </RequestAccordionItem>

    <p
      v-if="
        !form.city ||
        !form.gymName ||
        (form.gymName === 'Outros' && !otherGymName.trim()) ||
        !form.trainingDays.length
      "
      class="request-accordion-warning"
      role="alert"
    >
      Preencha a cidade, o local e pelo menos um dia de treino antes de continuar.
    </p>

    <div v-if="customerSignedInName && !customerForm.whatsapp" class="field field-wide" style="margin-top: 12px">
      <label for="request-whatsapp" class="field-label">WhatsApp com DDD (obrigatório para enviar)</label>
      <input
        id="request-whatsapp"
        v-model="form.phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        maxlength="20"
        placeholder="(21) 99999-9999"
        required
      />
    </div>
    <p v-if="status" class="request-accordion-warning" role="alert">{{ status }}</p>

    <button
      class="primary-button field-wide request-accordion-submit"
      type="button"
      :disabled="
        submittingRequest ||
        !form.city ||
        !form.gymName ||
        (form.gymName === 'Outros' && !otherGymName.trim()) ||
        !form.trainingDays.length
      "
      @click="selectedTrainerIds.length ? confirmServiceRequest() : toggleSection('professionals')"
    >
      {{
        submittingRequest
          ? 'Enviando…'
          : selectedTrainerIds.length
            ? customerSignedInName
              ? 'Confirmar e enviar solicitação'
              : 'Entrar para confirmar solicitação'
            : 'Escolher profissionais'
      }}
    </button>
  </form>
</template>

<style scoped>
.request-trainer-scroll {
  max-height: 290px;
  overflow-y: auto;
  margin-top: 12px;
  border: 1px solid var(--border, #8885);
  border-radius: 10px;
}
.request-trainer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--border, #8883);
}
.request-trainer-row:last-child {
  border-bottom: 0;
}
.request-trainer-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}
.request-trainer-row a {
  flex-shrink: 0;
  font-size: 13px;
}
</style>
