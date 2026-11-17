import { computed, ref, type ComputedRef, type Ref } from 'vue'
import silhouetteScaleImage from '../assets/female-bmi-silhouette-scale.jpg'
import maleSilhouetteScaleImage from '../assets/male-bmi-silhouette-scale.jpg'
import type { ImcResult, Sex } from '../types/domain'

type AssessmentForm = {
  weight: string
  height: string
  waist: string
  calculateBodyFat: boolean
  bodyFatAge: string
  sex: Sex
}

export function useAssessment(options: {
  form: AssessmentForm
  contactAge: ComputedRef<number | undefined>
  status: Ref<string>
  resetContactDetails: () => void
  openAssessment: () => void
}) {
  const result = ref<ImcResult | null>(null)
  const evaluating = ref(false)
  const evaluationProgress = ref(0)

  function category(imc: number) {
    if (imc < 18.5)
      return ['Baixo peso', 'Converse com um profissional de saúde para uma avaliação individual.']
    if (imc < 25)
      return ['Peso adequado', 'Esta faixa é considerada adequada como referência para adultos.']
    if (imc < 30)
      return [
        'Sobrepeso',
        'Uma orientação profissional pode ajudar a definir hábitos e metas saudáveis.',
      ]
    if (imc < 35)
      return [
        'Obesidade I',
        'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
      ]
    if (imc < 40)
      return [
        'Obesidade II',
        'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
      ]
    return [
      'Obesidade mórbida',
      'Uma avaliação profissional pode ajudar a definir metas seguras e personalizadas.',
    ]
  }

  function classifyBodyFat(percent: number, sex: Sex, age: number) {
    const referenceBands =
      sex === 'masculino'
        ? [
            { from: 20, to: 40, minimum: 8, maximum: 20 },
            { from: 40, to: 60, minimum: 11, maximum: 22 },
            { from: 60, to: 80, minimum: 13, maximum: 25 },
          ]
        : [
            { from: 20, to: 40, minimum: 21, maximum: 33 },
            { from: 40, to: 60, minimum: 23, maximum: 34 },
            { from: 60, to: 80, minimum: 24, maximum: 36 },
          ]
    const reference = referenceBands.find((band) => age >= band.from && age < band.to)

    if (!reference) return 'Faixa de referência indisponível para esta idade'
    if (percent < reference.minimum) return 'Baixo'
    if (percent <= reference.maximum) return 'Adequado'
    if (percent <= reference.maximum + 5) return 'Alto'
    return 'Muito alto'
  }

  const classification = computed(() => (result.value ? category(result.value.imc)[0] : ''))
  const classificationEmoji = computed(() =>
    result.value && result.value.imc >= 18.5 && result.value.imc < 25 ? '😎' : '😕',
  )
  const silhouetteImage = computed(() =>
    options.form.sex === 'masculino' ? maleSilhouetteScaleImage : silhouetteScaleImage,
  )
  const silhouettePositions = computed(() =>
    options.form.sex === 'masculino'
      ? ['0%', '33.333%', '66.667%', '100%']
      : ['0%', '25%', '50%', '75%'],
  )
  const silhouetteGenderLabel = computed(() =>
    options.form.sex === 'masculino' ? 'MASCULINAS' : 'FEMININAS',
  )
  const bmiScale = [
    { label: 'Magreza', range: '<18,5', from: 12, to: 18.5, color: '#60a5fa' },
    { label: 'Peso adequado', range: '18,5–24,9', from: 18.5, to: 25, color: '#34d399' },
    { label: 'Sobrepeso', range: '25–29,9', from: 25, to: 30, color: '#fbbf24' },
    { label: 'Obesidade I', range: '30–34,9', from: 30, to: 35, color: '#fb923c' },
  ]
  const scalePosition = computed(() =>
    result.value ? `${Math.max(0, Math.min(100, ((result.value.imc - 12) / 23) * 100))}%` : '0%',
  )
  const bodyFatReference = computed(() => {
    const current = result.value
    if (
      current?.bodyFatPercent === undefined ||
      current.bodyFatAge === undefined ||
      !current.bodyFatSex
    )
      return null
    const bands =
      current.bodyFatSex === 'masculino'
        ? [
            { from: 20, to: 40, minimum: 8, maximum: 20 },
            { from: 40, to: 60, minimum: 11, maximum: 22 },
            { from: 60, to: 80, minimum: 13, maximum: 25 },
          ]
        : [
            { from: 20, to: 40, minimum: 21, maximum: 33 },
            { from: 40, to: 60, minimum: 23, maximum: 34 },
            { from: 60, to: 80, minimum: 24, maximum: 36 },
          ]
    const band = bands.find(
      (item) => current.bodyFatAge! >= item.from && current.bodyFatAge! < item.to,
    )
    if (!band) return null
    const domain = 70
    const highLimit = Math.min(domain, band.maximum + 5)
    return {
      ...band,
      domain,
      highLimit,
      sexLabel: current.bodyFatSex === 'masculino' ? 'homens' : 'mulheres',
      ageLabel: `${band.from}–${band.to - 1} anos`,
      marker: `${(Math.max(0, Math.min(domain, current.bodyFatPercent)) / domain) * 100}%`,
      widths: [
        (band.minimum / domain) * 100,
        ((band.maximum - band.minimum) / domain) * 100,
        ((highLimit - band.maximum) / domain) * 100,
        ((domain - highLimit) / domain) * 100,
      ],
    }
  })
  const bmiSilhouettes = [
    { label: 'Magreza', range: 'IMC < 18,5', position: 0 },
    { label: 'Peso adequado', range: 'IMC 18,5–24,9', position: 25 },
    { label: 'Sobrepeso', range: 'IMC 25–29,9', position: 50 },
    { label: 'Obesidade I', range: 'IMC 30–34,9', position: 75 },
  ]
  const activeSilhouette = computed(() => {
    if (!result.value) return -1
    if (result.value.imc < 18.5) return 0
    if (result.value.imc < 25) return 1
    if (result.value.imc < 30) return 2
    return 3
  })
  const weightGoalAmount = computed(() => {
    if (!result.value || (options.contactAge.value !== undefined && options.contactAge.value < 18))
      return null
    const heightMetersSquared = (result.value.heightCm / 100) ** 2
    if (result.value.imc < 18.5) {
      return Number(Math.max(0, 18.5 * heightMetersSquared - result.value.weight).toFixed(1))
    }
    if (result.value.imc >= 25) {
      const adultReferenceWeight = 24.9 * heightMetersSquared
      return Number(Math.max(0, result.value.weight - adultReferenceWeight).toFixed(1))
    }
    return null
  })
  const referenceWeightRange = computed(() => {
    if (!result.value) return null
    const heightMetersSquared = (result.value.heightCm / 100) ** 2
    return {
      minimum: Number((18.5 * heightMetersSquared).toFixed(1)),
      maximum: Number((24.9 * heightMetersSquared).toFixed(1)),
    }
  })

  function adjustMeasurement(field: 'weight' | 'height' | 'waist', amount: number) {
    const minimum = field === 'weight' ? 50 : field === 'height' ? 140 : 40
    const maximum = field === 'weight' ? 150 : field === 'height' ? 190 : 160
    const nextValue = Math.max(minimum, Math.min(maximum, Number(options.form[field]) + amount))
    options.form[field] = String(nextValue)
  }

  function calculateImc() {
    if (evaluating.value) return
    options.status.value = ''
    options.resetContactDetails()

    const weight = Number(options.form.weight)
    const heightCm = Number(options.form.height)
    if (
      !Number.isInteger(weight) ||
      weight < 50 ||
      weight > 150 ||
      !Number.isInteger(heightCm) ||
      heightCm < 140 ||
      heightCm > 190
    ) {
      options.status.value = 'Confira o peso e a altura informados.'
      return
    }

    const nextResult: ImcResult = {
      weight,
      heightCm,
      imc: Number((weight / (heightCm / 100) ** 2).toFixed(1)),
    }
    if (options.form.calculateBodyFat) {
      const waistCm = Number(options.form.waist)
      const age = Number(options.form.bodyFatAge)
      if (
        !Number.isInteger(waistCm) ||
        waistCm < 40 ||
        waistCm > 160 ||
        !Number.isInteger(age) ||
        age < 20 ||
        age > 120
      ) {
        options.status.value =
          'Para calcular a gordura corporal, confira a cintura e informe a idade (mínimo de 20 anos).'
        return
      }
      const bodyFatPercent = Number(
        ((options.form.sex === 'masculino' ? 64 : 76) - 20 * (heightCm / waistCm)).toFixed(1),
      )
      if (bodyFatPercent < 0 || bodyFatPercent > 70) {
        options.status.value = 'Confira as medidas de altura e cintura informadas.'
        return
      }
      nextResult.waistCm = waistCm
      nextResult.bodyFatPercent = bodyFatPercent
      nextResult.bodyFatClassification = classifyBodyFat(bodyFatPercent, options.form.sex, age)
      nextResult.bodyFatSex = options.form.sex === 'masculino' ? 'masculino' : 'feminino'
      nextResult.bodyFatAge = age
    }

    evaluating.value = true
    evaluationProgress.value = 0
    const startedAt = performance.now()
    const duration = 2000

    function animate(now: number) {
      evaluationProgress.value = Math.min(100, Math.round(((now - startedAt) / duration) * 100))
      if (evaluationProgress.value < 100) requestAnimationFrame(animate)
      else {
        result.value = nextResult
        evaluating.value = false
      }
    }

    requestAnimationFrame(animate)
  }

  function editMeasurement() {
    result.value = null
    options.resetContactDetails()
    options.status.value = ''
    options.openAssessment()
  }

  return {
    result,
    evaluating,
    evaluationProgress,
    adjustMeasurement,
    calculateImc,
    classification,
    classificationEmoji,
    silhouetteImage,
    silhouettePositions,
    silhouetteGenderLabel,
    bmiScale,
    scalePosition,
    bodyFatReference,
    bmiSilhouettes,
    activeSilhouette,
    weightGoalAmount,
    referenceWeightRange,
    editMeasurement,
  }
}
