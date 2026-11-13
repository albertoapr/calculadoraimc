# FitPeso — frontend

Vue 3, TypeScript e Vite, com Vue Router e Pinia.

## Organização

- `src/AppRoot.vue`: entrada com `RouterView`.
- `src/App.vue`: composição do layout e seleção das telas.
- `src/views/auth/`: login e cadastros.
- `src/views/atendimento/`: edição/resumo e seleção dos profissionais.
- `src/views/account/`: perfil, solicitações, propostas e administração.
- `src/views/assessment/`: formulário e resultado da avaliação corporal.
- `src/views/layout/`: cabeçalhos e rodapé.
- `src/composables/useFitpesoApp.ts`: coordenação dos fluxos, sessão e operações ainda compartilhadas. Instanciado uma vez pelo shell e fornecido por um contexto tipado; as telas consomem referências reativas, sem copiar o estado.
- `src/composables/useTheme.ts`: tema e persistência da preferência.
- `src/composables/useCustomerSignup.ts`: contato inicial, dados do cliente e confirmação automática pela Beta, com cancelamento de consultas e temporizadores.
- `src/composables/useTrainerSignup.ts`: formulário do personal, cidades de atuação, sugestão de subdomínio e link de confirmação.
- `src/composables/useAccountProfile.ts`: carregamento, edição e salvamento do cadastro do cliente ou personal.
- `src/services/signupService.ts`: registro de cliente/personal e consulta da confirmação do cliente, sem estado de interface.
- `src/services/accountProfileService.ts`: consulta e atualização do cadastro da conta autenticada.
- `src/utils/signupValidation.ts`: normalização de WhatsApp/Instagram e validação de data compartilhadas com os fluxos existentes.
- `src/composables/useAuthentication.ts`: estado de login, confirmação por WhatsApp/e-mail e ciclo de vida dos temporizadores; recebe callbacks de perfil e navegação, sem depender do controlador principal.
- `src/composables/useCustomerRequests.ts`: consulta de solicitações do cliente, envio para profissionais, inativação/reativação e aceite de propostas.
- `src/services/authenticationService.ts` e `customerRequestsService.ts`: transporte HTTP e contratos desses fluxos; recebem tokens explicitamente e não alteram a sessão ou a navegação.
- `src/composables/useAdminTrainers.ts`: cadastro, pesquisa e edição de profissionais pelo administrador.
- `src/composables/useTrainerProposal.ts`: consulta da solicitação recebida por token e envio de proposta pelo personal.
- `src/services/adminTrainersService.ts` e `trainerProposalService.ts`: contratos HTTP desses módulos; não acessam estado de tela nem armazenamento de sessão.
- `src/stores/`: seleção de profissionais e rascunho de treinamento em memória.
- `src/services/`: descoberta do endpoint, consulta de profissionais, criação de solicitações e SEO.
- `src/types/`: contratos e modelos do frontend.
- `src/assets/styles/screens.css`: estilos compartilhados das telas extraídas, carregados depois do CSS principal para preservar a precedência.

## Navegação e sessão

O Router controla a renderização do shell e as URLs públicas `/` e `/profissionais`.
O shell persiste entre essas rotas para preservar login pendente, seleção e dados do formulário.
Os passos internos e as telas privadas usam estado de fluxo; não possuem URLs próprias nesta entrega.
O fallback mantém os endereços personalizados `/p/:id`, tokens e links de confirmação.
A sincronização pública usa o Router, sem registrar um segundo listener de histórico.

O rascunho contém informações pessoais e permanece apenas em memória. O mecanismo existente de sessão e verificação é preservado. Não persistir esses dados em localStorage.

## Desenvolvimento e validação

```sh
npm ci
npm run dev
npm run check
```

`check` executa ESLint, Prettier, TypeScript, build e testes. Os testes cobrem o controlador de espera do WhatsApp, seleção, cache, navegação e montagem dos componentes reais em DOM simulado.

Os testes de autenticação executam o módulo extraído e seus serviços com relógio, armazenamento e rede controlados. Incluem retomada de login, expiração, confirmação de e-mail para cliente e personal e limpeza dos recursos ao desmontar. Os testes de solicitações verificam as regras de visibilidade, seleção obrigatória, envio duplicado e respostas de aceite da API.

Os testes de cadastro usam relógio e rede simulados para validar os dados enviados, a confirmação pela Beta, expiração, mensagens de erro, bloqueio de cliques repetidos e descarte de respostas tardias ao fechar o cadastro. A montagem dos componentes verifica também a passagem pelo cadastro de cliente e personal. Nenhuma mensagem real de WhatsApp é enviada nesses testes.

Para conferir visualmente com Chromium:

```sh
npx playwright install chromium
npm run dev -- --host 127.0.0.1
# Em outro terminal, ajuste CHROMIUM_PATH para seu Chromium instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

O teste de navegador usa respostas simuladas e bloqueia acessos externos. O DOM simulado não substitui a conferência de layout, Google OAuth ou confirmação real pela Beta.

## Evolução

A extração das telas estabelece a fronteira para continuar dividindo `useFitpesoApp` em controladores por domínio e migrar os demais acessos HTTP para serviços. Essa divisão exige testes adicionais de sessão e API. As rotas privadas devem ser introduzidas junto com restauração de contexto e controle de acesso, e não como simples troca de URLs.
