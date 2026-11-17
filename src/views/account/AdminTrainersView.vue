<script setup lang="ts">
import BirthDatePicker from '../../components/BirthDatePicker.vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'

const {
  availableCities,
  availableAcademiesForTrainer,
  adminTrainerSearch,
  adminTrainerActivityFilter,
  selectedAdminTrainerId,
  adminTrainerFormVisible,
  adminTrainersStatus,
  adminTrainersLoading,
  adminTrainerBusy,
  adminTrainerForm,
  filteredAdminTrainers,
  selectAdminTrainer,
  startNewAdminTrainer,
  cancelAdminTrainerEdit,
  saveAdminTrainer,
  deactivateAdminTrainer,
  goHome,
} = useFitpesoContext()
</script>

<template>
  <section class="admin-trainers-view" aria-labelledby="admin-trainers-title">
    <h2 id="admin-trainers-title" class="request-form-title">
      <button type="button" class="title-back-button" @click="goHome" aria-label="Voltar">
        &lt;
      </button>
      Gerenciar profissionais
    </h2>

    <div class="admin-trainer-toolbar">
      <label class="field admin-trainer-search">
        <span class="field-label">Buscar profissional</span>
        <input
          v-model="adminTrainerSearch"
          type="search"
          autocomplete="off"
          placeholder="Nome, CREF, WhatsApp, e-mail ou cidade"
        />
      </label>
      <label class="field admin-trainer-filter">
        <span class="field-label">Situação</span>
        <select v-model="adminTrainerActivityFilter">
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </label>
      <button type="button" class="primary-button admin-trainer-new" @click="startNewAdminTrainer">
        Novo profissional
      </button>
    </div>

    <p v-if="adminTrainersStatus" class="status" role="status" aria-live="polite">
      {{ adminTrainersStatus }}
    </p>

    <div class="admin-trainer-list-heading">
      <h3>Profissionais cadastrados</h3>
      <span v-if="!adminTrainersLoading">{{ filteredAdminTrainers.length }} encontrado(s)</span>
    </div>
    <div v-if="adminTrainersLoading" class="admin-trainer-loading" role="status">
      Carregando profissionais…
    </div>
    <div
      v-else-if="filteredAdminTrainers.length"
      class="admin-trainer-list"
      aria-label="Profissionais cadastrados"
    >
      <button
        v-for="trainer in filteredAdminTrainers"
        :key="trainer.trainerId"
        type="button"
        class="admin-trainer-list-item"
        :class="{ selected: selectedAdminTrainerId === trainer.trainerId }"
        :aria-current="selectedAdminTrainerId === trainer.trainerId ? 'true' : undefined"
        @click="selectAdminTrainer(trainer)"
      >
        <span class="admin-trainer-list-main">
          <strong>{{ trainer.name }}</strong>
          <small>{{ trainer.cref }} · {{ trainer.cities.join(', ') }}</small>
        </span>
        <span
          class="admin-trainer-state"
          :class="trainer.active ? 'is-active' : 'is-inactive'"
        >
          {{ trainer.active ? 'Ativo' : 'Inativo' }}
        </span>
      </button>
    </div>
    <p v-else-if="!adminTrainersLoading" class="admin-trainer-empty">
      Nenhum profissional corresponde à busca.
    </p>

    <form
      v-if="adminTrainerFormVisible"
      id="admin-trainer-form"
      class="form contact-fields admin-trainer-form"
      @submit.prevent="saveAdminTrainer"
    >
      <div class="admin-trainer-form-heading field-wide">
        <div>
          <span class="admin-trainer-form-eyebrow">
            {{ selectedAdminTrainerId ? 'Edição' : 'Novo cadastro' }}
          </span>
          <h3>{{ selectedAdminTrainerId ? 'Editar profissional' : 'Cadastrar profissional' }}</h3>
        </div>
        <button type="button" class="admin-trainer-close" @click="cancelAdminTrainerEdit">
          Fechar
        </button>
      </div>

      <label class="field field-wide">
        <span class="field-label">Nome completo</span>
        <input
          v-model="adminTrainerForm.name"
          required
          maxlength="80"
          autocomplete="name"
        />
      </label>
      <label class="field">
        <span class="field-label">WhatsApp</span>
        <input
          v-model="adminTrainerForm.whatsapp"
          required
          type="tel"
          autocomplete="tel"
          inputmode="tel"
          maxlength="20"
          placeholder="(21) 99999-9999"
        />
      </label>
      <label class="field">
        <span class="field-label">E-mail</span>
        <input
          v-model="adminTrainerForm.email"
          type="email"
          autocomplete="email"
          maxlength="254"
          placeholder="nome@exemplo.com"
        />
      </label>
      <label class="field">
        <span class="field-label">Data de nascimento</span>
        <BirthDatePicker
          id="admin-trainer-birth-date"
          v-model="adminTrainerForm.dateOfBirth"
          name="adminTrainerBirthDate"
          required
        />
      </label>
      <label class="field">
        <span class="field-label">Gênero</span>
        <select v-model="adminTrainerForm.sex" required>
          <option value="feminino">Feminino</option>
          <option value="masculino">Masculino</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">CREF</span>
        <input
          v-model="adminTrainerForm.cref"
          required
          maxlength="40"
          placeholder="000000-G/RJ"
        />
      </label>
      <label class="field">
        <span class="field-label">Instagram</span>
        <input
          v-model="adminTrainerForm.instagram"
          required
          maxlength="31"
          placeholder="@usuario"
        />
      </label>
      <label class="field field-wide">
        <span class="field-label">Endereço do perfil</span>
        <input
          v-model="adminTrainerForm.slug"
          required
          maxlength="40"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="nome-do-profissional"
        />
      </label>

      <fieldset class="field field-wide admin-trainer-options">
        <legend>Cidades atendidas <small>(selecione até duas)</small></legend>
        <label v-for="city in availableCities" :key="city">
          <input
            v-model="adminTrainerForm.cities"
            type="checkbox"
            :value="city"
            :disabled="
              adminTrainerForm.cities.length >= 2 && !adminTrainerForm.cities.includes(city)
            "
          />
          {{ city }}
        </label>
      </fieldset>

      <fieldset class="field field-wide admin-trainer-options">
        <legend>Academias cadastradas</legend>
        <label v-for="academy in availableAcademiesForTrainer" :key="academy.academyId">
          <input
            v-model="adminTrainerForm.academyIds"
            type="checkbox"
            :value="academy.academyId"
          />
          {{ academy.name }} — {{ academy.neighborhood }} ({{ academy.city }})
        </label>
        <small v-if="!availableAcademiesForTrainer.length">
          Selecione uma cidade com academias ativas ou cadastre uma academia.
        </small>
      </fieldset>

      <label class="field field-wide">
        <span class="field-label">Outros locais <span>opcional, separados por vírgula</span></span>
        <input
          v-model="adminTrainerForm.academias"
          placeholder="Condomínio, praça ou outra academia"
        />
      </label>

      <label v-if="selectedAdminTrainerId" class="admin-trainer-active field-wide">
        <input v-model="adminTrainerForm.active" type="checkbox" />
        Profissional ativo e visível nas buscas
      </label>

      <div class="admin-trainer-form-actions field-wide">
        <button type="submit" class="primary-button" :disabled="adminTrainerBusy">
          {{
            adminTrainerBusy
              ? 'Salvando…'
              : selectedAdminTrainerId
                ? 'Salvar alterações'
                : 'Cadastrar profissional'
          }}
        </button>
        <button type="button" class="secondary-button" @click="cancelAdminTrainerEdit">
          Cancelar
        </button>
        <button
          v-if="selectedAdminTrainerId && adminTrainerForm.active"
          type="button"
          class="admin-trainer-deactivate"
          :disabled="adminTrainerBusy"
          @click="deactivateAdminTrainer"
        >
          Desativar profissional
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.admin-trainers-view {
  display: grid;
  gap: 18px;
  min-width: 0;
}
.admin-trainer-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 180px) auto;
  align-items: end;
  gap: 12px;
  min-width: 0;
}
.admin-trainer-new {
  min-height: 48px;
  white-space: nowrap;
}
.admin-trainer-list-heading,
.admin-trainer-form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.admin-trainer-list-heading h3,
.admin-trainer-form-heading h3 {
  margin: 0;
}
.admin-trainer-list-heading span {
  color: var(--muted);
  font-size: 13px;
}
.admin-trainer-list {
  display: grid;
  gap: 8px;
}
.admin-trainer-list-item {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: inherit;
  background: var(--card-bg, transparent);
  text-align: left;
  cursor: pointer;
}
.admin-trainer-list-item.selected {
  border-color: var(--blue);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue) 16%, transparent);
}
.admin-trainer-list-main {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.admin-trainer-list-main strong,
.admin-trainer-list-main small {
  overflow: hidden;
  text-overflow: ellipsis;
}
.admin-trainer-list-main small {
  color: var(--muted);
}
.admin-trainer-state {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}
.admin-trainer-state.is-active {
  color: #17643d;
  background: #dff5e8;
}
.admin-trainer-state.is-inactive {
  color: #775626;
  background: #f4ead8;
}
.admin-trainer-loading,
.admin-trainer-empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--muted);
  text-align: center;
}
.admin-trainer-form {
  min-width: 0;
  margin-top: 4px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  scroll-margin-top: 16px;
}
.admin-trainer-form-eyebrow {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.admin-trainer-close {
  border: 0;
  color: var(--muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.admin-trainer-options {
  display: flex;
  flex-flow: row wrap;
  gap: 9px 14px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.admin-trainer-options legend {
  padding: 0 5px;
  font-weight: 800;
}
.admin-trainer-options label,
.admin-trainer-active {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.admin-trainer-options input,
.admin-trainer-active input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--blue);
}
.admin-trainer-options > small {
  width: 100%;
  color: var(--muted);
}
.admin-trainer-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.admin-trainer-form-actions button {
  min-height: 44px;
}
.admin-trainer-deactivate {
  margin-left: auto;
  padding: 10px 14px;
  border: 1px solid #b84a4a;
  border-radius: 9px;
  color: #a23232;
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.admin-trainer-deactivate:disabled {
  opacity: 0.55;
  cursor: wait;
}
html[data-theme='dark'] .admin-trainer-list-item {
  background: #1b2720;
  border-color: #3b4b40;
}
html[data-theme='dark'] .admin-trainer-list-item.selected {
  border-color: #55d6a3;
}
html[data-theme='dark'] .admin-trainer-state.is-active {
  color: #86e9b7;
  background: #183b2a;
}
html[data-theme='dark'] .admin-trainer-state.is-inactive {
  color: #e9c98b;
  background: #45361e;
}
html[data-theme='dark'] .admin-trainer-deactivate {
  color: #ffaaaa;
  border-color: #b85f5f;
}
@media (max-width: 680px) {
  .admin-trainer-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(110px, 0.55fr);
  }
  .admin-trainer-new {
    grid-column: 1 / -1;
  }
}
@media (max-width: 520px) {
  .admin-trainer-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
  .admin-trainer-new {
    grid-column: auto;
  }
  .admin-trainer-form-actions {
    display: grid;
  }
  .admin-trainer-deactivate {
    margin-left: 0;
  }
}
</style>
