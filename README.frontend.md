# FitPeso — arquitetura frontend (migração incremental)

- `src/App.vue`: componente legado; permanece funcional enquanto as telas são extraídas.
- `src/services/`: comunicação com a API e metadados de SEO.
- `src/utils/`: formatadores e funções puras reutilizáveis.
- `src/constants/`: opções e valores fixos de interface.
- `src/composables/`: lógica Vue reutilizável.
- `src/views/`: destino das telas após extração segura.

## Desenvolvimento
```sh
npm ci
npm run dev
npm run build
npm run test:whatsapp
```

## Regras de migração
Preservar as URLs de confirmação, a sessão de clientes e personais, a seleção
de profissionais e o CSS existente. Cada mudança deve passar pelo build e
pelos testes antes de avançar. Vue Router, Pinia, Axios, ESLint e Vitest serão
adicionados em fases próprias, com testes de regressão; não foram adicionados
nesta fase.
