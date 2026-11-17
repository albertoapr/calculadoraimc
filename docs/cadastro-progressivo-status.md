# Cadastro progressivo FitPeso — implementação em andamento

## Implementado nesta branch

- Novo módulo isolado `amplify/functions/imc-submit/progressive-phone.ts`, com abertura de verificação WhatsApp antes de coletar dados pessoais.
- Validação inicial de WhatsApp (E.164) e verificação de cadastro já existente nas tabelas de clientes e de personais, sem revelar dados pessoais.
- Código efêmero (15 minutos) vinculado ao token aleatório de sessão; o navegador deve oferecer ao usuário um link para **ele enviar a mensagem à Beta**, sem recebimento de código por WhatsApp.
- Confirmação de WhatsApp somente pelo webhook autenticado da Beta, com checagem do número do remetente e atualização condicionada no DynamoDB.
- Consulta de estado vinculada à sessão, que só retorna sucesso após confirmação do backend.
- Endpoints `POST /api/signup/start-phone`, `POST /api/signup/status-phone` e `POST /api/signup/verify-phone` adicionados ao API Gateway.
- Preservação do login e do cadastro existentes enquanto os demais passos não estão prontos.

## PENDENTE — branch NÃO pronta para produção

1. Criar o formulário único progressivo e substituir, com testes, as duas telas legadas.
2. Implementar confirmação de e-mail por link de uso único e envio/reenvio com limites.
3. Integrar verificação de credencial Google **no backend**, não apenas decodificação no browser.
4. Criar conclusão transacional do cadastro após confirmação do WhatsApp, e-mail e/ou Google; a verificação inicial **ainda não autoriza criar um cadastro**.
5. Definir identidade única compartilhada para cliente e personal e vinculação autenticada de papel quando o WhatsApp já estiver cadastrado. A simples coincidência de telefone não autoriza vinculação.
6. Criar cadastro mínimo com CREF condicional e edição posterior de perfil de personal.
7. Garantir unicidade atômica de WhatsApp/e-mail/Google em todos os fluxos e migrar vínculos existentes com segurança.
8. Testes unitários, integração AWS e testes ponta a ponta com Beta.

**Não mesclar esta branch na `main` antes de concluir os itens acima.** Nenhuma tabela ou GSI existente foi alterada por este início de implementação.
