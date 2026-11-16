<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createAdminAcademy,
  deactivateAdminAcademy,
  listAdminAcademies,
  updateAdminAcademy,
  type Academy,
  type AcademyWrite,
} from '../../services/academiesService'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const { goHome, supportedRequestCities } = useFitpesoContext()
const academies = ref<Academy[]>([])
const loading = ref(false)
const saving = ref(false)
const status = ref('')
const search = ref('')
const cityFilter = ref('')
const activeFilter = ref('all')
const selectedId = ref('')
const editing = ref(false)
const empty = (): AcademyWrite => ({
  name: '',
  city: 'Mesquita',
  neighborhood: '',
  address: '',
  zipCode: '',
  active: true,
})
const form = reactive<AcademyWrite>(empty())

const visible = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return academies.value.filter((academy) =>
    (!cityFilter.value || cityFilter.value === academy.city) &&
    (activeFilter.value === 'all' ||
      (activeFilter.value === 'active' ? academy.active : !academy.active)) &&
    (!query || [academy.name, academy.neighborhood, academy.address].some((text) =>
      text.toLocaleLowerCase('pt-BR').includes(query))),
  )
})

function token() {
  return sessionStorage.getItem('fitpeso-customer-session') ??
    sessionStorage.getItem('fitpeso-google-session') ?? ''
}

async function refresh() {
  const session = token()
  if (!session) {
    status.value = 'Entre novamente como administrador.'
    return
  }
  loading.value = true
  status.value = ''
  try {
    academies.value = await listAdminAcademies(session)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível carregar as academias.'
  } finally {
    loading.value = false
  }
}

function newAcademy() {
  Object.assign(form, empty())
  selectedId.value = ''
  editing.value = true
  status.value = ''
}

function editAcademy(academy: Academy) {
  selectedId.value = academy.academyId
  Object.assign(form, {
    name: academy.name,
    city: academy.city,
    neighborhood: academy.neighborhood,
    address: academy.address,
    zipCode: academy.zipCode,
    active: academy.active,
  })
  editing.value = true
  status.value = ''
}

function cancelEdit() {
  editing.value = false
  selectedId.value = ''
}

async function save() {
  if (saving.value) return
  const session = token()
  if (!session) {
    status.value = 'Entre novamente como administrador.'
    return
  }
  if (form.name.trim().length < 2 || form.neighborhood.trim().length < 2 ||
      !supportedRequestCities.includes(form.city)) {
    status.value = 'Preencha nome, cidade e bairro válidos.'
    return
  }
  saving.value = true
  status.value = ''
  try {
    if (selectedId.value) {
      await updateAdminAcademy(session, selectedId.value, { ...form })
      status.value = 'Academia atualizada com sucesso.'
    } else {
      await createAdminAcademy(session, { ...form })
      status.value = 'Academia cadastrada com sucesso.'
    }
    cancelEdit()
    const message = status.value
    await refresh()
    status.value = message
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível salvar a academia.'
  } finally {
    saving.value = false
  }
}

