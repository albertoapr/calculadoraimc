<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const {
  form,
  result,
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
  openRequestForm,
} = useFitpesoContext()
</script>

<template>
  <section v-if="result" id="result" class="result-card" aria-live="polite">
    <div class="result-heading">
      <h2>
        {{ classification }} {{ classificationEmoji
        }}<template v-if="weightGoalAmount !== null"
          >: {{ weightGoalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }} kg
          {{ result.imc < 18.5 ? 'a ganhar' : 'a perder' }}</template
        >
      </h2>
    </div>

    <div class="bmi-summary">
      <p v-if="referenceWeightRange" class="weight-range-note">
        Peso ideal
        <strong
          >{{
            referenceWeightRange.minimum.toLocaleString('pt-BR', { minimumFractionDigits: 1 })
          }}
          kg</strong
        >
        a
        <strong
          >{{
            referenceWeightRange.maximum.toLocaleString('pt-BR', { minimumFractionDigits: 1 })
          }}
          kg</strong
        >
      </p>
      <p class="bmi-value">
        IMC {{ result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}
        <span class="bmi-unit">kg/m²</span>
      </p>
    </div>

    <div
      class="bmi-scale-wrap"
      role="img"
      :aria-label="`Escala de IMC: ${result.imc.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} quilogramas por metro quadrado, classificação ${classification}`"
    >
      <div class="bmi-scale-bar">
        <div class="bmi-scale-segments">
          <span
            v-for="segment in bmiScale"
            :key="segment.label"
            :style="{ backgroundColor: segment.color, flexGrow: segment.to - segment.from }"
          ></span>
        </div>
        <div class="scale-marker" :style="{ left: scalePosition }" aria-hidden="true"></div>
      </div>
      <div class="scale-labels">
        <span v-for="segment in bmiScale" :key="segment.label"
          ><b>{{ segment.range }}</b
          >{{ segment.label }}</span
        >
      </div>
    </div>

    <div
      v-if="result.bodyFatPercent !== undefined"
      class="body-fat-summary"
      aria-label="Estimativa de gordura corporal pela fórmula RFM"
    >
      <p>Gordura corporal estimada <span>(RFM)</span></p>
      <strong
        >{{ result.bodyFatPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) }}%</strong
      >
      <p class="body-fat-classification">{{ result.bodyFatClassification }}</p>
      <small
        >Estimativa com referência geral para adultos por sexo e idade; não é medição direta.</small
      >
    </div>
    <div v-if="result.bodyFatPercent !== undefined" class="body-fat-scale-wrap">
      <template v-if="bodyFatReference">
        <p class="body-fat-scale-title">
          Referência para {{ bodyFatReference.sexLabel }}, {{ bodyFatReference.ageLabel }}
        </p>
        <div
          class="body-fat-scale-bar"
          role="img"
          :aria-label="`Gordura corporal ${result.bodyFatPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%. Classificações: baixo abaixo de ${bodyFatReference.minimum}%, adequado até ${bodyFatReference.maximum}%, alto até ${bodyFatReference.highLimit}%, muito alto acima disso.`"
        >
          <div class="body-fat-scale-segments">
            <span class="body-fat-low" :style="{ width: `${bodyFatReference.widths[0]}%` }"></span>
            <span
              class="body-fat-healthy"
              :style="{ width: `${bodyFatReference.widths[1]}%` }"
            ></span>
            <span class="body-fat-high" :style="{ width: `${bodyFatReference.widths[2]}%` }"></span>
            <span
              class="body-fat-very-high"
              :style="{ width: `${bodyFatReference.widths[3]}%` }"
            ></span>
          </div>
          <div
            class="body-fat-scale-marker"
            :style="{ left: bodyFatReference.marker }"
            aria-hidden="true"
          ></div>
        </div>
        <div
          class="body-fat-scale-labels"
          :style="{
            gridTemplateColumns: bodyFatReference.widths.map((width) => `${width}fr`).join(' '),
          }"
        >
          <span><b>Baixo</b>&lt;{{ bodyFatReference.minimum }}%</span>
          <span><b>Adequado</b>{{ bodyFatReference.minimum }}–{{ bodyFatReference.maximum }}%</span>
          <span
            ><b>Alto</b>&gt;{{ bodyFatReference.maximum }}–{{ bodyFatReference.highLimit }}%</span
          >
          <span><b>Muito alto</b>&gt;{{ bodyFatReference.highLimit }}%</span>
        </div>
      </template>
      <p v-else class="body-fat-reference-unavailable">
        Faixa de referência indisponível para esta idade.
      </p>
    </div>
    <div
      class="silhouette-section"
      :class="{ 'male-silhouettes': form.sex === 'masculino' }"
      :aria-label="`Escala ilustrativa de silhuetas ${silhouetteGenderLabel.toLowerCase()} por classificação de IMC`"
    >
      <div class="silhouette-list">
        <div
          v-for="(person, index) in bmiSilhouettes"
          :key="person.label"
          class="silhouette-item"
          :class="{ active: activeSilhouette === index }"
          :aria-current="activeSilhouette === index ? 'true' : undefined"
        >
          <div
            class="silhouette-image-window"
            :style="{
              backgroundImage: `url(${silhouetteImage})`,
              backgroundPositionX: silhouettePositions[index],
            }"
            role="img"
            :aria-label="`Silhueta ${person.label}`"
          ></div>
          <b>{{ person.label }}</b><span>{{ person.range }}</span>
        </div>
      </div>
      <p v-if="result.imc >= 35" class="silhouette-note severe-obesity-note">
        O gráfico e a escala visual terminam em obesidade grau I; seu IMC está acima da faixa
        exibida.
      </p>
    </div>

    <button class="primary-button result-request-button" type="button" @click="openRequestForm">
      Receber atendimento <span aria-hidden="true">→</span>
    </button>
    <button class="back-button" type="button" @click="editMeasurement">Nova avaliação</button>
  </section>
</template>
