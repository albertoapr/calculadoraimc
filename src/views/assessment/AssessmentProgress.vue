<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { evaluating, evaluationProgress } = useFitpesoContext()
</script>

<template>
  <div
    v-if="evaluating"
    class="evaluation-overlay"
    role="status"
    aria-live="polite"
    :aria-label="`Avaliando: ${evaluationProgress}%`"
  >
    <div class="evaluation-circle" :style="{ '--progress': `${evaluationProgress * 3.6}deg` }">
      <strong>{{ evaluationProgress }}%</strong>
    </div>
  </div>
</template>
