# Migração incremental de telas

As telas permanecem temporariamente no `App.vue` para preservar as sessões,
os retornos de autenticação e a navegação existente. Cada tela será extraída
após separar suas dependências de estado e chamadas HTTP. Não adicionar views
vazias apenas para simular uma migração concluída.
