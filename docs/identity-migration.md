# Migração aditiva de identidade – FitPeso

> Implementação restrita à branch `develop`. Não aplicar em `main` sem validar o build, as permissões e os perfis.

## Estruturas

- **FitpesoPessoa** (`pessoa_id`): identidade civil/comum.
- **FitpesoPessoaIdentificacao** (`identificationKey`): chaves únicas `GOOGLE#sub`, `EMAIL#normalizado` e `WHATSAPP#+55...`, ligadas a uma `pessoa_id`. Índice `IdentificacoesByPessoa`.
- **FitpesoUsuario** (`user_id`): um registro por pessoa e papel, com `pessoa_id`, `tipo_usuario_id` e `tipo`. Índice `UsuarioByPessoa`.
- **FitpesoTipoUsuario**: códigos reservados `1=ADMIN`, `2=CLIENTE`, `3=PERSONAL`.
- **FitpesoCustomerV2** (`customer_id`): `user_id`, `nome`, `email`, `googlePhotoUrl`, `sexo`, `altura_cm` e contato opcional. O campo `legacyWhatsapp` existe somente para perfis migrados. Índice `CustomerByUsuario`.
- **FitpesoPersonalV2** (`personal_id`): `user_id`, `legacyTrainerId`, `cidade`. Índice `PersonalByUsuario`.

As tabelas antigas continuam existentes. `pessoa_id`, `user_id` e `identitySource` são acrescentados aos registros antigos sem excluir dados.

## Comportamento

1. A rota `GET /api/auth/me`, com **Bearer** válido, tenta primeiro identificar Google pelo `sub` validado na tabela de identificações, depois recupera todos os usuários de uma pessoa.
2. Na primeira autenticação de cliente legado, a rota `POST /api/customers/profile` ativa o backfill aditivo (uma vez que a Lambda validou previamente a autenticação existente).
3. Na primeira autenticação WhatsApp de personal, `POST /api/trainers/profile` registra `pessoa`, `usuario` e `personal` no novo modelo.
4. O cliente recebe `profile.identity = { pessoaId, usuarios }` e `profile.identityStatus = 'ready' | 'pending'`. A aplicação guarda os perfis na sessão Pinia.
5. Falha na migração não bloqueia a autenticação antiga; o erro é registrado e `identityStatus='pending'`. Isso NÃO libera novos privilégios.
6. Perfis ADMIN só podem ser criados com base no `isAdmin=true` da tabela legada, lida pelo servidor após autenticação.

## Cadastro canônico sem WhatsApp (etapa atual)

- O cadastro Google novo valida o ID token no backend, cria/vincula a `pessoa` e suas identificações verificadas `GOOGLE#sub` e `EMAIL#email` e cria o papel `CLIENTE` em `usuario`.
- O novo cliente é criado **apenas** em `FitpesoCustomerV2` com `customer_id` derivado de `pessoa_id`, sem número como chave e sem registro fictício `GOOGLE#sub` no atributo `whatsapp` da tabela legada.
- `GET/POST /api/customers/profile` reconhece esse perfil sem WhatsApp. A edição passa a usar `customer_id` na tabela V2.
- `FitpesoUserRequests` ganha um índice aditivo `RequestsByCustomerId`; cada nova solicitação inclui `customerId` e o número fornecido no momento do pedido fica apenas em `clientPhone`. Consultas e autorizações utilizam o `customerId` para clientes V2, com fallback ao número previamente verificado para legados.
- A tabela `FitpesoRequestPhoneLocks` ainda usa o **telefone de contato da solicitação**, não a chave de identidade do cliente. Mudar essa chave é uma evolução separada.
- Um número **digitado** no pedido não é automaticamente gravado em `pessoa_identificacao` como `WHATSAPP` verificado. Esse vínculo só pode ocorrer após prova do titular pelo canal apropriado.
- A troca de perfil em sessão V2 usa uma sessão de cliente associada a `pessoa_id`, `user_id` e `customer_id`, com conferência do vínculo no backend.
- Registros antigos em `FitpesoCustomers` mantêm a chave `whatsapp`, sem renomear a tabela ou alterar os dados históricos. Cadastros provisórios `GOOGLE#sub` criados em versões anteriores são migrados progressivamente após login Google validado, sem exclusão do registro original.

**Cautela:** a etapa atual não executa migração em massa; a consistência referencial entre dados antigos continua mantida por compatibilidade. Deploy requer validar permissões IAM e criação do índice GSI antes de habilitar fluxos dependentes dele.

## Segurança da conciliação

- Google prova a posse do **Google sub** e de um e-mail verificado; **não** prova a posse do WhatsApp cadastrado.
- WhatsApp só pode ser usado na tabela de identificação após confirmação da sessão pelo mecanismo existente.
- Um cadastro de cliente vinculado por Google não é automaticamente mesclado com uma pessoa associada ao WhatsApp de um personal, ainda que os números coincidam.
- Se já existir vínculo a outra pessoa, a migração marca o caso como pendente e não move o registro.
- Os campos já existentes, as solicitações e as propostas continuam com os mesmos identificadores. Nenhum script de exclusão ou migração em massa é executado no deploy.
- Identificações e perfis são criados com condições DynamoDB que evitam trocas de titular; a criação de pessoa e sua primeira identificação é atômica.
- A sincronização é progressiva, por login efetivamente validado. Cadastros que não efetuarem login permanecem intactos.

## Validação e implantação

Antes de liberar na `main`:
1. Executar `npm run build` e `npm test`.
2. Confirmar deploy Amplify da `develop` e nova tabela no DynamoDB.
3. Confirmar login Google repetido e idempotência de vínculos.
4. Confirmar login cliente e personal com o mesmo WhatsApp *efetivamente verificado* e retorno de ambos os papéis.
5. Confirmar que o Google que só conhece o e-mail de um cliente não obtém acesso ao papel de personal pelo número.
6. Confirmar que ADMIN não é concedido por parâmetros enviados pelo frontend.
7. Confirmar que solicitações e propostas antigas continuam acessíveis.

## Limitações atuais

- Esta etapa **não** migra todos os cadastros de uma vez; a migração ocorre por login verificado.
- A alternância de perfil sem novo login ainda dependerá da futura autorização unificada para operações de CLIENTE/PERSONAL. Armazenar ambos os perfis no frontend não equivale a conceder ambos os tokens antigos.
- Conflitos de titularidade entre Google e WhatsApp exigem fluxo explícito de dupla confirmação (ambos os meios na mesma sessão) antes da mesclagem.
- Índices secundários DynamoDB possuem consistência eventual. Os perfis recém-criados pela própria operação são incluídos explicitamente no primeiro retorno.
- Manter backups e rotas legadas até concluir a migração em produção.
