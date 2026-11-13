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
