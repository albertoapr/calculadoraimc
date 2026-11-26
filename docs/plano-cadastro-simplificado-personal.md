# FitPeso — Plano de cadastro simplificado do personal

Aprovado em 26/11/2026. Objetivo: reduzir o atrito de inscrição para o lançamento inicial, incluindo o grupo de 900 personais. Meta: cadastro básico em menos de um minuto.

Estados: Pendente, Em implementação, Implementado (código gravado, sem validação final), Validado (build, testes e ambiente). Implementar em develop e validar antes de promover para main.

## Etapa 1 — Simplificação do formulário

| ID | Tarefa | Status |
|---|---|---|
| 1.1 | Nome obrigatório | Implementado |
| 1.2 | WhatsApp obrigatório | Implementado |
| 1.3 | Sexo opcional | Implementado |
| 1.4 | Remover nascimento inicial | Implementado |
| 1.5 | Instagram opcional | Implementado |
| 1.6 | Remover CREF inicial | Implementado |
| 1.7 | E-mail opcional | Implementado |
| 1.8 | Academia opcional | Implementado |
| 1.9 | Cidade obrigatória | Implementado |
| 1.10 | Botão Criar meu perfil | Implementado |
| 1.11 | Adequar validações públicas do backend | Implementado |

## Etapa 2 — Endereço automático

| ID | Tarefa | Status |
|---|---|---|
| 2.1 | Remover campo slug | Implementado |
| 2.2 | Gerar endereço a partir do nome | Implementado |
| 2.3 | Resolver nomes duplicados | Implementado |
| 2.4 | Garantir unicidade no DynamoDB | Implementado |
| 2.5 | Preservar endereços existentes | Implementado |
| 2.6 | Permitir que o personal altere seu próprio endereço em Meu cadastro → Minha página profissional | Implementado |
| 2.7 | Validar formato, nomes reservados e disponibilidade no backend, com atualização atômica dos vínculos por cidade | Implementado |
| 2.8 | Preservar o identificador interno, solicitações, propostas e indicações ao alterar o slug | Implementado |
| 2.9 | Preservar os links anteriores como aliases do mesmo perfil, sem permitir que terceiros os reutilizem; validar redirecionamento e inativação | Implementado |

Regra: o endereço inicial é gerado automaticamente, mas o profissional pode personalizá-lo depois de autenticado. A preservação de links antigos como aliases é a solução técnica proposta para evitar quebrar links já divulgados; validar sua implementação junto com a etapa 2.

## Etapa 3 — Cidades e academias

| ID | Tarefa | Status |
|---|---|---|
| 3.1 | Selecionar cidade independentemente da academia | Implementado |
| 3.2 | Minha cidade não está na lista | Pendente |
| 3.3 | Solicitar inclusão de cidade | Pendente |
| 3.4 | Cadastro sem academia | Implementado |
| 3.5 | Preservar inclusão de academia | Implementado |
| 3.6 | Adicionar cidades e academias posteriormente | Implementado |
| 3.7 | Adequar seletor público | Implementado |

## Etapa 4 — Cadastro e autenticação

| ID | Tarefa | Status |
|---|---|---|
| 4.1 | Nome, e-mail e foto pelo Google | Pendente |
| 4.2 | Simplificar confirmação WhatsApp | Pendente |
| 4.3 | Atualizar tela automaticamente | Pendente |
| 4.4 | Login automático | Pendente |
| 4.5 | Aproveitar dados da Beta | Pendente |
| 4.6 | Não repetir confirmação | Pendente |
| 4.7 | Identificar cadastro existente | Pendente |
| 4.8 | Preservar identidade única | Pendente |
| 4.9 | Preservar código de indicação | Pendente |

## Etapa 5 — Cadastro progressivo e menu sanfonado

| ID | Tarefa | Status |
|---|---|---|
| 5.1 | Dados pessoais: nome, foto, sexo e nascimento | Pendente |
| 5.2 | Contatos: WhatsApp, e-mail e Instagram | Pendente |
| 5.3 | Dados profissionais: CREF, formação e especializações | Pendente |
| 5.4 | Locais: cidades e academias | Pendente |
| 5.5 | Sobre mim | Pendente |
| 5.6 | Forma de trabalho | Pendente |
| 5.7 | Valores | Pendente |
| 5.8 | Minha página: capa, subtítulo e endereço | Pendente |
| 5.9 | Indicações | Pendente |
| 5.10 | Gerenciar conta | Pendente |

## Etapa 6 — Indicador de perfil completo

| ID | Tarefa | Status |
|---|---|---|
| 6.1 | Percentual de preenchimento | Pendente |
| 6.2 | Barra de progresso | Pendente |
| 6.3 | Informações pendentes | Pendente |
| 6.4 | Indicador por seção | Pendente |
| 6.5 | Botão Completar meu perfil | Pendente |
| 6.6 | Orientar sobre benefícios | Pendente |

