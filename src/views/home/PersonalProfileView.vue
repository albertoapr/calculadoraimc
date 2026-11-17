<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { openRequestForm } = useFitpesoContext()
</script>

<template>
  <div class="home-actions">
    <div class="home-action">
      <button class="primary-button" type="button" @click="openRequestForm">
        Solicitar Proposta
      </button>
    </div>
  </div>
</template>
