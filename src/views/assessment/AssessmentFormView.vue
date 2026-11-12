<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { form, adjustMeasurement, calculateImc } = useFitpesoContext()
</script>

<template>
  <form class="form" @submit.prevent="calculateImc">
    <div class="gender-tabs field-wide" role="tablist" aria-label="Selecione uma escala corporal">
      <button
        id="tab-woman"
        class="gender-tab"
        :class="{ active: form.sex === 'feminino' }"
        type="button"
        role="tab"
        :aria-selected="form.sex === 'feminino'"
        aria-controls="measurement-panel"
        @click="form.sex = 'feminino'"
      >
        Mulher
      </button>
      <button
        id="tab-man"
        class="gender-tab"
        :class="{ active: form.sex === 'masculino' }"
        type="button"
        role="tab"
        :aria-selected="form.sex === 'masculino'"
        aria-controls="measurement-panel"
        @click="form.sex = 'masculino'"
      >
        Homem
      </button>
    </div>
    <div
      id="measurement-panel"
      class="measurement-fields field-wide"
      role="tabpanel"
      :aria-labelledby="form.sex === 'feminino' ? 'tab-woman' : 'tab-man'"
    >
      <label class="field slider-field" for="weight"
        ><span class="slider-heading"
          ><span class="field-label">Peso <span>kg</span></span
          ><output for="weight"
            >{{
              Number(form.weight).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
            }}
            kg</output
          ></span
        >
        <div class="slider-control-row">
          <button
            class="slider-adjust"
            type="button"
            aria-label="Diminuir peso"
            :disabled="Number(form.weight) <= 50"
            @click="adjustMeasurement('weight', -1)"
          >
            −
          </button>
          <input
            id="weight"
            v-model="form.weight"
            class="range-input"
            name="weight"
            type="range"
            min="50"
            max="150"
            step="1"
            aria-label="Peso em quilogramas"
          />
          <button
            class="slider-adjust"
            type="button"
            aria-label="Aumentar peso"
            :disabled="Number(form.weight) >= 150"
            @click="adjustMeasurement('weight', 1)"
          >
            +
          </button>
        </div>
        <span class="range-limits" aria-hidden="true"><span>50 kg</span><span>150 kg</span></span>
      </label>

      <label class="field slider-field" for="height"
        ><span class="slider-heading"
          ><span class="field-label">Altura <span>cm</span></span
          ><output for="height"
            >{{
              Number(form.height).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
            }}
            cm</output
          ></span
        >
        <div class="slider-control-row">
          <button
            class="slider-adjust"
            type="button"
            aria-label="Diminuir altura"
            :disabled="Number(form.height) <= 140"
            @click="adjustMeasurement('height', -1)"
          >
            −
          </button>
          <input
            id="height"
            v-model="form.height"
            class="range-input"
            name="height"
            type="range"
            min="140"
            max="190"
            step="1"
            aria-label="Altura em centímetros"
          />
          <button
            class="slider-adjust"
            type="button"
            aria-label="Aumentar altura"
            :disabled="Number(form.height) >= 190"
            @click="adjustMeasurement('height', 1)"
          >
            +
          </button>
        </div>
        <span class="range-limits" aria-hidden="true"><span>140 cm</span><span>190 cm</span></span>
      </label>

      <label class="body-fat-toggle field-wide" for="calculate-body-fat">
        <input
          id="calculate-body-fat"
          v-model="form.calculateBodyFat"
          type="checkbox"
          aria-controls="body-fat-fields"
          :aria-expanded="form.calculateBodyFat"
        />
        <span>Calcular percentual de gordura corporal</span>
      </label>

      <div v-if="form.calculateBodyFat" id="body-fat-fields" class="body-fat-fields field-wide">
        <label class="field slider-field" for="waist"
          ><span class="slider-heading"
            ><span class="field-label">Cintura <span>cm</span></span
            ><output for="waist"
              >{{
                Number(form.waist).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
              }}
              cm</output
            ></span
          >
          <div class="slider-control-row">
            <button
              class="slider-adjust"
              type="button"
              aria-label="Diminuir cintura"
              :disabled="Number(form.waist) <= 40"
              @click="adjustMeasurement('waist', -1)"
            >
              −
            </button>
            <input
              id="waist"
              v-model="form.waist"
              class="range-input"
              name="waist"
              type="range"
              min="40"
              max="160"
              step="1"
              aria-label="Medida da cintura em centímetros"
            />
            <button
              class="slider-adjust"
              type="button"
              aria-label="Aumentar cintura"
              :disabled="Number(form.waist) >= 160"
              @click="adjustMeasurement('waist', 1)"
            >
              +
            </button>
          </div>
          <span class="range-limits" aria-hidden="true"><span>40 cm</span><span>160 cm</span></span>
        </label>
        <label class="field field-wide" for="body-fat-age"
          ><span class="field-label">Idade <span>anos</span></span>
          <input
            id="body-fat-age"
            v-model="form.bodyFatAge"
            name="bodyFatAge"
            type="number"
            inputmode="numeric"
            min="20"
            max="120"
            step="1"
            placeholder="Necessária para classificar"
            required
          />
          <small class="body-fat-help"
            >A idade é usada para selecionar a faixa de referência.</small
          >
        </label>
      </div>

      <button class="primary-button field-wide" type="submit">
        Avaliar <span aria-hidden="true">→</span>
      </button>
    </div>
  </form>
</template>
