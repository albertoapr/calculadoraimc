<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

declare const __IMC_API_URL__: string

type Sex = 'feminino' | 'masculino' | 'outro'

type ImcResult = {
  weight: number
  heightCm: number
  imc: number
  age?: number
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
  weight: '',
  height: '',
  contactConsent: false,
  name: '',
  sex: '' as Sex | '',
  age: '',
  whatsapp: '',
  city: '',
})

const result = ref<ImcResult | null>(null)
const status = ref('')
const sending = ref(false)
const submitLabel = computed(() => {
  if (sending.value) return 'Enviando…'
  return form.contactConsent ? 'Calcular IMC e enviar dados' : 'Calcular IMC'
})

function category(imc: number) {
  if (imc < 18.5) return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
  if (imc < 25) return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
  if (imc < 30) return ['Sobrepeso', 'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.']
  return ['Obesidade', 'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.']
}

const classification = computed(() => result.value ? category(result.value.imc)[0] : '')
const weightToLose = computed(() => {
  if (!result.value || (result.value.age !== undefined && result.value.age < 18)) return null
  const adultReferenceWeight = 24.9 * ((result.value.heightCm / 100) ** 2)
  return Number(Math.max(0, result.value.weight - adultReferenceWeight).toFixed(1))
})
const weightGoalMessage = computed(() => {
  if (!result.value) return ''
  if (result.value.age !== undefined && result.value.age < 18) {
    return 'Não calculamos meta de perda de peso para menores de 18 anos. A avaliação deve considerar idade e sexo em curvas de crescimento.'
  }
  if (result.value.imc < 18.5) {
    return 'Seu IMC está abaixo da faixa de referência adulta; não é indicado perder peso com base neste cálculo.'
  }
  if (result.value.imc < 25) return 'Pela faixa de referência para adultos, você não precisa perder peso.'
  return 'Estimativa para chegar ao limite superior da faixa de referência do IMC adulto (24,9).'
})
const resultMessage = computed(() => {
  if (!result.value) return ''
  if (result.value.age === undefined || result.value.age < 18) {
    return 'Esta classificação é apenas uma referência para adultos. Para menores de 18 anos, a interpretação depende da idade e do sexo; procure um profissional de saúde.'
  }
  return category(result.value.imc)[1]
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

async function submitForm() {
  if (sending.value) return
  status.value = ''

  const weight = Number(String(form.weight).replace(',', '.'))
  const heightCm = Number(String(form.height).replace(',', '.'))
  if (!Number.isFinite(weight) || weight < 20 || weight > 400 ||
      !Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250) {
    status.value = 'Confira o peso e a altura informados.'
    return
  }

  let submission: ImcSubmission | null = null
  let age: number | undefined

  if (form.contactConsent) {
    const clientName = form.name.trim().replace(/\s+/g, ' ')
    const city = form.city.trim().replace(/\s+/g, ' ')
    const whatsapp = normalizeWhatsapp(form.whatsapp)
    age = Number(String(form.age))
    const validName = clientName.length >= 2 && clientName.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(clientName)
    const validCity = city.length >= 2 && city.length <= 80 && /^[\p{L}\p{M}\p{N} .'-]+$/u.test(city)
    const validAge = Number.isInteger(age) && age >= 1 && age <= 120
    const validSex = ['feminino', 'masculino', 'outro'].includes(form.sex)

    if (!validName || !validCity || !whatsapp || !validAge || !validSex) {
      status.value = 'Confira nome, sexo, idade, WhatsApp com DDD e cidade.'
      return
    }

    submission = {
      clientName,
      whatsapp,
      city,
      age,
      sex: form.sex as Sex,
      weight,
      heightCm,
      imc: Number((weight / ((heightCm / 100) ** 2)).toFixed(1)),
      consent: true,
      requestId: crypto.randomUUID(),
    }
  }

  const imc = Number((weight / ((heightCm / 100) ** 2)).toFixed(1))
  result.value = { weight, heightCm, imc, ...(age === undefined ? {} : { age }) }
  document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  if (submission) await sendResult(submission)
}

async function sendResult(payload: ImcSubmission) {
  if (!apiUrl) {
    status.value = 'IMC calculado, mas o envio ainda não está configurado nesta versão.'
    return
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
    status.value = 'IMC calculado. Dados enviados; o personal poderá entrar em contato pelo WhatsApp informado.'
    clearContactDetails()
  } catch {
    status.value = 'IMC calculado, mas não foi possível enviar os dados agora. Tente novamente.'
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
        <p class="eyebrow">CUIDADO QUE COMEÇA COM INFORMAÇÃO</p>
        <h1 id="page-title">Quantos quilos devo perder?</h1>
        <p class="intro">Informe seu peso e sua altura para calcular uma estimativa.</p>
      </header>

      <form class="form" @submit.prevent="submitForm">
        <label class="field" for="weight"><span class="field-label">Peso <span>kg</span></span>
          <input id="weight" v-model="form.weight" name="weight" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="Ex.: 78,5" required>
        </label>

        <label class="field" for="height"><span class="field-label">Altura <span>cm</span></span>
          <input id="height" v-model="form.height" name="height" type="number" inputmode="decimal" min="80" max="250" step="0.1" placeholder="Ex.: 175" required>
        </label>

        <label class="contact-opt-in field-wide" for="contact-consent">
          <input id="contact-consent" v-model="form.contactConsent" name="contactConsent" type="checkbox" aria-controls="contact-fields" :aria-expanded="form.contactConsent">
          <span>Quero receber contato do personal</span>
        </label>

        <div v-if="form.contactConsent" id="contact-fields" class="contact-fields field-wide">
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
        </div>

        <button class="primary-button field-wide" type="submit" :disabled="sending">{{ submitLabel }} <span aria-hidden="true">→</span></button>
      </form>

      <section v-if="result" id="result" class="result-card" aria-live="polite">
        <div class="result-heading">
          <div><p class="eyebrow">SEU RESULTADO</p><h2>{{ classification }}</h2></div>
          <div class="score"><strong>{{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}</strong><span>IMC</span></div>
        </div>
        <p class="result-message">{{ resultMessage }}</p>
        <div class="weight-goal">
          <p class="eyebrow">ESTIMATIVA PARA ADULTOS</p>
          <strong v-if="weightToLose !== null">{{ weightToLose.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg</strong>
          <strong v-else>—</strong>
          <p>{{ weightGoalMessage }}</p>
        </div>
        <div class="scale" aria-label="Faixas de IMC para adultos">
          <span><b>&lt; 18,5</b>Baixo peso</span><span><b>18,5–24,9</b>Adequado</span>
          <span><b>25–29,9</b>Sobrepeso</span><span><b>≥ 30</b>Obesidade</span>
        </div>
      </section>

      <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
      <p class="disclaimer">O IMC é uma referência para adultos e não substitui a avaliação de um profissional de saúde.</p>
    </section>
    <footer>Uma referência para você cuidar melhor de si.</footer>
  </main>
</template>
