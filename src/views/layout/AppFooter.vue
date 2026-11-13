<script setup lang="ts">
import { useFitpesoContext } from '../../composables/fitpesoContext'
const { theme, viewMode } = useFitpesoContext()
</script>

<template>
  <div
    class="box-footer"
    role="group"
    aria-label="Aparência e contato"
    style="display: flex; justify-content: space-between; align-items: center"
  >
    <a
      class="box-contact-link"
      aria-label="Fale conosco pelo WhatsApp"
      title="Fale conosco pelo WhatsApp"
      style="margin-left: 0; justify-self: start"
      href="https://wa.me/5521971118383?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20equipe%20do%20FitPeso."
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg class="box-contact-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M20.5 3.5A11.9 11.9 0 0 0 12 .1C5.4.1 0 5.5 0 12.1c0 2.1.6 4.2 1.6 6L0 24l6.1-1.6a12 12 0 0 0 5.9 1.5c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4ZM12 21.9c-1.9 0-3.7-.5-5.2-1.4l-.4-.2-3.6.9 1-3.5-.3-.4A9.9 9.9 0 0 1 2 12.1C2 6.6 6.5 2.1 12 2.1s10 4.5 10 10-4.5 9.8-10 9.8Zm5.5-7.4c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.7.1-.2.1-.4 0-.6l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7 1.1-.2 1.8-.9 2-1.7.2-.8.2-1.5.2-1.7-.1-.1-.3-.2-.6-.4Z"
        />
      </svg>
    </a>
    <span class="header-auth-divider" aria-hidden="true" style="margin: 0 8px">|</span>
    <a href="#sobre" class="box-contact-link" @click.prevent="viewMode = 'about'">Sobre</a>
    <div class="box-theme-actions" style="margin-left: auto">
      <button
        type="button"
        class="theme-mode-toggle"
        role="switch"
        :aria-checked="theme === 'dark'"
        :aria-label="`Tema escuro ${theme === 'dark' ? 'ativado' : 'desativado'}. Alternar aparência`"
        :title="theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
        @click="theme = theme === 'dark' ? 'light' : 'dark'"
      >
        <span class="theme-mode-toggle-thumb" aria-hidden="true">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24">
            <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3.5" />
            <path
              d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
            />
          </svg>
        </span>
      </button>
    </div>
  </div>
</template>
