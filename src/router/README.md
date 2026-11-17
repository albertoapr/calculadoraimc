# Navegação

As telas possuem URLs próprias declaradas em `screens.ts`. Todas usam o mesmo shell persistente,
preservando o contexto de autenticação e treinamento ao usar Voltar/Avançar.

`useApplicationNavigation` sincroniza o shell com as rotas, reconhece links antigos por hash e
aguarda a restauração da sessão antes de abrir áreas privadas. Visitantes voltam ao destino original
após o login; destinos externos não são aceitos. APIs continuam responsáveis pela autorização real.

Preferências de treinamento e seleção de profissionais são recuperadas do sessionStorage na mesma
sessão do navegador. Nome, telefone, e-mail, consentimento e tokens não são incluídos no rascunho.
