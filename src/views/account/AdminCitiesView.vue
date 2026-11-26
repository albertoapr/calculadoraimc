<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import { listCities, saveCity, type City } from '../../services/citiesService'

const { goHome, loadActiveCities, loadPublicCities } = useFitpesoContext()
const cities = ref<City[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const editing = ref(false)
const cityId = ref('')
const cityVersion = ref<string>()
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const form = reactive({ name: '', state: 'RJ', minimum: '', average: '', active: true })
const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const formatPrice = (value: number | null) => value === null ? '—' : real.format(value / 100)
const priceInput = (value: number | null) => value === null ? '' : (value / 100).toFixed(2).replace('.', ',')
const session = () => sessionStorage.getItem('fitpeso-customer-session') ??
  sessionStorage.getItem('fitpeso-google-session') ?? ''

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    cities.value = await listCities('admin', session())
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as cidades.'
  } finally {
    loading.value = false
  }
}

function edit(city?: City) {
  cityId.value = city?.cityId ?? ''
  cityVersion.value = city?.updatedAt
  form.name = city?.name ?? ''
  form.state = city?.state ?? 'RJ'
  form.minimum = priceInput(city?.minimumHourlyRateCents ?? null)
  form.average = priceInput(city?.averageHourlyRateCents ?? null)
  form.active = city?.active ?? true
  error.value = ''
  notice.value = ''
  editing.value = true
}

function toCents(value: string) {
  const clean = value.trim()
  if (!clean) return null
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(clean)) return Number.NaN
  return Math.round(Number(clean.replace(',', '.')) * 100)
}

async function save() {
  if (saving.value) return
  error.value = ''
  notice.value = ''
  const minimum = toCents(form.minimum)
  const average = toCents(form.average)
  if ([minimum, average].some(price => price !== null && (!Number.isSafeInteger(price) || price <= 0)) ||
      (minimum !== null && average !== null && average < minimum)) {
    error.value = 'Informe preços positivos em reais. A média deve ser igual ou superior ao mínimo.'
    return
  }
  saving.value = true
  try {
    await saveCity({
      name: form.name,
      state: form.state,
      active: form.active,
      updatedAt: cityVersion.value,
      minimumHourlyRateCents: minimum,
      averageHourlyRateCents: average,
    }, session(), cityId.value || undefined)
    editing.value = false
    notice.value = 'Cidade salva.'
    await Promise.all([refresh(), loadActiveCities(true), loadPublicCities(true)])
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar a cidade.'
  } finally {
    saving.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section aria-labelledby="admin-cities-title">
    <h2 id="admin-cities-title" class="request-form-title">
      <button class="title-back-button" type="button" aria-label="Voltar" @click="goHome">&lt;</button>
      Cadastro de cidades
    </h2>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Carregando cidades…</p>
    <button v-if="error && !editing" type="button" class="secondary-button" @click="refresh">
      Tentar novamente
    </button>

    <form v-if="editing" class="form" @submit.prevent="save">
      <label class="field">
        <span class="field-label">Município</span>
        <input v-model="form.name" required minlength="2" maxlength="80" :readonly="Boolean(cityId)" />
      </label>
      <label class="field">
        <span class="field-label">UF</span>
        <select v-model="form.state" :disabled="Boolean(cityId)">
          <option v-for="state in states" :key="state" :value="state">{{ state }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Valor mínimo por hora-aula (R$)</span>
        <input v-model="form.minimum" inputmode="decimal" placeholder="Opcional" />
      </label>
      <label class="field">
        <span class="field-label">Valor médio por hora-aula (R$)</span>
        <input v-model="form.average" inputmode="decimal" placeholder="Opcional" />
      </label>
      <label class="field-wide">
        <input v-model="form.active" type="checkbox" />
        Cidade ativa
      </label>
      <div class="field-wide city-actions">
        <button type="submit" class="primary-button" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Salvar cidade' }}
        </button>
        <button type="button" class="secondary-button" :disabled="saving" @click="editing = false">
          Cancelar
        </button>
      </div>
    </form>

    <template v-else>
      <button type="button" class="primary-button" :disabled="loading || saving" @click="edit()">
        Nova cidade
      </button>
      <div v-if="cities.length" class="city-table">
        <table aria-label="Cidades cadastradas e valores por hora-aula">
          <thead><tr><th>Cidade</th><th>Status</th><th>Mínimo/h</th><th>Média/h</th><th>Ações</th></tr></thead>
          <tbody>
            <tr v-for="city in cities" :key="city.cityId">
              <th scope="row">{{ city.name }}, {{ city.state }}</th>
              <td>{{ city.active ? 'Ativa' : 'Inativa' }}</td>
              <td>{{ formatPrice(city.minimumHourlyRateCents) }}</td>
              <td>{{ formatPrice(city.averageHourlyRateCents) }}</td>
              <td>
                <button type="button" class="secondary-button" :aria-label="'Editar ' + city.name" @click="edit(city)">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.city-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.city-table {
  margin-top: 16px;
  overflow-x: auto;
}
.city-table table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.city-table th,
.city-table td {
  padding: 8px;
  border-bottom: 1px solid currentColor;
}
</style>
