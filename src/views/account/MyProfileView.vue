<script setup lang="ts">
import { computed, ref } from 'vue'
import { uploadAccountPhoto } from '../../services/accountProfileService'
import BirthDatePicker from '../../components/BirthDatePicker.vue'
import TrainerPageEditor from './TrainerPageEditor.vue'
import PhoneVerification from './PhoneVerification.vue'
import { storeToRefs } from 'pinia'
import { useAccountSession } from '../../stores/accountSession'
const { customerPhotoUrl } = storeToRefs(useAccountSession())
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  profileAcademyOptions,
  addProfileAcademy,
  removeProfileAcademy,
  academiesLoading,
  academiesError,
  profileAcademyChoice,
  editingProfile,
  editingProfileType,
  editingProfileStatus,
  editingProfileLoading,
  editingProfileSaving,
  saveMyProfile,
  openMyProfile,
  navigateTo,
  selectableProfiles,
} = useFitpesoContext()

const referralCode = computed(() => {
  const trainerId = editingProfile.trainerId
  return trainerId && /^[a-f0-9]{32}$/i.test(trainerId) ? 'FP' + trainerId.toUpperCase() : ''
})
const referralLink = computed(() =>
  referralCode.value
    ? `https://fitpeso.com.br/cadastro/personal?ref=${encodeURIComponent(referralCode.value)}`
    : '',
)
const uploadingPhoto = ref(false)
const photoStatus = ref('')
const photoFailed = ref(false)
async function changeProfilePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploadingPhoto.value) return
  photoStatus.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    photoStatus.value = 'Selecione JPG, PNG ou WebP de até 10 MB.'
    return
  }
  const type = editingProfileType.value
  const getToken = () => type === 'trainer'
    ? sessionStorage.getItem('fitpeso-trainer-session') ?? ''
    : sessionStorage.getItem('fitpeso-customer-session') ?? sessionStorage.getItem('fitpeso-google-session') ?? ''
  const token = getToken()
  if (!token) { photoStatus.value = 'Entre novamente para alterar a foto.'; return }
  uploadingPhoto.value = true
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a foto.')
    let imageBase64 = ''
    for (const size of [256, 224, 192, 160, 128]) {
      canvas.width = canvas.height = size
      const side = Math.min(bitmap.width, bitmap.height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const candidate = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? ''
        if (candidate && candidate.length <= 16384) { imageBase64 = candidate; break }
      }
      if (imageBase64) break
    }
    if (!imageBase64) throw new Error('Não foi possível reduzir o tamanho da foto.')
    const url = await uploadAccountPhoto(type, token, imageBase64)
    if (getToken() !== token || editingProfileType.value !== type) return
    customerPhotoUrl.value = url
    photoFailed.value = false
    photoStatus.value = 'Foto de perfil atualizada.'
  } catch (error) {
    photoStatus.value = error instanceof Error ? error.message : 'Não foi possível atualizar a foto.'
  } finally {
    bitmap?.close()
    uploadingPhoto.value = false
  }
}
const referralShareStatus = ref('')
async function shareTrainerReferral() {
  if (!referralLink.value) return
  const text = 'Conheça a FitPeso! Cadastre-se como personal trainer pelo meu convite.'
  referralShareStatus.value = ''
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Convite FitPeso', text, url: referralLink.value })
      referralShareStatus.value = 'Convite compartilhado.'
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(referralLink.value)
      referralShareStatus.value = 'Link de convite copiado.'
    } else {
      referralShareStatus.value = 'Copie o endereço acima para convidar seu colega.'
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError')
      referralShareStatus.value = 'Não foi possível compartilhar. Copie o link exibido.'
  }
}
</script>

