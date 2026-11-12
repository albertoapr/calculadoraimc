<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  minutesToTime,
  trainingTimeRanges,
  requestStep,
  publicTrainerAcademies,
  selectedTrainerIds,
  selectedTrainerNames,
  customerSignedInName,
  trainingDayOptions,
  form,
  trainingStartMinutes,
  trainingEndMinutes,
  selectTrainingTimeRange,
  submittingRequest,
  otherGymName,
  modifyRequestDetails,
  continueToTrainerSelection,
  selectTrainersForDraft,
  confirmServiceRequest,
  sendResult,
} = useFitpesoContext()
</script>

<template>
  <form
    id="contact-fields"
    class="form contact-fields request-form"
    aria-labelledby="contact-form-title"
    @submit.prevent="sendResult"
  >
    <div
      v-if="requestStep < 4"
      class="field-wide request-step-progress"
      role="status"
      aria-live="polite"
    >
      Etapa {{ requestStep }} de 4
    </div>
    <template v-if="requestStep < 4">
      <section
        v-if="requestStep === 1"
        class="request-card field-wide"
        aria-labelledby="request-client-heading"
      >
        <h3 id="request-client-heading">👤 Sobre você</h3>
        <label class="field" for="request-client-age">
          <span class="field-label">Qual é a sua idade?</span>
          <input
            id="request-client-age"
            v-model="form.age"
            name="clientAge"
            type="number"
            inputmode="numeric"
            min="1"
            max="120"
            step="1"
            placeholder="Idade em anos"
            required
          />
        </label>
        <p class="request-question">Qual é o seu sexo?</p>
        <div class="request-gender-row" role="group" aria-label="Seu sexo">
          <label
            v-for="option in [
              { value: 'feminino', label: 'Mulher' },
              { value: 'masculino', label: 'Homem' },
              { value: 'nao_informar', label: 'Prefiro não informar' },
            ]"
            :key="option.value"
            class="request-choice request-gender"
          >
            <input
              v-model="form.clientGender"
              type="radio"
              name="clientGender"
              :value="option.value"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </section>

      <section
        v-if="requestStep === 1"
        class="request-card field-wide"
        aria-labelledby="request-training-heading"
      >
        <h3 id="request-training-heading">🏋️ Seu treino</h3>
        <label class="field" for="request-objective">
          <span class="field-label">Qual é o seu objetivo?</span>
          <select id="request-objective" v-model="form.objective" name="objective" required>
            <option value="" disabled>Selecione seu objetivo</option>
            <option value="Emagrecimento">Emagrecimento</option>
            <option value="Hipertrofia">Ganho de massa muscular (hipertrofia)</option>
            <option value="Condicionamento físico">Condicionamento físico</option>
            <option value="Saúde e qualidade de vida">Saúde e qualidade de vida</option>
            <option value="Reabilitação">Reabilitação</option>
            <option value="Outro">Outro</option>
          </select>
        </label>
        <p class="request-question">Quantas aulas por semana você deseja?</p>
        <div class="request-choice-row" role="group" aria-label="Quantidade de aulas por semana">
          <label v-for="number in 4" :key="number" class="request-choice">
            <input
              v-model="form.sessionsPerWeek"
              type="radio"
              name="sessionsPerWeek"
              :value="String(number)"
            />
            <span>{{ number }}</span>
          </label>
        </div>
      </section>

      <section
        v-if="requestStep === 2"
        class="request-card field-wide"
        aria-labelledby="request-location-heading"
      >
        <h3 id="request-location-heading">📍 Local de atendimento</h3>
        <label class="field" for="request-gym-name">
          <span class="field-label">Onde você deseja treinar?</span>
          <select
            id="request-gym-name"
            v-model="form.gymName"
            name="gymName"
            required
            @change="form.attendsGym = Boolean(form.gymName)"
          >
            <option value="" disabled>Selecione o local</option>
            <option v-for="gym in publicTrainerAcademies" :key="gym" :value="gym">{{ gym }}</option>
            <option value="Outros">Outros</option>
          </select>
        </label>
        <label v-if="form.gymName === 'Outros'" class="field" for="request-other-gym">
          <span class="field-label">Informe o lugar</span>
          <input
            id="request-other-gym"
            v-model.trim="otherGymName"
            type="text"
            maxlength="100"
            required
            placeholder="Nome do local onde pretende treinar"
          />
        </label>
      </section>

      <section
        v-if="requestStep === 2"
        class="request-card field-wide"
        aria-labelledby="request-availability-heading"
      >
        <h3 id="request-availability-heading">▦ Sua disponibilidade</h3>
        <p class="request-question">Em quais dias você pode treinar?</p>
        <div class="request-choice-row" role="group" aria-label="Dias disponíveis">
          <label v-for="day in trainingDayOptions" :key="day.value" class="request-choice">
            <input
              v-model="form.trainingDays"
              type="checkbox"
              name="trainingDays"
              :value="day.value"
            />
            <span>{{ day.label }}</span>
          </label>
        </div>
        <p class="request-question">Qual faixa de horário você prefere?</p>
        <p class="request-hint">Selecione uma faixa para todos os dias escolhidos.</p>
        <div class="request-choice-row" role="group" aria-label="Faixas de horário">
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
      </section>

      <section
        v-if="requestStep === 3"
        class="request-card field-wide"
        aria-labelledby="request-gender-heading"
      >
        <h3 id="request-gender-heading">♙ Preferência do personal</h3>
        <p class="request-question">Você tem preferência pelo gênero do personal?</p>
        <div class="request-gender-row" role="group" aria-label="Preferência de gênero">
          <label
            v-for="option in [
              { value: 'indiferente', label: 'Sem preferência' },
              { value: 'masculino', label: 'Masculino' },
              { value: 'feminino', label: 'Feminino' },
            ]"
            :key="option.value"
            class="request-choice request-gender"
          >
            <input
              v-model="form.trainerGenderPreference"
              type="radio"
              name="trainerGenderPreference"
              :value="option.value"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </section>

      <section
        v-if="requestStep === 3"
        class="request-card field-wide"
        aria-labelledby="request-companion-heading"
      >
        <h3 id="request-companion-heading">Como você vai fazer a aula?</h3>
        <div class="request-gender-row" role="group" aria-label="Participantes da aula">
          <label class="request-choice"
            ><input
              v-model="form.withCompanion"
              type="radio"
              name="withCompanion"
              :value="false"
            /><span>Sozinho</span></label
          >
          <label class="request-choice"
            ><input
              v-model="form.withCompanion"
              type="radio"
              name="withCompanion"
              :value="true"
            /><span>Com um acompanhante</span></label
          >
        </div>
      </section>

      <section
        v-if="requestStep === 3"
        class="request-card field-wide"
        aria-labelledby="request-duration-heading"
      >
        <h3 id="request-duration-heading">⌛ Duração do atendimento</h3>
        <label class="admin-trainer-active"
          ><input v-model="form.singleLesson" type="checkbox" /> Aula avulsa</label
        >
        <label class="field" for="request-duration">
          <span class="field-label">Por quanto tempo você deseja o acompanhamento?</span>
          <select
            id="request-duration"
            v-model="form.desiredDuration"
            :disabled="form.singleLesson"
            :required="!form.singleLesson"
          >
            <option
              v-for="months in 6"
              :key="months"
              :value="`${months} ${months === 1 ? 'mês' : 'meses'}`"
            >
              {{ months }} {{ months === 1 ? 'mês' : 'meses' }}
            </option>
          </select>
        </label>
      </section>

      <button class="primary-button field-wide" type="button" @click="continueToTrainerSelection">
        {{ requestStep === 3 ? 'Selecionar profissionais →' : 'Continuar →' }}
      </button>
    </template>

    <template v-else>
      <div class="field-wide request-summary-table-wrap">
        <table class="request-summary-table">
          <tbody>
            <tr>
              <th scope="row"><span class="summary-row-icon" aria-hidden="true">🎂</span>Idade</th>
              <td>{{ form.age ? form.age + ' anos' : 'Não informada' }}</td>
            </tr>
            <tr>
              <th scope="row"><span class="summary-row-icon" aria-hidden="true">👤</span>Sexo</th>
              <td>
                {{
                  form.clientGender === 'feminino'
                    ? 'Mulher'
                    : form.clientGender === 'masculino'
                      ? 'Homem'
                      : 'Prefiro não informar'
                }}
              </td>
            </tr>
            <tr>
              <th scope="row"><span class="summary-row-icon" aria-hidden="true">📍</span>Cidade</th>
              <td>{{ form.city }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🏋️</span>Academia / local
              </th>
              <td>{{ form.gymName === 'Outros' ? otherGymName : form.gymName }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🎯</span>Objetivo
              </th>
              <td>{{ form.objective || 'Não informado' }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🔢</span>Aulas por semana
              </th>
              <td>{{ form.sessionsPerWeek }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">📅</span>Dias disponíveis
              </th>
              <td>{{ form.trainingDays.join(', ') }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🕒</span>Horário disponível
              </th>
              <td>
                {{ minutesToTime(trainingStartMinutes) }} às {{ minutesToTime(trainingEndMinutes) }}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">👥</span>Participantes
              </th>
              <td>{{ form.withCompanion ? 'Com um acompanhante' : 'Sozinho' }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">⏳</span>Duração
              </th>
              <td>{{ form.singleLesson ? 'Aula avulsa' : form.desiredDuration }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🧑‍🏫</span>Gênero do personal
              </th>
              <td>
                {{
                  form.trainerGenderPreference === 'indiferente'
                    ? 'Sem preferência'
                    : form.trainerGenderPreference === 'feminino'
                      ? 'Feminino'
                      : 'Masculino'
                }}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">✅</span>Personais escolhidos
              </th>
              <td>
                <span v-for="(name, index) in selectedTrainerNames" :key="index"
                  >{{ index ? ', ' : '' }}{{ name }}</span
                ><span v-if="!selectedTrainerNames.length">Nenhum selecionado</span>
              </td>
            </tr>
            <tr class="request-summary-price">
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">💰</span>Valor estimado
              </th>
              <td>
                <strong
                  >a partir de
                  {{
                    (
                      (form.singleLesson ? 40 : Number(form.sessionsPerWeek) * 4 * 40) *
                      (form.withCompanion ? 2 : 1)
                    ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  }}</strong
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="secondary-button field-wide" type="button" @click="modifyRequestDetails">
        Modificar atendimento
      </button>
      <button class="primary-button field-wide" type="button" @click="selectTrainersForDraft">
        Alterar personais{{
          selectedTrainerIds.length ? ' (' + selectedTrainerIds.length + ')' : ''
        }}
      </button>
      <button
        v-if="selectedTrainerIds.length"
        class="primary-button field-wide"
        type="button"
        :disabled="submittingRequest"
        @click="confirmServiceRequest"
      >
        {{
          submittingRequest
            ? 'Enviando…'
            : customerSignedInName
              ? 'Confirmar e enviar'
              : 'Entrar para confirmar'
        }}
      </button>
    </template>
  </form>
</template>
