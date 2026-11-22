<script setup lang="ts">
defineProps<{ open: boolean }>()
</script>

<template>
  <section class="request-accordion-item" :class="{ 'request-accordion-open': open }">
    <slot name="header" />
    <slot />
  </section>
</template>
