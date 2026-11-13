<script setup lang="ts">
import { ref } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  minutesToTime, trainingTimeRanges, publicTrainerAcademies, selectedTrainerIds,
  selectedTrainerNames, customerSignedInName, trainingDayOptions, supportedRequestCities,
  form, trainingStartMinutes, trainingEndMinutes, selectTrainingTimeRange,
  submittingRequest, otherGymName, selectTrainersForDraft, confirmServiceRequest,
} = useFitpesoContext()
const editingField = ref('')
const editError = ref('')
const editTitles: Record<string, string> = {
 age:'Idade',gender:'Sexo',city:'Cidade',gym:'Academia / local',objective:'Objetivo',
 sessions:'Aulas por semana',days:'Dias disponíveis',time:'Horário disponível',
 companion:'Participantes',duration:'Duração',trainerGender:'Gênero do personal'
}
let oldForm = { ...form, trainingDays: [...form.trainingDays] }
let oldGym = otherGymName.value
let oldStart = trainingStartMinutes.value
let oldEnd = trainingEndMinutes.value
function beginEdit(field: string) {
 oldForm = { ...form, trainingDays: [...form.trainingDays] }
 oldGym = otherGymName.value
 oldStart = trainingStartMinutes.value
 oldEnd = trainingEndMinutes.value
 editError.value = ''
 editingField.value = field
}
function closeEdit(restore = true) {
 if (restore) {
   Object.assign(form, oldForm)
   otherGymName.value = oldGym
   trainingStartMinutes.value = oldStart
   trainingEndMinutes.value = oldEnd
 }
 editingField.value = ''
 editError.value = ''
}
function saveEdit() {
 const f = editingField.value
 if (f === 'age' && (!Number.isInteger(Number(form.age)) || Number(form.age) < 15 || Number(form.age) > 100))
   editError.value = 'Selecione uma idade entre 15 e 100 anos.'
 else if (f === 'city' && !supportedRequestCities.includes(form.city))
   editError.value = 'Selecione uma cidade atendida.'
 else if (f === 'gym' && (!form.gymName || (form.gymName === 'Outros' && !otherGymName.value.trim())))
   editError.value = 'Informe o local de atendimento.'
 else if (f === 'days' && !form.trainingDays.length)
   editError.value = 'Selecione pelo menos um dia.'
 else closeEdit(false)
}
</script>
<template>
<form id="contact-fields" class="form contact-fields request-form" aria-labelledby="contact-form-title" @submit.prevent>
      <div class="field-wide request-summary-table-wrap">
        <table class="request-summary-table">
          <tbody>
            <tr>
              <th scope="row"><span class="summary-row-icon" aria-hidden="true">🎂</span>Idade</th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar age" title="Editar" @click="beginEdit('age')">✎</button>{{ form.age ? form.age + ' anos' : 'Não informada' }}</td>
            </tr>
            <tr>
              <th scope="row"><span class="summary-row-icon" aria-hidden="true">👤</span>Sexo</th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar gender" title="Editar" @click="beginEdit('gender')">✎</button>
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
              <td><button type="button" class="request-edit-pencil" aria-label="Editar city" title="Editar" @click="beginEdit('city')">✎</button>{{ form.city }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🏋️</span>Academia / local
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar gym" title="Editar" @click="beginEdit('gym')">✎</button>{{ form.gymName === 'Outros' ? otherGymName : form.gymName }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🎯</span>Objetivo
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar objective" title="Editar" @click="beginEdit('objective')">✎</button>{{ form.objective || 'Não informado' }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🔢</span>Aulas por semana
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar sessions" title="Editar" @click="beginEdit('sessions')">✎</button>{{ form.sessionsPerWeek }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">📅</span>Dias disponíveis
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar days" title="Editar" @click="beginEdit('days')">✎</button>{{ form.trainingDays.join(', ') }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🕒</span>Horário disponível
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar time" title="Editar" @click="beginEdit('time')">✎</button>
                {{ minutesToTime(trainingStartMinutes) }} às {{ minutesToTime(trainingEndMinutes) }}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">👥</span>Participantes
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar companion" title="Editar" @click="beginEdit('companion')">✎</button>{{ form.withCompanion ? 'Com um acompanhante' : 'Sozinho' }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">⏳</span>Duração
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar duration" title="Editar" @click="beginEdit('duration')">✎</button>{{ form.singleLesson ? 'Aula avulsa' : form.desiredDuration }}</td>
            </tr>
            <tr>
              <th scope="row">
                <span class="summary-row-icon" aria-hidden="true">🧑‍🏫</span>Gênero do personal
              </th>
              <td><button type="button" class="request-edit-pencil" aria-label="Editar trainerGender" title="Editar" @click="beginEdit('trainerGender')">✎</button>
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
              <td><button type="button" class="request-edit-pencil" aria-label="Editar trainers" title="Editar" @click="selectTrainersForDraft()">✎</button>
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
<div v-if="editingField" class="request-edit-overlay" @click.self="closeEdit()" @keydown.esc.stop="closeEdit()">
 <section class="request-edit-dialog" role="dialog" aria-modal="true" :aria-label="'Editar ' + editTitles[editingField]">
  <header class="request-edit-heading"><h3>{{ editTitles[editingField] }}</h3><button type="button" class="request-edit-close" aria-label="Fechar" @click="closeEdit()">×</button></header>
  <div v-if="editingField === 'age'" class="request-edit-body"><label for="edit-age">Idade: <strong>{{ form.age }} anos</strong></label><input id="edit-age" v-model="form.age" type="range" min="15" max="100" step="1"/><div class="request-age-limits"><span>15 anos</span><span>100 anos</span></div></div>
  <div v-else-if="editingField === 'gender'" class="request-edit-body request-choice-row"><label v-for="o in [{value:'feminino',label:'Mulher'},{value:'masculino',label:'Homem'},{value:'nao_informar',label:'Prefiro não informar'}]" :key="o.value" class="request-choice"><input v-model="form.clientGender" type="radio" name="edit-gender" :value="o.value" /><span>{{ o.label }}</span></label></div>
  <div v-else-if="editingField === 'city'" class="request-edit-body"><label for="edit-city">Cidade</label><select id="edit-city" v-model="form.city"><option value="" disabled>Selecione a cidade</option><option v-for="c in supportedRequestCities" :key="c" :value="c">{{ c }}</option></select></div>
  <div v-else-if="editingField === 'gym'" class="request-edit-body"><label for="edit-gym">Local de atendimento</label><select id="edit-gym" v-model="form.gymName" @change="form.attendsGym = Boolean(form.gymName)"><option value="" disabled>Selecione</option><option v-for="g in publicTrainerAcademies" :key="g" :value="g">{{ g }}</option><option value="Outros">Outros</option></select><template v-if="form.gymName === 'Outros'"><label for="edit-other">Nome do local</label><input id="edit-other" v-model.trim="otherGymName" maxlength="100" /></template></div>
  <div v-else-if="editingField === 'objective'" class="request-edit-body"><label for="edit-objective">Objetivo</label><select id="edit-objective" v-model="form.objective"><option v-for="o in ['Emagrecimento','Hipertrofia','Condicionamento físico','Saúde e qualidade de vida','Reabilitação','Outro']" :key="o" :value="o">{{ o === 'Hipertrofia' ? 'Ganho de massa muscular (hipertrofia)' : o }}</option></select></div>
  <div v-else-if="editingField === 'sessions'" class="request-edit-body request-choice-row"><label v-for="n in 4" :key="n" class="request-choice"><input v-model="form.sessionsPerWeek" type="radio" name="edit-sessions" :value="String(n)"/><span>{{ n }} {{ n === 1 ? 'aula' : 'aulas' }}</span></label></div>
  <div v-else-if="editingField === 'days'" class="request-edit-body request-choice-row"><label v-for="d in trainingDayOptions" :key="d.value" class="request-choice"><input v-model="form.trainingDays" type="checkbox" :value="d.value"/><span>{{ d.label }}</span></label></div>
  <div v-else-if="editingField === 'time'" class="request-edit-body request-choice-row"><button v-for="range in trainingTimeRanges" :key="range.start" type="button" class="request-choice training-time-button" :class="{ 'training-time-button-active': trainingStartMinutes === range.start }" :aria-pressed="trainingStartMinutes === range.start" @click="selectTrainingTimeRange(range.start,range.end)">{{ range.label }}</button></div>
  <div v-else-if="editingField === 'companion'" class="request-edit-body request-choice-row"><label v-for="o in [{value:false,label:'Sozinho'},{value:true,label:'Com acompanhante'}]" :key="o.value" class="request-choice"><input v-model="form.withCompanion" type="radio" name="edit-companion" :value="o.value" /><span>{{ o.label }}</span></label></div>
  <div v-else-if="editingField === 'duration'" class="request-edit-body"><label><input v-model="form.singleLesson" type="checkbox"/> Aula avulsa</label><label for="edit-duration">Duração do atendimento</label><select id="edit-duration" v-model="form.desiredDuration" :disabled="form.singleLesson"><option v-for="m in 6" :key="m" :value="m + (m===1 ? ' mês' : ' meses')">{{ m }} {{ m===1 ? 'mês' : 'meses' }}</option></select></div>
  <div v-else-if="editingField === 'trainerGender'" class="request-edit-body request-choice-row"><label v-for="o in [{value:'indiferente',label:'Sem preferência'},{value:'feminino',label:'Feminino'},{value:'masculino',label:'Masculino'}]" :key="o.value" class="request-choice"><input v-model="form.trainerGenderPreference" type="radio" name="edit-trainer-gender" :value="o.value" /><span>{{ o.label }}</span></label></div>
  <p v-if="editError" class="request-edit-error" role="alert">{{ editError }}</p>
  <footer class="request-edit-actions"><button type="button" class="secondary-button" @click="closeEdit()">Cancelar</button><button type="button" class="primary-button" @click="saveEdit">Salvar</button></footer>
 </section>
</div>
</form>
</template>
