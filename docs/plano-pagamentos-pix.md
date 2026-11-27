# Pagamentos Pix e confirmação de atendimento — plano de implementação

## Escopo e isolamento

- Branch: `feature/pagamentos-pix`, criada a partir da `main`.
- Preservar a reestruturação em andamento na `develop` e o fluxo publicado na `main`.
- Não alterar atendimentos ou aceites históricos. Não liberar o novo fluxo em produção antes dos testes integrados e da revisão de compatibilidade com a reestruturação.
- O Pix será destinado diretamente ao personal. A FitPeso não receberá nem repassará recursos nesta primeira versão.

## Regras de negócio acordadas

1. O cliente escolhe uma proposta e abre um popup com os dados Pix do personal, valor total, sinal mínimo de 10% e botão para enviar comprovante pelo WhatsApp da Beta.
2. O cliente pode pagar o sinal, um valor parcial maior ou o valor integral. Valores acima do total devem ser tratados como divergência, sem aceite automático.
3. O clique registra uma intenção de contratação, não um aceite definitivo. A proposta escolhida fica reservada enquanto o pagamento estiver em andamento.
4. A Beta recebe imagem ou PDF, extrai os dados do comprovante e registra o documento na FitPeso. A análise documental não comprova liquidação bancária.
5. A Beta notifica o personal, reutilizando o mecanismo de notificações existente, com um link seguro para visualizar o comprovante e confirmar ou informar divergência. O personal deve conferir o crédito na própria conta.
6. Somente depois da confirmação do personal a API confirma o pagamento, aceita definitivamente a proposta, encerra as alternativas e cria o atendimento. Operações idempotentes e atômicas impedem duplicação.
7. Cliente e personal recebem confirmação; a tela do cliente acompanha o status automaticamente. O comprovante permanece privado.
8. A cobrança da comissão da plataforma não será automatizada nesta fase; a política de cobrança ainda precisa de decisão.

## Desenho técnico proposto

### Cadastro Pix

Seção privada “Dados para recebimento”: tipo de chave, chave, nome do titular e banco (opcional). A chave será exigida para envio de novas propostas, não para o cadastro inicial. Dados não devem integrar a listagem pública. Preservar os dados do destinatário e o preço no momento da intenção; alterações posteriores não modificam um pagamento em andamento.

### Pagamentos e comprovantes

Tabela DynamoDB de pagamentos, com identificadores de solicitação, proposta/profissional e cliente; total do contrato, valor mínimo, valor declarado e valor confirmado em centavos; status, referência privada ao comprovante no S3, EndToEndId, timestamps, responsável pela confirmação e trilha de auditoria. Prever pagamentos adicionais futuros e unicidade transacional do EndToEndId. Proteger também contra reutilização do mesmo arquivo; o hash do arquivo sozinho não garante autenticidade.

Bucket S3 privado, criptografia, acesso autorizado de curta duração, tamanho e tipos validados, política de retenção a definir. Não armazenar binários no DynamoDB, nem publicar URLs permanentes ou dados bancários nos logs. Tratar comprovantes e chaves Pix como dados pessoais.

### Integração Beta

Comandos de produção e homologação (após configuração explícita do ambiente):

```text
/pagamento <requestId> <codigoSeguranca>
/pagamento develop <requestId> <codigoSeguranca>
```

Código aleatório de alta entropia, armazenado como hash, com validade, vinculado ao cliente, à proposta e ao ambiente. Validar o número real do remetente, limitar tentativas e consumir o código atomicamente ao iniciar a sessão de envio. Permitir reenvios autorizados do comprovante sem duplicar pagamentos. A Beta não tem autorização para confirmar recebimento financeiro. Usar autenticação serviço a serviço, sem expor segredo ao navegador.

A branch feature não deve usar automaticamente a API de produção ou de develop. Antes dos testes, configurar explicitamente frontend, backend, tabelas, bucket e roteamento da Beta em ambiente isolado (ou ambiente de testes autorizado).

Rotas candidatas (contrato a revisar antes de implementar):

