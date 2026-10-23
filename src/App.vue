<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

declare const __IMC_API_URL__: string

type Sex = 'feminino' | 'masculino' | 'outro'

type ImcResult = {
  weight: number
  heightCm: number
  imc: number
}

type ImcSubmission = ImcResult & {
  clientName: string
  whatsapp: string
  city: string
  age: number
  sex: Sex
  consent: true
  requestId: string
}

const apiUrl = __IMC_API_URL__

const form = reactive({
  weight: '70',
  height: '170',
  contactConsent: false,
  name: '',
  sex: '' as Sex | '',
  age: '',
  whatsapp: '',
  city: '',
})

const result = ref<ImcResult | null>(null)
const evaluating = ref(false)
const evaluationProgress = ref(0)
const status = ref('')
const sending = ref(false)
const contactAge = computed(() => {
  if (!form.contactConsent || form.age === '') return undefined
  const age = Number(String(form.age))
  return Number.isInteger(age) ? age : undefined
})

function category(imc: number) {
  if (imc < 18.5) return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
  if (imc < 25) return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
  if (imc < 30) return ['Sobrepeso', 'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.']
  if (imc < 35) return ['Obesidade I', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
  if (imc < 40) return ['Obesidade II', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
  return ['Obesidade mórbida', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const bmiScale = [
  { label: 'Baixo peso', range: '<18,5', from: 12, to: 18.5, color: '#60a5fa' },
  { label: 'Saudável', range: '18,5–24,9', from: 18.5, to: 25, color: '#34d399' },
  { label: 'Sobrepeso', range: '25–29,9', from: 25, to: 30, color: '#fbbf24' },
  { label: 'Obesidade I', range: '30–34,9', from: 30, to: 35, color: '#fb923c' },
  { label: 'Obesidade II', range: '35–39,9', from: 35, to: 40, color: '#f87171' },
  { label: 'Obesidade mórbida', range: '≥40', from: 40, to: 50, color: '#be123c' },
]
const scalePosition = computed(() => result.value ? `${Math.max(0, Math.min(100, ((result.value.imc - 12) / 38) * 100))}%` : '0%')
const obesitySilhouettes = [
  { label: 'Sobrepeso', range: 'IMC 25–29,9', from: 25, to: 30, torso: 'M31 30 C25 32 23 42 25 54 C26 65 29 72 30 80 L50 80 C51 72 54 65 55 54 C57 42 55 32 49 30 Z', arms: 'M31 34 C25 39 24 49 23 61 L20 77 L26 79 L32 62 M49 34 C55 39 56 49 57 61 L60 77 L54 79 L48 62', legs: 'M31 77 L29 111 L26 132 L34 132 L40 98 L46 132 L54 132 L51 111 L49 77' },
  { label: 'Obesidade I', range: 'IMC 30–34,9', from: 30, to: 35, torso: 'M29 30 C22 33 21 42 23 54 C24 66 28 73 28 80 L52 80 C52 73 56 66 57 54 C59 42 58 33 51 30 Z', arms: 'M29 34 C22 39 21 50 20 62 L17 77 L24 80 L31 63 M51 34 C58 39 59 50 60 62 L63 77 L56 80 L49 63', legs: 'M29 77 L28 111 L25 132 L34 132 L40 99 L46 132 L55 132 L52 111 L51 77' },
  { label: 'Obesidade II', range: 'IMC 35–39,9', from: 35, to: 40, torso: 'M26 30 C18 33 17 42 19 54 C20 66 25 73 25 80 L55 80 C55 73 60 66 61 54 C63 42 62 33 54 30 Z', arms: 'M26 34 C19 39 17 50 16 62 L13 77 L21 81 L29 63 M54 34 C61 39 63 50 64 62 L67 77 L59 81 L51 63', legs: 'M27 77 L27 111 L24 132 L34 132 L40 100 L46 132 L56 132 L53 111 L53 77' },
  { label: 'Obesidade mórbida', range: 'IMC ≥ 40', from: 40, to: Number.POSITIVE_INFINITY, torso: 'M22 30 C13 33 12 42 14 54 C15 66 21 73 21 80 L59 80 C59 73 65 66 66 54 C68 42 67 33 58 30 Z', arms: 'M22 34 C14 39 12 50 11 62 L8 77 L18 82 L26 63 M58 34 C66 39 68 50 69 62 L72 77 L62 82 L54 63', legs: 'M24 77 L25 111 L22 132 L34 132 L40 101 L46 132 L58 132 L55 111 L56 77' },
]
const activeSilhouette = computed(() => result.value?.imc && result.value.imc >= 40 ? 3 : result.value?.imc && result.value.imc >= 35 ? 2 : result.value?.imc && result.value.imc >= 30 ? 1 : result.value?.imc && result.value.imc >= 25 ? 0 : -1)
const weightToLose = computed(() => {
  if (!result.value || (contactAge.value !== undefined && contactAge.value < 18)) return null
  const adultReferenceWeight = 24.9 * ((result.value.heightCm / 100) ** 2)
  return Number(Math.max(0, result.value.weight - adultReferenceWeight).toFixed(1))
})
const weightGoalMessage = computed(() => {
  if (!result.value) return ''
  if (contactAge.value !== undefined && contactAge.value < 18) {
    return 'Não calculamos meta de perda de peso para menores de 18 anos. A avaliação deve considerar idade e sexo em curvas de crescimento.'
  }
  if (result.value.imc < 18.5) {
    return 'Seu IMC está abaixo da faixa de referência adulta; não é indicado perder peso com base neste cálculo.'
  }
  if (result.value.imc < 25) return 'Pela faixa de referência para adultos, você não precisa perder peso.'
  return 'Estimativa para chegar ao limite superior da faixa de referência do IMC adulto (24,9).'
})
function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`
  return ''
}

function clearContactDetails() {
  form.contactConsent = false
  form.name = ''
  form.sex = ''
  form.age = ''
  form.whatsapp = ''
  form.city = ''
}

function handleContactConsentChange() {
  if (!form.contactConsent) {
    clearContactDetails()
    status.value = ''
  }
}

function adjustMeasurement(field: 'weight' | 'height', amount: number) {
  const minimum = field === 'weight' ? 20 : 80
  const maximum = 200
  const nextValue = Math.max(minimum, Math.min(maximum, Number(form[field]) + amount))
  form[field] = String(nextValue)
}

function calculateImc() {
  if (sending.value || evaluating.value) return
  status.value = ''

  clearContactDetails()

  const weight = Number(form.weight)
  const heightCm = Number(form.height)
  if (!Number.isInteger(weight) || weight < 20 || weight > 200 ||
      !Number.isInteger(heightCm) || heightCm < 80 || heightCm > 200) {
    status.value = 'Confira o peso e a altura informados.'
    return
  }

  const imc = Number((weight / ((heightCm / 100) ** 2)).toFixed(1))
  const nextResult = { weight, heightCm, imc }
  evaluating.value = true
  evaluationProgress.value = 0
  const startedAt = performance.now()
  const duration = 3000

  function animate(now: number) {
    evaluationProgress.value = Math.min(100, Math.round(((now - startedAt) / duration) * 100))
    if (evaluationProgress.value < 100) {
      requestAnimationFrame(animate)
    } else {
      result.value = nextResult
      evaluating.value = false
    }
  }

  requestAnimationFrame(animate)
}

function editMeasurement() {
  result.value = null
  clearContactDetails()
  status.value = ''
}

async function sendResult() {
  if (!result.value || !form.contactConsent || sending.value) return
  status.value = ''

  const clientName = form.name.trim().replace(/\s+/g, ' ')
  const city = form.city.trim().replace(/\s+/g, ' ')
  const whatsapp = normalizeWhatsapp(form.whatsapp)
  const age = Number(String(form.age))
  const validName = clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
  const validCity = city.length >= 2 && city.length <= 80 && /^[\p{L}\p{M}\p{N} .'-]+$/u.test(city)
  const validAge = Number.isInteger(age) && age >= 1 && age <= 120
  const validSex = ['feminino', 'masculino', 'outro'].includes(form.sex)

  if (!validName || !validCity || !whatsapp || !validAge || !validSex) {
    status.value = 'Confira nome, sexo, idade, WhatsApp com DDD e cidade.'
    return
  }

  if (!apiUrl) {
    status.value = 'A avaliação foi calculada, mas o envio ainda não está configurado nesta versão.'
    return
  }

  const payload: ImcSubmission = {
    clientName,
    whatsapp,
    city,
    age,
    sex: form.sex as Sex,
    weight: result.value.weight,
    heightCm: result.value.heightCm,
    imc: result.value.imc,
    consent: true,
    requestId: crypto.randomUUID(),
  }

  sending.value = true
  status.value = 'Enviando…'
  try {
    const apiBase = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`
    const response = await fetch(new URL('api/imc', apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('request failed')
    status.value = 'Dados enviados. O personal poderá entrar em contato pelo WhatsApp informado.'
    clearContactDetails()
  } catch {
    status.value = 'Não foi possível enviar os dados agora. Tente novamente.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="calculator" aria-labelledby="page-title">
      <header class="hero">
        <span class="brand"><span class="brand-mark">β</span> BETA</span>
        <h1 id="page-title">{{ result ? 'Resultado da avaliação' : 'Avalie seu peso' }}</h1>
        <p class="intro">{{ result ? 'Veja o resultado da sua avaliação.' : 'Descubra quanto falta pra chegar no peso saudável' }}</p>
      </header>

      <form v-if="!result" class="form" @submit.prevent="calculateImc">
        <label class="field slider-field" for="weight"><span class="slider-heading"><span class="field-label">Peso <span>kg</span></span><output for="weight">{{ Number(form.weight).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} kg</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir peso" :disabled="Number(form.weight) <= 20" @click="adjustMeasurement('weight', -1)">−</button>
            <input id="weight" v-model="form.weight" class="range-input" name="weight" type="range" min="20" max="200" step="1" aria-label="Peso em quilogramas">
            <button class="slider-adjust" type="button" aria-label="Aumentar peso" :disabled="Number(form.weight) >= 200" @click="adjustMeasurement('weight', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>20 kg</span><span>200 kg</span></span>
        </label>

        <label class="field slider-field" for="height"><span class="slider-heading"><span class="field-label">Altura <span>cm</span></span><output for="height">{{ Number(form.height).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} cm</output></span>
          <div class="slider-control-row">
            <button class="slider-adjust" type="button" aria-label="Diminuir altura" :disabled="Number(form.height) <= 80" @click="adjustMeasurement('height', -1)">−</button>
            <input id="height" v-model="form.height" class="range-input" name="height" type="range" min="80" max="200" step="1" aria-label="Altura em centímetros">
            <button class="slider-adjust" type="button" aria-label="Aumentar altura" :disabled="Number(form.height) >= 200" @click="adjustMeasurement('height', 1)">+</button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>80 cm</span><span>200 cm</span></span>
        </label>

        <button class="primary-button field-wide" type="submit" :disabled="sending">{{ sending ? 'Avaliando…' : 'Avaliar' }} <span aria-hidden="true">→</span></button>
      </form>

      <section v-else id="result" class="result-card" aria-live="polite">
        <div class="weight-goal">
          <p class="eyebrow">QUANTO PESO PERDER</p>
          <strong v-if="weightToLose !== null">{{ weightToLose.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong>
          <strong v-else>—</strong>
          <p>{{ weightGoalMessage }}</p>
        </div>

        <div class="bmi-scale-wrap" role="img" :aria-label="`Escala de IMC: ${result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}, classificação ${classification}`">
          <div class="scale-marker" :style="{ left: scalePosition }"><strong>{{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}</strong><span aria-hidden="true">▼</span></div>
          <div class="bmi-scale-bar"><span v-for="segment in bmiScale" :key="segment.label" :style="{ backgroundColor: segment.color, flexGrow: segment.to - segment.from }"></span></div>
          <div class="scale-labels"><span v-for="segment in bmiScale" :key="segment.label"><b>{{ segment.range }}</b>{{ segment.label }}</span></div>
        </div>

        <div class="silhouette-section" aria-label="Silhuetas de referência das faixas de sobrepeso e obesidade">
          <p class="eyebrow">FAIXAS DE PESO</p>
          <div class="silhouette-list">
            <div v-for="(person, index) in obesitySilhouettes" :key="person.label" class="silhouette-item" :class="{ active: activeSilhouette === index }" :aria-current="activeSilhouette === index ? 'true' : undefined">
              <svg viewBox="0 0 80 140" class="silhouette" aria-hidden="true"><circle cx="40" cy="17" r="10" /><path :d="person.arms" /><path :d="person.torso" /><path :d="person.legs" /></svg>
              <b>{{ person.label }}</b><span>{{ person.range }}</span>
            </div>
          </div>
        </div>

        <div class="result-heading">
          <div><p class="eyebrow">SEU RESULTADO</p><h2>{{ classification }}</h2></div>
        </div>
        <label class="contact-opt-in" for="contact-consent">
          <input id="contact-consent" v-model="form.contactConsent" name="contactConsent" type="checkbox" aria-controls="contact-fields" :aria-expanded="form.contactConsent" @change="handleContactConsentChange">
          <span>Quero receber contato do personal</span>
        </label>

        <form v-if="form.contactConsent" id="contact-fields" class="form contact-fields" @submit.prevent="sendResult">
          <label class="field field-wide" for="name"><span class="field-label">Nome</span>
            <input id="name" v-model="form.name" name="name" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Seu nome" required>
          </label>

          <label class="field" for="sex"><span class="field-label">Sexo</span>
            <select id="sex" v-model="form.sex" name="sex" required>
              <option disabled value="">Selecione</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro / prefiro não informar</option>
            </select>
          </label>

          <label class="field" for="age"><span class="field-label">Idade <span>anos</span></span>
            <input id="age" v-model="form.age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Ex.: 35" required>
          </label>

          <label class="field field-wide" for="whatsapp"><span class="field-label">WhatsApp</span>
            <input id="whatsapp" v-model="form.whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="(21) 99999-9999" required>
          </label>

          <label class="field field-wide" for="city"><span class="field-label">Cidade</span>
            <input id="city" v-model="form.city" name="city" type="text" autocomplete="address-level2" minlength="2" maxlength="80" placeholder="Ex.: Rio de Janeiro" required>
          </label>

          <button class="primary-button field-wide" type="submit" :disabled="sending">{{ sending ? 'Enviando…' : 'Enviar dados para o personal' }} <span aria-hidden="true">→</span></button>
        </form>

        <button class="back-button" type="button" @click="editMeasurement">Alterar peso e altura</button>
      </section>

      <div v-if="evaluating" class="evaluation-overlay" role="status" aria-live="polite" :aria-label="`Avaliando: ${evaluationProgress}%`">
        <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
          <strong>{{ evaluationProgress }}%</strong>
        </div>
      </div>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <p class="disclaimer">O IMC é uma referência para adultos e não substitui a avaliação de um profissional de saúde.</p>
    </section>
    <footer>Uma referência para você cuidar melhor de si.</footer>
  </main>
</template>
