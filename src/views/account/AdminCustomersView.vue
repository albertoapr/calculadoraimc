<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { listAdminCustomers, promoteAdminCustomer, updateAdminCustomer, type AdminCustomer, type AdminCustomerUpdate } from '../../services/adminCustomersService'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import BirthDatePicker from '../../components/BirthDatePicker.vue'

const { goHome } = useFitpesoContext()
const customers = ref<AdminCustomer[]>([])
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const search = ref('')
const activity = ref<'all' | 'active' | 'inactive'>('all')
const selected = ref<AdminCustomer | null>(null)
const editing = ref(false)
const form = reactive<AdminCustomerUpdate>({
  name: '', dateOfBirth: '', sex: '', active: true,
})
const limit = ref(10)

function token() {
  return sessionStorage.getItem('fitpeso-customer-session') ??
    sessionStorage.getItem('fitpeso-google-session') ?? ''
}
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  return customers.value.filter(customer =>
    (activity.value === 'all' ||
      (activity.value === 'active' ? customer.active : !customer.active)) &&
    (!term || [customer.name, customer.email, customer.whatsapp, customer.customerId]
      .some(value => value.toLocaleLowerCase('pt-BR').includes(term))),
  ).sort((a, b) => Number(b.active) - Number(a.active) ||
    a.name.localeCompare(b.name, 'pt-BR'))
})
const visible = computed(() => filtered.value.slice(0, limit.value))

