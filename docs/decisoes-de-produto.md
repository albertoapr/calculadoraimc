# FitPeso — Registro de decisões de produto

## 25/11/2026 — Cadastro de cidades

**Status:** implementado na branch `develop`.

### Decisões

- Criar um cadastro de cidades para apoiar a expansão da FitPeso. O cadastro será a fonte da lista de municípios usada no app.
- Gravar, por cidade, o valor mínimo e o valor médio da hora-aula de personal trainer.
- Mostrar no seletor público apenas cidades onde há personais trabalhando.

### Regras propostas para a implementação

| Situação da cidade | Seletor público | Cadastro do personal |
|---|---|---|
| Ativa, com pelo menos um personal ativo vinculado a uma academia ativa na cidade | Aparece | Aparece |
| Ativa, sem personal que atenda ao critério acima | Fica oculta | Aparece, permitindo cadastrar o primeiro personal |
| Inativa | Fica oculta | Fica oculta para novos vínculos |

Ao sair do seletor, a cidade conserva seus preços cadastrados e seus vínculos existentes. As cidades de atuação do personal são derivadas das academias selecionadas no cadastro dele.

O modelo inicial proposto inclui identificador, nome, UF, slug e status da cidade. Para cada preço, usar centavos de real por hora-aula e guardar a data da última revisão. Preços ainda indisponíveis podem ficar em branco. Quando os dois valores estiverem preenchidos, a média deve ser maior ou igual ao mínimo. A proposta é mostrar os valores disponíveis após a escolha da cidade, sem condicionar a presença da cidade no seletor ao preenchimento dos preços.

### Pontos a definir

- Quais serão os valores iniciais em cada cidade? A sugestão é começar com referências editáveis no painel. Nesse caso, o mínimo serve de referência, e a média deve ser apresentada como estimativa.
- Se a média passar a usar contratações da FitPeso, qual período, quantidade mínima de contratações e modalidade de aula serão considerados?
- Atendimento presencial em residência ou parque, sem vínculo com academia na cidade, contará para a disponibilidade pública?
- Como tratar as páginas públicas e a preferência de cidade já salva quando a cidade sair do seletor?

### Implementação

- O menu administrativo abre **Cadastro de cidades** em `/admin/cidades`. É possível cadastrar, ativar, inativar e editar os preços.
- Mesquita, Nilópolis, Nova Iguaçu e Rio de Janeiro são cadastradas automaticamente, com preços em branco. Os registros existentes continuam vinculados pela chave de cidade original. As novas gravações de academias incluem o identificador da cidade.
- O seletor público usa a existência de pelo menos um personal ativo com academia ativa. Atendimentos sem academia ficam pendentes de decisão. Uma preferência salva só é aplicada enquanto a cidade estiver disponível.
- A tela de solicitação usa o preço mínimo para estimar o valor das aulas e apresenta a média como estimativa, quando cadastrada.

### Etapas previstas originalmente

1. Criar o cadastro administrativo de cidades e preparar os registros iniciais de Mesquita, Nilópolis, Nova Iguaçu e Rio de Janeiro.
2. Vincular as academias existentes às cidades, preservando os endereços públicos já divulgados.
3. Atualizar os seletores da home, da busca de profissionais e do cadastro de personal com as regras de cada fluxo.
4. Incluir os campos de preço no painel e exibir as referências disponíveis para a cidade selecionada.

## 25/11/2026 — Gerenciamento da conta

- Desativação individual do perfil de cliente ou personal, preservando dados, histórico e os demais perfis. Atualizar os registros canônicos e legados em uma transação; no personal, inativar todas as cidades. Bloquear atendimentos não concluídos, solicitações e propostas abertas identificadas. Reativação pelo suporte nesta etapa.
- Solicitação de exclusão em nível de pessoa, abrangendo todos os perfis, com confirmação explícita e registro persistente `deletionRequestedAt` / `deletionStatus=PENDING_REVIEW`. Nesta etapa não há exclusão física automática, nova autenticação específica nem painel de processamento. A análise de retenção, pendências financeiras, revogação de sessões e eliminação dos dados e fotos precisa ser implementada antes de considerar a exclusão concluída.
- Operações administrativas protegidas; o usuário não informa identificadores de terceiros.
- Validar em develop antes de promover para main. Revisar concorrência entre criação/aceite de atendimentos e desativação; substituir varreduras limitadas por índices próprios para expansão.

## 25/11/2026 — Concessão de acesso administrativo

- Em Gerenciar clientes, um administrador pode tornar outro cliente ativo administrador após confirmação.
- Criar/ativar o papel ADMIN na tabela usuario mantendo CLIENTE e PERSONAL; sincronizar isAdmin no cadastro legado quando existir. Registrar quem concedeu e quando.
- Validar o administrador autenticado no backend e na transação; bloquear identidade inconsistente, cliente inativo ou solicitação de exclusão pendente.
- O perfil administrativo funciona também com a identidade Google V2 sem registro legado. O beneficiário deve entrar novamente para escolher Administrador. Não foi incluída remoção do papel ADMIN nesta etapa.

## 26/11/2026 — Cadastro simplificado do personal

Aprovado o plano incremental em develop, com validação antes de publicar na main. Acompanhar em [Plano de cadastro simplificado](plano-cadastro-simplificado-personal.md).

## 26/11/2026 — Relacionamentos independentes do personal

- Personal N:N cidade, personal N:N academia e academia N:1 cidade. Pelo menos uma cidade; academia opcional. Adicionar academia implica vínculo com sua cidade; remover academia não remove cidade. Remoção de cidade desvincula as academias associadas mediante confirmação, protegendo pendências.
- Implantação incremental: FitpesoTrainerCities com chaves trainerId e cityId e índice reverso TrainersByCity. Durante migração, FitpesoProfessionals permanece fonte de leitura; novas gravações sincronizam vínculos na mesma transação. Backfill e verificação antes de mudar a leitura e eliminar duplicação. Preservar IDs, vínculos e histórico. Limites mantidos inicialmente.

Script de backfill: `scripts/backfill-trainer-cities.mjs` (dry-run por padrão, aplicação explícita após conferência). Não executado nesta alteração.

## 26/11/2026 — Solicitar inclusão de município

Solicitação anônima de município/UF, sem armazenar contatos do solicitante; uma solicitação por município/UF. Administrador aprova ou rejeita no cadastro de cidades. Aprovação disponibiliza a cidade para cadastro, mas o seletor público ainda exige personal ativo. Cadastro continua exigindo cidade ativa. Não há notificação automática, validação IBGE ou persistência de rascunho nesta fase.

## Cadastro inicial do cliente — WhatsApp primeiro

Confirmar WhatsApp antes de liberar demais campos; nome de exibição recebido pela Beta é sugestão editável, não nome civil comprovado. A nova interface só conclui com prova validada. Registro legado mantido por compatibilidade; novas contas Google usam confirmação de telefone no formulário, com vinculação Google a revisar.