<template>
  <section class="customer-signup" aria-labelledby="page-title">
    <p class="intro">Consulte e atualize as informações do seu cadastro.</p>
    <div v-if="editingProfileType === 'customer' && !selectableProfiles.some(profile => profile.tipo === 'PERSONAL')" class="profile-activation">
      <p>Também quer receber solicitações de treinamento? Ative um perfil profissional sem criar outra conta.</p>
      <button type="button" class="secondary-button" @click="navigateTo('/cadastro/personal')">Ativar perfil de personal trainer</button>
    </div>
    <p v-if="editingProfileLoading" class="status" role="status">Carregando seu cadastro…</p>
    <form v-else class="form contact-fields" @submit.prevent="saveMyProfile">
      <div class="google-profile-photo field-wide">
        <img v-if="customerPhotoUrl && !photoFailed" :src="customerPhotoUrl" alt="Sua foto de perfil" width="88" height="88" referrerpolicy="no-referrer" @error="photoFailed = true" />
        <div v-else class="profile-photo-placeholder" aria-hidden="true">{{ editingProfile.name.charAt(0).toUpperCase() || '?' }}</div>
        <div class="profile-photo-controls">
          <strong>Foto de perfil</strong>
          <small>A mesma foto é utilizada nos seus perfis.</small>
          <label for="profile-photo-file" class="secondary-button">{{ uploadingPhoto ? 'Enviando foto…' : 'Alterar foto' }}</label>
          <input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploadingPhoto || editingProfileSaving" @change="changeProfilePhoto" />
          <small v-if="photoStatus" role="status">{{ photoStatus }}</small>
        </div>
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
      <PhoneVerification v-if="editingProfileType === 'customer'"
        :whatsapp="editingProfile.whatsapp"
        :verified="editingProfile.whatsappVerified"
        @verified="openMyProfile" />
      <label v-else class="field field-wide" for="profile-whatsapp"
        ><span class="field-label">WhatsApp confirmado</span>
        <input id="profile-whatsapp" :value="editingProfile.whatsapp" type="tel"
          readonly aria-readonly="true" />
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

        />
      </label>
      <template v-if="editingProfileType === 'customer'"><label class="field field-wide" for="profile-sex"><span class="field-label">Sexo</span><select id="profile-sex" v-model="editingProfile.sex" required><option value="" disabled>Selecione o sexo</option><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select></label><label class="field field-wide" for="profile-height"><span class="field-label">Altura (cm)</span><input id="profile-height" v-model.number="editingProfile.heightCm" type="number" inputmode="decimal" min="80" max="250" step="0.1" placeholder="Ex.: 172" /><small>Sua altura é importante para calcular o IMC e outros indicadores da avaliação física.</small></label></template>

      <div v-if="editingProfileType === 'trainer' && referralCode" class="field field-wide trainer-referral-panel">
        <strong>Indique a FitPeso para outro personal</strong>
        <small>Seu código de indicação é {{ referralCode }}.</small>
        <label for="trainer-referral-link">Link de convite</label>
        <input id="trainer-referral-link" :value="referralLink" type="text" readonly aria-readonly="true" />
        <button type="button" class="secondary-button" @click="shareTrainerReferral">
          Compartilhar convite
        </button>
        <small v-if="referralShareStatus" role="status">{{ referralShareStatus }}</small>
      </div>
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
        <fieldset class="availability-group field-wide">
            <legend>Academias onde atende (até 5)</legend>
            <small v-if="academiesError" role="alert">{{ academiesError }}</small>
            <small v-else-if="!academiesLoading && !profileAcademyOptions.length">Nenhuma academia cadastrada na cidade do profissional.</small>
            <div class="public-academy-add">
              <select v-model="profileAcademyChoice" aria-label="Selecionar academia">
                <option value="">{{ academiesLoading ? 'Carregando academias…' : 'Selecione uma academia' }}</option>
                <option v-for="option in profileAcademyOptions" :key="option.id" :value="option.id" :disabled="editingProfile.academyIds.includes(option.id)">
                  {{ option.label }} ({{ option.city }})
                </option>
              </select>
              
              <button
                type="button"
                class="secondary-button"
                :disabled="
                  academiesLoading || !!academiesError || !profileAcademyOptions.some(option => option.id === profileAcademyChoice) ||
                  editingProfile.academias.length >= 5 ||
                  !profileAcademyChoice
                "
                @click="
                  () => {
                    addProfileAcademy(profileAcademyChoice)
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
                @click="removeProfileAcademy(index)"
              >
                Remover
              </button>
            </div>
            <small>{{ editingProfile.academias.length }}/5 academias</small>
        </fieldset>
        <label class="field field-wide" for="profile-slug">
          <span class="field-label">Endereço do perfil</span>
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
      <button class="primary-button field-wide" type="submit" :disabled="editingProfileSaving || uploadingPhoto">
        {{ editingProfileSaving ? 'Salvando…' : 'Salvar alterações' }}
      </button>
    </form>
    <p v-if="editingProfileStatus" class="status" role="status" aria-live="polite">
      {{ editingProfileStatus }}
    </p>
  </section>
</template>

<style scoped>
.trainer-referral-panel { display: grid; gap: 8px; }
.trainer-referral-panel small { color: var(--muted); }
.google-profile-photo { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.google-profile-photo img { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; border: 1px solid var(--line); }
.google-profile-photo div { display: flex; flex-direction: column; gap: 4px; }
.google-profile-photo small { color: var(--muted); }
.profile-photo-placeholder { width: 88px; height: 88px; border-radius: 50%; background: var(--line); align-items: center; justify-content: center; font-size: 30px; font-weight: 700; }
.profile-photo-controls { flex: 1; min-width: 0; }
.profile-photo-controls input { width: 100%; max-width: 100%; }
.profile-photo-controls label { cursor: pointer; text-align: center; }
.profile-activation { margin: 12px 0 20px; display: grid; gap: 8px; }
.profile-activation p { margin: 0; color: var(--muted); }
</style>
