# Migração incremental do roteamento

Nesta etapa, Vue Router é registrado, mas **não** controla a renderização.
O `App.vue` permanece montado diretamente e continua utilizando `viewMode` e
`usePublicNavigation` para preservar fluxos de login, cadastro e solicitação.

Rotas preparadas: `/` e `/profissionais`, com fallback para URLs legadas.
Os componentes de rota são placeholders que ainda não são renderizados.

Próxima etapa, após CI verde: migrar uma rota pública por vez para
`RouterView`, remover gradualmente o histórico manual e cobrir Voltar/Avançar,
links de confirmação por e-mail e URLs com tokens.

O Pinia também é registrado sem migrar o estado existente nesta fase.
