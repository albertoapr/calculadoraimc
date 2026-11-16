<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  availableCities,
  adminAcademies,
  adminTrainerForm,
  adminTrainerStatus,
  adminTrainerBusy,
  saveAdminTrainer,
  goHome,
} = useFitpesoContext()
</script>

<template>
  <section class="customer-signup" aria-labelledby="admin-trainer-title">
    <h2 id="admin-trainer-title" class="request-form-title">
      <button type="button" class="title-back-button" @click="goHome" aria-label="Voltar">
        &lt;
      </button>
      Cadastrar Personal Trainer
    </h2>
    <form class="form contact-fields" @submit.prevent="saveAdminTrainer">
      <label class="field field-wide"
        ><span class="field-label">Nome completo</span
        ><input v-model="adminTrainerForm.name" required maxlength="80"
      /></label>
      <label class="field"
        ><span class="field-label">WhatsApp</span
        ><input v-model="adminTrainerForm.whatsapp" required type="tel"
      /></label>
      <label class="field"
        ><span class="field-label">E-mail</span
        ><input v-model="adminTrainerForm.email" type="email"
      /></label>
      <label class="field"
        ><span class="field-label">Nascimento</span
        ><input v-model="adminTrainerForm.dateOfBirth" required type="date"
      /></label>
      <label class="field"
        ><span class="field-label">Gênero</span
        ><select v-model="adminTrainerForm.sex">
          <option value="feminino">Feminino</option>
          <option value="masculino">Masculino</option>
        </select></label
      >
      <label class="field"
        ><span class="field-label">CREF</span
        ><input v-model="adminTrainerForm.cref" required placeholder="000000-G/RJ"
      /></label>
      <label class="field"
        ><span class="field-label">Instagram</span
        ><input v-model="adminTrainerForm.instagram" required placeholder="@usuario"
      /></label>
      <label class="field"
        ><span class="field-label">Endereço do perfil (slug)</span
        ><input
          v-model="adminTrainerForm.slug"
          required
          pattern="[a-z0-9-]+"
          placeholder="nome-do-personal"
      /></label>
      <label class="field"
        ><span class="field-label">Cidade</span
        ><select v-model="adminTrainerForm.city">
          <option v-for="city in availableCities" :key="city" :value="city">{{ city }}</option>
        </select></label
      >
      <fieldset class="field field-wide admin-trainer-cities">
        <legend>Academias cadastradas</legend>
        <label
          v-for="academy in adminAcademies.filter(item =>
            item.active && item.city === adminTrainerForm.city)"
          :key="academy.academyId"
        >
          <input
            v-model="adminTrainerForm.academyIds"
            type="checkbox"
            :value="academy.academyId"
          />
          {{ academy.name }} — {{ academy.neighborhood }}
        </label>
      </fieldset>
      <label class="field field-wide"
        ><span class="field-label">Outros locais (legado, separados por vírgula)</span
        ><input v-model="adminTrainerForm.academias"
      /></label>
      <button type="submit" class="primary-button" :disabled="adminTrainerBusy">
        Salvar Personal
      </button>
      <p role="status">{{ adminTrainerStatus }}</p>
    </form>
  </section>
</template>