async function refresh() {
  if (loading.value) return
  const session = token()
  if (!session) {
    message.value = 'Entre novamente como administrador.'
    return
  }
  loading.value = true
  message.value = ''
  try {
    customers.value = await listAdminCustomers(session)
    if (selected.value) {
      const current = customers.value.find(row => row.customerId === selected.value?.customerId)
      if (current) selected.value = current
      else closeEditor()
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Não foi possível consultar os clientes.'
  } finally {
    loading.value = false
  }
}
function openEditor(customer: AdminCustomer) {
  selected.value = customer
  Object.assign(form, {
    name: customer.name,
    dateOfBirth: customer.dateOfBirth,
    sex: customer.sex === 'masculino' || customer.sex === 'feminino' ? customer.sex : '',
    ...(customer.heightCm !== null ? { heightCm: customer.heightCm } : { heightCm: undefined }),
    active: customer.active,
  })
  editing.value = true
  message.value = ''
  requestAnimationFrame(() =>
    document.querySelector('#admin-customer-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  )
}
function closeEditor() {
  editing.value = false
  selected.value = null
  message.value = ''
}
async function save() {
  const current = selected.value
  if (!current || saving.value) return
  const session = token()
  if (!session) {
    message.value = 'Entre novamente como administrador.'
    return
  }
  saving.value = true
  message.value = ''
  try {
    const payload: AdminCustomerUpdate = {
      name: form.name.trim(), dateOfBirth: form.dateOfBirth,
      sex: form.sex, active: form.active,
      ...(form.heightCm !== undefined && form.heightCm !== null && form.heightCm !== 0
        ? { heightCm: Number(form.heightCm) } : {}),
    }
    await updateAdminCustomer(session, current.customerId, payload)
    const action = current.active === payload.active
      ? 'Cadastro atualizado com sucesso.'
      : payload.active ? 'Cliente reativado.' : 'Cliente desativado. O histórico foi preservado.'
    closeEditor()
    await refresh()
    message.value = action
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Não foi possível salvar o cliente.'
  } finally {
    saving.value = false
  }
}
async function grantAdmin() {
  const current = selected.value
  const session = token()
  if (!current || !session || !current.active || current.isAdmin || saving.value) return
  if (!window.confirm(`Conceder acesso administrativo a ${current.name || 'este cliente'}? Ele poderá gerenciar os cadastros e conceder acesso administrativo a outras pessoas.`)) return
  saving.value = true
  message.value = ''
  try {
    await promoteAdminCustomer(session, current.customerId)
    current.isAdmin = true
    await refresh()
    message.value = 'Perfil de administrador concedido. O usuário deve entrar novamente para atualizar seus perfis.'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Não foi possível conceder acesso administrativo.'
  } finally { saving.value = false }
}
function changeStatus(active: boolean) {
  if (!selected.value || selected.value.active === active) return
  const verb = active ? 'reativar' : 'desativar'
  if (window.confirm(`Deseja ${verb} o cadastro de ${selected.value.name || 'este cliente'}?`))
    form.active = active
}
onMounted(() => { void refresh() })
</script>

<template>
  <section class="admin-customers" aria-labelledby="admin-customers-title">
    <h2 id="admin-customers-title" class="request-form-title">
      <button type="button" class="title-back-button" aria-label="Voltar" @click="goHome">&lt;</button>
      Gerenciar clientes
    </h2>
    <div class="customer-tools">
      <label class="field">
        <span class="field-label">Buscar cliente</span>
        <input v-model="search" type="search" autocomplete="off" placeholder="Nome, WhatsApp ou e-mail"
          @input="limit = 10" />
      </label>
      <label class="field">
        <span class="field-label">Situação</span>
        <select v-model="activity" @change="limit = 10">
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </label>
      <button type="button" class="secondary-button refresh" :disabled="loading" @click="refresh">Atualizar lista</button>
    </div>
    <p v-if="message" class="status" role="status" aria-live="polite">{{ message }}</p>
    <div class="list-header">
      <h3>Clientes cadastrados</h3>
      <span v-if="!loading">{{ filtered.length }} encontrado(s)</span>
    </div>
    <p v-if="loading" class="empty" role="status">Carregando clientes…</p>
    <div v-else-if="visible.length" class="customer-list">
      <button v-for="customer in visible" :key="customer.customerId"
        type="button" class="customer-list-item"
        :class="{ selected: selected?.customerId === customer.customerId }"
        @click="openEditor(customer)">
        <span class="customer-main">
          <strong>{{ customer.name || 'Nome não informado' }} <span v-if="customer.isAdmin" class="admin-badge">Administrador</span></strong>
          <small>{{ customer.email || customer.whatsapp || 'Contato não informado' }}</small>
        </span>
        <span class="state" :class="customer.active ? 'active' : 'inactive'">
          {{ customer.active ? 'Ativo' : 'Inativo' }}
        </span>
      </button>
      <button v-if="filtered.length > visible.length" type="button" class="secondary-button load-more"
        @click="limit += 10">Carregar mais ({{ filtered.length - visible.length }} restantes)</button>
    </div>
    <p v-else class="empty">Nenhum cliente encontrado.</p>

    <form v-if="editing && selected" id="admin-customer-form" class="form contact-fields edit-form"
      @submit.prevent="save">
      <div class="edit-heading field-wide">
        <h3>Editar cliente</h3>
        <button type="button" class="secondary-button" @click="closeEditor">Fechar</button>
      </div>
      <label class="field field-wide">
        <span class="field-label">Nome completo</span>
        <input v-model="form.name" required maxlength="80" autocomplete="off" />
      </label>
      <label class="field">
        <span class="field-label">WhatsApp</span>
        <input :value="selected.whatsapp" readonly aria-readonly="true" placeholder="Não informado" />
        <small>{{ selected.whatsappVerified ? 'WhatsApp confirmado' : 'WhatsApp não confirmado' }}</small>
      </label>
      <label class="field">
        <span class="field-label">E-mail</span>
        <input :value="selected.email" type="email" readonly aria-readonly="true" placeholder="Não informado" />
      </label>
      <label class="field">
        <span class="field-label">Data de nascimento</span>
        <BirthDatePicker id="admin-customer-birth" v-model="form.dateOfBirth" name="customerBirth" />
      </label>
      <label class="field">
        <span class="field-label">Sexo</span>
        <select v-model="form.sex">
          <option value="">Não informado</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
        </select>
      </label>
      <label class="field field-wide">
        <span class="field-label">Altura (cm)</span>
        <input v-model.number="form.heightCm" type="number" step="0.1" min="80" max="250" placeholder="Não informada" />
      </label>
      <label class="field field-wide">
        <span class="field-label">Situação do cadastro</span>
        <select v-model="form.active">
          <option :value="true">Ativo</option>
          <option :value="false">Inativo</option>
        </select>
        <small>Inativar preserva os dados e não exclui as solicitações anteriores.</small>
      </label>
      <div class="field field-wide admin-role-panel">
        <strong>Perfil administrativo</strong>
        <small v-if="selected.isAdmin">Este usuário já possui acesso de administrador.</small>
        <template v-else>
          <small>Concede acesso administrativo sem remover os perfis existentes.</small>
          <button type="button" class="secondary-button" :disabled="saving || !selected.active" @click="grantAdmin">Tornar administrador</button>
          <small v-if="!selected.active">Reative o cadastro para conceder acesso.</small>
        </template>
      </div>
      <p class="field-wide help">WhatsApp e e-mail são identificações da pessoa e exigem verificação específica para alterações.</p>
      <div class="actions field-wide">
        <button type="submit" class="primary-button" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Salvar alterações' }}
        </button>
        <button type="button" class="secondary-button" @click="closeEditor">Cancelar</button>
        <button v-if="selected.active && form.active" type="button" class="secondary-button"
          @click="changeStatus(false)">Desativar</button>
        <button v-else-if="!selected.active && !form.active" type="button" class="secondary-button"
          @click="changeStatus(true)">Reativar</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.admin-customers { display:grid; gap:18px; min-width:0; }
.customer-tools { display:grid; grid-template-columns:minmax(0, 1fr) minmax(120px, 190px) auto; gap:12px; align-items:end; }
.customer-tools .field { min-width:0; }
.refresh { min-height:46px; }
.list-header, .edit-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.list-header h3, .edit-heading h3 { margin:0; }
.list-header span { color:var(--muted); font-size:13px; }
.customer-list { display:grid; gap:8px; }
.customer-list-item { width:100%; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px; border:1px solid var(--line); border-radius:10px; background:var(--card-bg, transparent); color:inherit; cursor:pointer; text-align:left; }
.customer-list-item.selected { border-color:var(--blue); }
.customer-main { min-width:0; display:grid; gap:4px; overflow-wrap:anywhere; }
.customer-main small { color:var(--muted); }
.state { font-size:12px; font-weight:700; padding:4px 9px; border-radius:99px; white-space:nowrap; }
.state.active { color:#17643d; background:#dff5e8; }
.state.inactive { color:#775626; background:#f4ead8; }
.empty { border:1px dashed var(--line); border-radius:10px; padding:16px; text-align:center; color:var(--muted); }
.edit-form { border-top:1px solid var(--line); padding-top:20px; scroll-margin-top:18px; }
.actions { display:flex; flex-wrap:wrap; gap:10px; }
.admin-role-panel { border:1px solid var(--line); border-radius:10px; padding:12px; }
.admin-badge { display:inline-block; font-size:11px; font-weight:600; padding:2px 6px; border:1px solid var(--line); border-radius:8px; }
.help { color:var(--muted); font-size:13px; }
.load-more { justify-self:center; }
html[data-theme='dark'] .customer-list-item { background:#1b2720; border-color:#3b4b40; }
html[data-theme='dark'] .customer-list-item.selected { border-color:#55d6a3; }
html[data-theme='dark'] .state.active { color:#86e9b7; background:#183b2a; }
html[data-theme='dark'] .state.inactive { color:#e9c98b; background:#45361e; }
@media (max-width:650px) { .customer-tools { grid-template-columns:1fr; } .customer-list-item { align-items:flex-start; } }
</style>
