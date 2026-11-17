# FitPeso API

A especificação oficial está em [`public/openapi.json`](../public/openapi.json), no formato OpenAPI 3.1 (Swagger).

Depois do deploy, ficam disponíveis:

- `https://<site>/openapi.json`: contrato para importar em agentes de IA, Postman e geradores de SDK;
- `https://<site>/api-docs/`: documentação Swagger navegável;
- o Swagger substitui automaticamente o servidor pelo endpoint do API Gateway do ambiente atual.

## Organização no frontend

`src/services/http/apiClient.ts` é o único transporte HTTP da aplicação. Ele:

- descobre o endpoint do ambiente em `amplify_outputs.json`;
- monta query strings e serializa JSON;
- aplica `Authorization: Bearer`;
- normaliza respostas e erros em `ApiError`;
- propaga `AbortSignal`.

Os demais arquivos de `src/services` representam operações por domínio:

| Serviço | Responsabilidade |
| --- | --- |
| `authenticationService` | login, confirmação e sessão |
| `signupService` | cadastro de cliente e personal |
| `academiesService` | academias públicas e administrativas |
| `profissionaisService` | consulta pública de personais |
| `customerRequestsService` | solicitações e aceite de propostas |
| `trainerRequestsService` | solicitações recebidas pelo personal |
| `trainerProposalService` | visualização e envio de proposta |
| `accountProfileService` | leitura e atualização de perfil |
| `adminTrainersService` | administração de personais |
| `atendimentoService` | criação de solicitação de treinamento |

Componentes e composables não devem montar URLs da API nem chamar `fetch` diretamente.

## Autenticação

- **Operações públicas:** sem credencial.
- **Conta FitPeso:** sessão no cabeçalho `Authorization: Bearer <token>`.
- **Integração interna:** `X-Fitpeso-Verification-Secret`.

O segredo de integração é exclusivo dos serviços FitPeso/Beta. Ele não deve ser colocado no frontend, enviado a agentes externos ou entregue a clientes do futuro SaaS.

## Uso em agente de IA

Importe a URL pública `/openapi.json` como uma ação OpenAPI. O agente pode usar com segurança as operações públicas. Para operar em nome de um usuário, a plataforma que hospeda o agente deve receber uma sessão FitPeso por um fluxo autorizado e enviá-la como Bearer token.

Operações marcadas com `x-internal: true` não fazem parte da API pública. Remova essas operações do conjunto de ferramentas do agente, a menos que ele execute dentro da infraestrutura confiável da FitPeso.

## Preparação para SaaS

Este contrato e a camada HTTP criam a base, mas uma API comercial ainda precisa de:

1. rotas estáveis versionadas, por exemplo `/api/v1`;
2. clientes SaaS com chaves próprias — nunca o segredo da integração Beta;
3. escopos por chave, isolamento por organização e trilha de auditoria;
4. limites de uso, quotas e proteção contra abuso;
5. medição de consumo, planos e cobrança;
6. política de compatibilidade, webhooks e ambiente sandbox.

Esses controles devem entrar antes de liberar operações de escrita para terceiros.
