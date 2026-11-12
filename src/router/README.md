# Navegação

`AppRoot.vue` renderiza o `RouterView`. Todas as rotas usam o mesmo shell `App.vue`, mantendo seu estado entre as URLs públicas. `usePublicNavigation` sincroniza `/` e `/profissionais` com as telas, inclusive Voltar/Avançar.

O fallback preserva links personalizados e de confirmação. Passos do atendimento, autenticação e áreas privadas continuam sendo fluxos internos do shell. Tokens são removidos da URL pelo Router depois de capturados pelo controlador.