## Etapa 7 — Situação do perfil profissional

| ID | Tarefa | Status |
|---|---|---|
| 7.1 | Separar conta pendente, ativa, inativa e exclusão solicitada da disponibilidade para contratação | Pendente |
| 7.2 | Verificar CREF antes de habilitar contratação | Pendente |
| 7.3 | Aplicar regras nas buscas e APIs de solicitações/propostas | Pendente |

## Etapa 8 — Página profissional

| ID | Tarefa | Status |
|---|---|---|
| 8.1 | Disponibilizar após confirmação, observando habilitação | Pendente |
| 8.2 | Capa padrão | Pendente |
| 8.3 | Ocultar seções vazias | Pendente |
| 8.4 | Compartilhar minha página | Pendente |
| 8.5 | Visualizar minha página | Pendente |
| 8.6 | Prévia no WhatsApp | Pendente |

## Etapa 9 — Termos, privacidade e segurança

| ID | Tarefa | Status |
|---|---|---|
| 9.1 | Termos de uso | Pendente |
| 9.2 | Política de privacidade | Pendente |
| 9.3 | Aceite obrigatório | Pendente |
| 9.4 | Registrar data e versão | Pendente |
| 9.5 | Revisar segurança das APIs | Pendente |
| 9.6 | Procedimento efetivo de exclusão | Pendente |
| 9.7 | Reativação | Pendente |

## Etapa 10 — Acompanhamento administrativo

| ID | Tarefa | Status |
|---|---|---|
| 10.1 | Total de personais | Pendente |
| 10.2 | Cadastros por cidade | Pendente |
| 10.3 | Pendentes de confirmação | Pendente |
| 10.4 | Perfis incompletos | Pendente |
| 10.5 | Disponíveis para contratação | Pendente |
| 10.6 | Indicações | Pendente |
| 10.7 | Solicitações de novas cidades | Pendente |
| 10.8 | Solicitações de exclusão | Pendente |

## Etapa 11 — Testes e lançamento

| ID | Tarefa | Status |
|---|---|---|
| 11.1 | Cadastro pelo site | Pendente |
| 11.2 | Cadastro pela Beta | Pendente |
| 11.3 | Cadastro pelo celular | Pendente |
| 11.4 | Cadastros simultâneos | Pendente |
| 11.5 | Duplicidade | Pendente |
| 11.6 | Build e deploy | Pendente |
| 11.7 | Piloto com 5 a 20 profissionais | Pendente |
| 11.8 | Divulgação ao grupo de 900 | Pendente |

## Histórico — 26/11/2026

Primeira implementação: nascimento e CREF passam para Meu cadastro; sexo e Instagram opcionais em ambos os fluxos; cidade independente de academia; preservado limite de duas cidades e cinco academias. Regras administrativas permanecem. O slug ainda é obrigatório até a etapa 2. Seletor público mantém a regra existente de academias ativas. Teste de cadastro mínimo adicionado, ainda não executado. Funcionalidades existentes de autenticação e gerenciamento serão revisadas nas respectivas etapas.

**Não divulgar ou promover a main nesta fase:** geração automática de slug, termos, privacidade e separação de disponibilidade para contratação pendentes. O estado ativo ainda tem os efeitos públicos anteriores.

## Histórico — etapa 2

Endereço automático no cadastro web/Beta, sufixos numéricos e reserva condicional transacional. Personal pode editar o slug em Minha página profissional; endereços anteriores permanecem reservados ao mesmo trainerId e a página pública usa o slug atual (mantém query/hash). Alterações administrativas também preservam aliases. Cadastro convencional consulta WhatsApp existente e usa trava transacional compartilhada pelos fluxos de cadastro público. Testes de geração e regressão adicionados/ajustados, ainda não executados; validar concorrência, reenvio de confirmação e aliases em ambiente real. Não promover para main até requisitos de lançamento.

## Histórico — relacionamentos cidade e academia

Criada tabela FitpesoTrainerCities (trainerId, cityId), índice TrainersByCity e escrita transacional em paralelo à estrutura legada. Cadastro/edição web, Beta e administração sincronizam vínculos; academia opcional, cidade obrigatória. Remoção de cidade exige confirmação e verificação conservadora de pendências; adicionar academia inclui cidade, remover academia preserva cidade. Seletor público independe de academia, ainda usa a regra de personal ativo até a etapa 7. Limites atuais de duas cidades e cinco academias mantidos por compatibilidade. Migração histórica e troca das leituras para a nova tabela pendentes; nenhuma tabela antiga será apagada nesta etapa. Solicitação de nova cidade continua pendente (3.2/3.3). Build, testes e deploy não validados.
