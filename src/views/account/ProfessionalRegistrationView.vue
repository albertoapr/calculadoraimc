<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { goHome } = useFitpesoContext()
</script>

<template>
  <section class="professional-registration-view" aria-labelledby="professional-registration-title">
    <h2 id="professional-registration-title" class="request-form-title">
      <button type="button" class="title-back-button" aria-label="Voltar ao início" @click="goHome">
        &lt;
      </button>
      Consultar Registro profissional
    </h2>
    <p>Consulte a situação cadastral de profissionais de Educação Física no CREF-RJ.</p>
    <p class="professional-registration-help">
      <a
        href="https://cref-rj.implanta.net.br/servicosOnline/Publico/ConsultaInscritos/"
        target="_blank"
        rel="noopener noreferrer"
        >Consultar registro diretamente no site do CREF-RJ</a
      >.
    </p>
  </section>
</template>