- POST /api/requests/{requestId}/accept-intent — cliente autenticado cria/recupera intenção.
- POST /api/payments/beta/lookup — Beta consulta por código e remetente.
- POST /api/payments/beta/receipt — Beta registra comprovante e dados extraídos; upload privado mediante autorização específica.
- GET /api/payments/{paymentId}/status — acesso restrito ao cliente/profissional relacionado.
- POST /api/payments/{paymentId}/confirm — personal autenticado confirma o recebimento ou registra divergência.

O aceite direto existente em POST /api/requests/{requestId}/accept não poderá ser usado para contornar a confirmação de pagamento quando o novo fluxo estiver ativo. Reutilizar a transação de aceite existente, ajustando suas condições e incluindo a confirmação de pagamento; notificações apenas após persistência bem-sucedida.

### Estados

| Evento | Proposta | Pagamento | Atendimento |
| --- | --- | --- | --- |
| Proposta enviada | OPEN | — | — |
| Intenção de aceite | Aguardando pagamento | PENDING | — |
| Comprovante recebido | Reservada | RECEIVED / UNDER_REVIEW | — |
| Análise compatível | Aguardando personal | AWAITING_TRAINER_CONFIRMATION | — |
| Divergência | Reservada em análise | DISPUTED | — |
| Personal confirma crédito | ACCEPTED | CONFIRMED | INICIADO |

Não encerrar as demais propostas antes da confirmação definitiva. Coordenar reserva, vencimento e TTL para não perder comprovantes ou solicitações durante análise. Tratar cancelamento, expiração, comprovante tardio e pagamentos divergentes sem criar atendimento indevidamente.

### Valores

O backend calcula o mínimo de 10% em centavos, arredondando para cima se necessário. Para recorrência, confirmar que o preço mensal multiplicado pela duração representa o total; para aulas avulsas, definir explicitamente se o preço ofertado representa o pacote ou cada aula. O código atual usa monthlyPrice; não inferir valores ambíguos. Registrar saldo remanescente. Comissão e sua cobrança serão tratadas separadamente.

## Etapas de implementação

- [x] Criar branch isolada e registrar o plano.
- [ ] Adicionar dados Pix ao cadastro privado do personal, com testes.
- [ ] Criar tabela de pagamentos e bucket privado de comprovantes.
- [ ] Implementar intenção de aceite, reserva e código de segurança.
- [ ] Criar popup de pagamento e atualização de status.
- [ ] Implementar APIs autenticadas para a Beta e documentar o contrato.
- [ ] Adaptar automação externa da Beta para recebimento, análise e envio de notificações.
- [ ] Criar tela do personal para conferir comprovante e confirmar crédito ou divergência.
- [ ] Integrar confirmação transacional do pagamento e início do atendimento.
- [ ] Criar acompanhamento administrativo e tratamento de divergências.
- [ ] Testar em ambiente isolado; revisar compatibilidade com a reestruturação da develop.
- [ ] Após autorização, integrar à branch de destino e publicar.

## Decisões pendentes / sugestões não aprovadas

- Reserva de 24h; preservar a reserva se comprovante for recebido no prazo.
- Código válido por 30 minutos, renovável mediante autenticação.
- PDF, JPEG e PNG; máximo de 10 MB.
- Política de contestação, cancelamento, devolução e retenção dos comprovantes.
- Política de comissão nesta etapa.
- Contrato de preço para aulas avulsas e ambientes/domínios de teste da Beta.

## Critérios de aceite

- Não criar atendimento antes da confirmação do personal correto.
- Cobrir sinal mínimo, pagamento parcial, integral, insuficiente e excedente.
- Rejeitar acesso indevido, código expirado ou reutilizado, remetente errado, comprovante duplicado, confirmação por outro profissional e tentativas concorrentes.
- Permitir fechar/reabrir popup e recuperar status sem duplicar intenção.
- Notificar cliente e personal de forma idempotente; não expor comprovantes publicamente.
- Preservar atendimentos existentes e evitar alterações nas branches main e develop durante a implementação isolada.
