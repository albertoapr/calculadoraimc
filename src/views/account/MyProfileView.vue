<script setup lang="ts">
import BirthDatePicker from '../../components/BirthDatePicker.vue'
import TrainerPageEditor from './TrainerPageEditor.vue'
import { storeToRefs } from 'pinia'
import { useAccountSession } from '../../stores/accountSession'
const { customerPhotoUrl } = storeToRefs(useAccountSession())
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
      <div v-if="editingProfileType === 'customer' && customerPhotoUrl" class="google-profile-photo field-wide">
        <img :src="customerPhotoUrl" alt="Sua foto do Google" width="88" height="88" referrerpolicy="no-referrer" />
        <div><strong>Foto do perfil Google</strong><small>Imagem vinculada à sua conta Google.</small><a :href="customerPhotoUrl" target="_blank" rel="noopener noreferrer">Abrir foto</a></div>
      </div>
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
        <BirthDatePicker
          id="profile-dob"
          v-model="editingProfile.dateOfBirth"
          name="profileBirthDate"
          :required="editingProfileType === 'trainer'"
        />
      </label>
      <template v-if="editingProfileType === 'customer'"><label class="field field-wide" for="profile-sex"><span class="field-label">Sexo</span><select id="profile-sex" v-model="editingProfile.sex" required><option value="" disabled>Selecione o sexo</option><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select></label><label class="field field-wide" for="profile-height"><span class="field-label">Altura (cm)</span><input id="profile-height" v-model.number="editingProfile.heightCm" type="number" inputmode="decimal" min="80" max="250" step="0.1" placeholder="Ex.: 172" /><small>Sua altura é importante para calcular o IMC e outros indicadores da avaliação física.</small></label></template>

      <TrainerPageEditor v-if="editingProfileType === 'trainer'" />
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
            :value="`https://fitpeso.com.br/personal/${editingProfile.slug}`"
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

<style scoped>
.google-profile-photo { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.google-profile-photo img { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; border: 1px solid var(--line); }
.google-profile-photo div { display: flex; flex-direction: column; gap: 4px; }
.google-profile-photo small { color: var(--muted); }
.google-profile-photo a { color: var(--blue); font-size: 0.9rem; }
</style>
