<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  academyOptions,
  addAcademy,
  profileAcademyChoice,
  profileOtherAcademy,
  editingProfile,
  editingProfileType,
  editingProfileStatus,
  editingProfileLoading,
  editingProfileSaving,
  saveMyProfile,
} = useFitpesoContext()
</script>

<template>
  <section class="customer-signup" aria-labelledby="page-title">
    <p class="intro">Consulte e atualize as informações do seu cadastro.</p>
    <p v-if="editingProfileLoading" class="status" role="status">Carregando seu cadastro…</p>
    <form v-else class="form contact-fields" @submit.prevent="saveMyProfile">
      <label class="field field-wide" for="profile-name"
        ><span class="field-label">Nome completo</span>
        <input
          id="profile-name"
          v-model="editingProfile.name"
          type="text"
          autocomplete="name"
          minlength="2"
          maxlength="80"
          required
        />
      </label>
      <label class="field field-wide" for="profile-whatsapp"
        ><span class="field-label">WhatsApp confirmado</span>
        <input
          id="profile-whatsapp"
          :value="editingProfile.whatsapp"
          type="tel"
          readonly
          aria-readonly="true"
        />
      </label>
      <label class="field field-wide" for="profile-email"
        ><span class="field-label">E-mail</span>
        <input
          id="profile-email"
          :value="editingProfile.email"
          type="email"
          readonly
          aria-readonly="true"
        />
      </label>
      <label class="field field-wide" for="profile-dob"
        ><span class="field-label">Data de nascimento</span>
        <input
          id="profile-dob"
          v-model="editingProfile.dateOfBirth"
          type="date"
          autocomplete="bday"
          min="1900-01-01"
          :max="new Date().toISOString().slice(0, 10)"
          :required="editingProfileType === 'trainer'"
        />
      </label>
      <template v-if="editingProfileType === 'trainer'">
        <label class="field field-wide" for="profile-cref"
          ><span class="field-label">Registro CREF <span>opcional</span></span>
          <input
            id="profile-cref"
            v-model="editingProfile.cref"
            type="text"
            maxlength="20"
            autocapitalize="characters"
            placeholder="072573-G/RJ"
          />
        </label>
        <label class="field field-wide" for="profile-instagram"
          ><span class="field-label">Instagram <span>opcional</span></span>
          <input
            id="profile-instagram"
            v-model="editingProfile.instagram"
            type="text"
            maxlength="31"
            placeholder="@usuario"
          />
        </label>
        <label class="field field-wide" for="profile-slug"
          ><span class="field-label">Endereço do perfil</span>
          <fieldset class="availability-group field-wide">
            <legend>Academias onde atende (até 5)</legend>
            <div class="public-academy-add">
              <select v-model="profileAcademyChoice" aria-label="Selecionar academia">
                <option value="">Selecione uma academia</option>
                <option v-for="option in academyOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <input
                v-if="profileAcademyChoice === 'Outros'"
                v-model="profileOtherAcademy"
                type="text"
                maxlength="60"
                placeholder="Nome da academia"
                aria-label="Nome da academia"
              />
              <button
                type="button"
                class="secondary-button"
                :disabled="
                  editingProfile.academias.length >= 5 ||
                  !profileAcademyChoice ||
                  (profileAcademyChoice === 'Outros' && !profileOtherAcademy.trim())
                "
                @click="
                  () => {
                    addAcademy(editingProfile.academias, profileAcademyChoice, profileOtherAcademy)
                    profileAcademyChoice = ''
                    profileOtherAcademy = ''
                  }
                "
              >
                Adicionar
              </button>
            </div>
            <div
              v-for="(gym, index) in editingProfile.academias"
              :key="gym"
              class="public-academy-item"
            >
              <span>{{ gym }}</span><button
                type="button"
                :aria-label="'Remover ' + gym"
                @click="editingProfile.academias.splice(index, 1)"
              >
                Remover
              </button>
            </div>
            <small>{{ editingProfile.academias.length }}/5 academias</small>
          </fieldset>
          <input
            id="profile-slug"
            :value="editingProfile.slug"
            type="text"
            readonly
            aria-readonly="true"
          />
        </label>
      </template>
      <small class="field-wide"
        >Para alterar WhatsApp, e-mail ou endereço do perfil profissional, é necessária uma nova
        verificação com a Beta.</small
      >
      <button class="primary-button field-wide" type="submit" :disabled="editingProfileSaving">
        {{ editingProfileSaving ? 'Salvando…' : 'Salvar alterações' }}
      </button>
    </form>
    <p v-if="editingProfileStatus" class="status" role="status" aria-live="polite">
      {{ editingProfileStatus }}
    </p>
  </section>
</template>
