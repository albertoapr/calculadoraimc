<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  availableCities,
  adminTrainerSearch,
  selectedAdminTrainerId,
  adminTrainersStatus,
  adminTrainersLoading,
  adminTrainerEditBusy,
  adminTrainerEditForm,
  filteredAdminTrainers,
  selectAdminTrainer,
  saveAdminTrainerEdit,
  goHome,
} = useFitpesoContext()
</script>

<template>
  <section class="admin-trainers-view" aria-labelledby="admin-trainers-title">
    <h2 id="admin-trainers-title" class="request-form-title">
      <button type="button" class="title-back-button" @click="goHome" aria-label="Voltar">
        &lt;
      </button>
      Editar profissionais
    </h2>
    <label class="field field-wide"
      ><span class="field-label">Buscar por nome, CREF ou WhatsApp</span
      ><input
        v-model="adminTrainerSearch"
        type="search"
        autocomplete="off"
        placeholder="Digite para buscar"
    /></label>
    <p v-if="adminTrainersStatus" class="status" role="status">{{ adminTrainersStatus }}</p>
    <div
      v-if="!adminTrainersLoading"
      class="admin-trainer-list"
      aria-label="Profissionais cadastrados"
    >
      <button
        v-for="trainer in filteredAdminTrainers"
        :key="trainer.trainerId"
        type="button"
        class="admin-trainer-list-item"
        :class="{ selected: selectedAdminTrainerId === trainer.trainerId }"
        @click="selectAdminTrainer(trainer)"
      >
        <strong>{{ trainer.name }}</strong>
        <span>{{ trainer.cref }} · {{ trainer.cities.join(', ') }}</span>
        <small>{{ trainer.active ? 'Ativo' : 'Inativo' }}</small>
      </button>
    </div>
    <p
      v-if="!adminTrainersLoading && adminTrainerSearch && !filteredAdminTrainers.length"
      class="status"
    >
      Nenhum profissional encontrado.
    </p>

    <form
      v-if="selectedAdminTrainerId"
      id="admin-trainer-edit-form"
      class="form contact-fields admin-trainer-edit-form"
      @submit.prevent="saveAdminTrainerEdit"
    >
      <h3 class="field-wide">Dados do profissional</h3>
      <label class="field field-wide"
        ><span class="field-label">Nome completo</span
        ><input v-model="adminTrainerEditForm.name" required maxlength="80"
      /></label>
      <label class="field"
        ><span class="field-label">WhatsApp</span
        ><input v-model="adminTrainerEditForm.whatsapp" required type="tel"
      /></label>
      <label class="field"
        ><span class="field-label">E-mail</span
        ><input v-model="adminTrainerEditForm.email" type="email"
      /></label>
      <label class="field"
        ><span class="field-label">Nascimento</span
        ><input v-model="adminTrainerEditForm.dateOfBirth" required type="date"
      /></label>
      <label class="field"
        ><span class="field-label">Gênero</span
        ><select v-model="adminTrainerEditForm.sex">
          <option value="feminino">Feminino</option>
          <option value="masculino">Masculino</option>
        </select></label
      >
      <label class="field"
        ><span class="field-label">CREF</span
        ><input v-model="adminTrainerEditForm.cref" required placeholder="000000-G/RJ"
      /></label>
      <label class="field"
        ><span class="field-label">Instagram</span
        ><input v-model="adminTrainerEditForm.instagram" required placeholder="@usuario"
      /></label>
      <label class="field"
        ><span class="field-label">Endereço do perfil</span
        ><input v-model="adminTrainerEditForm.slug" required pattern="[a-z0-9-]+"
      /></label>
      <fieldset class="field field-wide admin-trainer-cities">
        <legend>Cidades atendidas</legend>
        <label v-for="city in availableCities" :key="city"
          ><input v-model="adminTrainerEditForm.cities" type="checkbox" :value="city" />
          {{ city }}</label
        >
      </fieldset>
      <label class="field field-wide"
        ><span class="field-label">Academias (separadas por vírgula)</span
        ><input v-model="adminTrainerEditForm.academias"
      /></label>
      <label class="admin-trainer-active field-wide"
        ><input v-model="adminTrainerEditForm.active" type="checkbox" /> Profissional ativo e
        visível nas buscas</label
      >
      <button class="primary-button field-wide" type="submit" :disabled="adminTrainerEditBusy">
        {{ adminTrainerEditBusy ? 'Salvando…' : 'Salvar alterações' }}
      </button>
    </form>
  </section>
</template>
