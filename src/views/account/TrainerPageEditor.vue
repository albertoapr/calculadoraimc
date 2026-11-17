<script setup lang="ts">
import { ref, watch } from 'vue'
import { useFitpesoContext } from '../../composables/fitpesoContext'
import { uploadTrainerBanner } from '../../services/accountProfileService'
import { getPublicTrainerBanner } from '../../services/profissionaisService'

const { editingProfile } = useFitpesoContext()
const uploading = ref(false)
const uploadError = ref('')
const preview = ref('')
let previewGeneration = 0

watch(
  () => [editingProfile.trainerId, editingProfile.bannerUpdatedAt] as const,
  async ([trainerId, bannerUpdatedAt]) => {
    const current = ++previewGeneration
    preview.value = ''
    if (!trainerId || !bannerUpdatedAt) return
    try {
      const photo = await getPublicTrainerBanner(trainerId)
      if (current === previewGeneration) preview.value = photo
    } catch {
      // The text profile remains editable even when the banner is unavailable.
    }
  },
  { immediate: true },
)

async function handleBannerFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    uploadError.value = 'Selecione JPG, PNG ou WebP de até 10 MB.'
    return
  }
  uploading.value = true
  try {
    const token = sessionStorage.getItem('fitpeso-trainer-session') ?? ''
    if (!token) throw new Error('Entre como personal para enviar a foto.')
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = 1069
    canvas.height = 594
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a imagem.')
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    bitmap.close()
    let dataUrl = ''
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      dataUrl = canvas.toDataURL('image/jpeg', quality)
      if ((dataUrl.length - 23) * 0.75 <= 980_000) break
    }
    const imageBase64 = dataUrl.split(',')[1] ?? ''
    if (!imageBase64 || imageBase64.length * 0.75 > 1_000_000)
      throw new Error('A imagem ficou muito grande após o ajuste. Escolha outra foto.')
    const bannerUpdatedAt = await uploadTrainerBanner(token, imageBase64)
    previewGeneration += 1
    editingProfile.bannerUpdatedAt = bannerUpdatedAt
    preview.value = dataUrl
    uploadError.value = ''
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : 'Falha no envio da foto.'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <fieldset class="trainer-page-editor field-wide">
    <legend>Personalize sua página profissional</legend>
    <label class="field field-wide" for="personal-tagline">
      <span class="field-label">Frase de apresentação</span>
      <input id="personal-tagline" v-model="editingProfile.tagline" type="text" maxlength="140"
        placeholder="Ex.: Seu progresso começa com o primeiro passo" />
      <small>Será exibida abaixo do título Nome Personal Trainer.</small>
    </label>

    <div class="field field-wide">
      <span class="field-label">Foto de capa (banner)</span>
      <div v-if="preview" class="trainer-banner-preview">
        <img :src="preview" alt="Prévia da foto de capa profissional" width="1069" height="594" />
      </div>
      <label class="trainer-banner-upload" for="personal-banner-upload">
        {{ uploading ? 'Enviando foto…' : preview ? 'Trocar foto' : 'Selecionar foto' }}
      </label>
      <input id="personal-banner-upload" type="file" accept="image/jpeg,image/png,image/webp"
        :disabled="uploading" @change="handleBannerFile" />
      <small>JPG, PNG ou WebP até 10 MB. A imagem será ajustada para 1069 × 594 pixels e salva separadamente.</small>
      <p v-if="uploadError" class="status" role="alert">{{ uploadError }}</p>
    </div>

    <label v-for="section in [
      { key: 'aboutMe', title: 'Sobre mim', placeholder: 'Conte sua trajetória e seus objetivos como profissional' },
      { key: 'education', title: 'Formação', placeholder: 'Graduação, especializações e certificações' },
      { key: 'workingMethod', title: 'Forma de trabalho', placeholder: 'Explique como são os treinos e o acompanhamento' },
      { key: 'pricing', title: 'Valores', placeholder: 'Explique como funcionam seus pacotes e propostas' },
    ] as const" :key="section.key" class="field field-wide">
      <span class="field-label">{{ section.title }}</span>
      <textarea v-model="editingProfile[section.key]" :placeholder="section.placeholder"
        maxlength="2000" rows="4" />
    </label>
    <small>Para publicar os textos acima, clique em “Salvar alterações” no fim do cadastro.</small>
  </fieldset>
</template>

<style scoped>
.trainer-page-editor { display: grid; gap: 14px; min-width: 0; width: 100%; padding: 16px; border: 1px solid var(--line); border-radius: 10px; }
.trainer-page-editor legend { padding: 0 8px; font-weight: 700; }
.trainer-banner-preview { width: 100%; aspect-ratio: 1069 / 594; border-radius: 8px; overflow: hidden; margin: 8px 0; }
.trainer-banner-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.trainer-banner-upload { display: inline-block; cursor: pointer; margin-top: 8px; font-weight: 700; }
.trainer-page-editor textarea { min-height: 88px; resize: vertical; width: 100%; }
</style>