async function deactivate(academy: Academy) {
  if (saving.value || !window.confirm(`Inativar a academia ${academy.name} — ${academy.neighborhood}?`)) return
  const session = token()
  if (!session) {
    status.value = 'Entre novamente como administrador.'
    return
  }
  saving.value = true
  try {
    await deactivateAdminAcademy(session, academy.academyId)
    await refresh()
    status.value = 'Academia inativada. O histórico foi preservado.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Não foi possível inativar a academia.'
  } finally {
    saving.value = false
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="admin-academies" aria-labelledby="admin-academies-title">
    <h2 id="admin-academies-title" class="request-form-title">
      <button class="title-back-button" type="button" aria-label="Voltar" @click="goHome">&lt;</button>
      Academias
    </h2>

    <div class="academy-actions">
      <button type="button" class="primary-button" @click="newAcademy">+ Nova academia</button>
      <button type="button" class="academy-refresh" :disabled="loading" @click="refresh">Atualizar lista</button>
    </div>

    <div class="academy-filters">
      <label class="field">
        <span class="field-label">Nome ou bairro</span>
        <input v-model="search" type="search" placeholder="Buscar academia" />
      </label>
      <label class="field">
        <span class="field-label">Cidade</span>
        <select v-model="cityFilter">
          <option value="">Todas as cidades</option>
          <option v-for="city in supportedRequestCities" :key="city" :value="city">{{ city }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Situação</span>
        <select v-model="activeFilter">
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </select>
      </label>
    </div>

    <p v-if="status" class="academy-status" role="status">{{ status }}</p>
    <p v-if="loading" class="academy-status" role="status">Carregando academias…</p>

    <div v-if="!loading && !editing" class="academy-list" aria-label="Academias cadastradas">
      <article v-for="academy in visible" :key="academy.academyId" class="academy-card">
        <div class="academy-card-info">
          <strong>{{ academy.name }}</strong>
          <span>{{ academy.neighborhood }} · {{ academy.city }}, {{ academy.state }}</span>
          <small>{{ academy.active ? 'Ativa' : 'Inativa' }}</small>
        </div>
        <div class="academy-card-actions">
          <button type="button" :disabled="saving" @click="editAcademy(academy)">Editar</button>
          <button v-if="academy.active" type="button" :disabled="saving" @click="deactivate(academy)">
            Inativar
          </button>
        </div>
      </article>
      <p v-if="!visible.length" class="academy-status">Nenhuma academia encontrada.</p>
    </div>

    <form v-if="editing" class="academy-form" @submit.prevent="save">
      <h3>{{ selectedId ? 'Editar academia' : 'Nova academia' }}</h3>
      <label class="field">
        <span class="field-label">Nome *</span>
        <input v-model.trim="form.name" required minlength="2" maxlength="80" autocomplete="organization" />
      </label>
      <label class="field">
        <span class="field-label">Cidade *</span>
        <select v-model="form.city" required>
          <option v-for="city in supportedRequestCities" :key="city" :value="city">{{ city }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Bairro *</span>
        <input v-model.trim="form.neighborhood" required minlength="2" maxlength="80" />
      </label>
      <label class="field">
        <span class="field-label">Endereço</span>
        <input v-model.trim="form.address" maxlength="160" placeholder="Rua e número (opcional)" />
      </label>
      <label class="field">
        <span class="field-label">CEP</span>
        <input v-model.trim="form.zipCode" inputmode="numeric" pattern="[0-9]{5}-?[0-9]{3}" maxlength="9" placeholder="00000-000 (opcional)" />
      </label>
      <label class="academy-active">
        <input v-model="form.active" type="checkbox" />
        Academia ativa e visível nas buscas
      </label>
      <div class="academy-form-actions">
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Salvar academia' }}
        </button>
        <button type="button" :disabled="saving" @click="cancelEdit">Cancelar</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.admin-academies { display: grid; gap: 18px; }
.academy-actions, .academy-form-actions, .academy-card-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.academy-actions button { flex: 1; }
.academy-refresh, .academy-card-actions button, .academy-form-actions button:not(.primary-button) {
  padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px;
  background: transparent; color: var(--ink); cursor: pointer;
}
.academy-filters { display: grid; gap: 10px; }
.academy-filters .field, .academy-form .field { min-width: 0; }
.academy-filters input, .academy-filters select, .academy-form input:not([type='checkbox']), .academy-form select {
  width: 100%; max-width: 100%; min-height: 46px;
}
.academy-list { display: grid; gap: 10px; }
.academy-card {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 14px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--card-bg, transparent);
}
.academy-card-info { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.academy-card-info span, .academy-card-info small { color: var(--muted); }
.academy-card-actions { justify-content: flex-end; }
.academy-status { margin: 0; color: var(--muted); }
.academy-form { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
.academy-form h3 { margin: 0; }
.academy-active { display: flex; gap: 8px; align-items: center; color: var(--ink); }
@media (max-width: 460px) {
  .academy-card { flex-direction: column; align-items: stretch; }
  .academy-card-actions { justify-content: flex-start; }
}
</style>
