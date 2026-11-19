# Integração Beta ↔ FitPeso: confirmação WhatsApp

> **Templates oficiais atualizados:** a FitPeso utiliza apenas dois convites assinados: `Quero me inscrever em fitpeso.com.br como personal para receber pedidos de acompanhamento de treino.` e `Quero me inscrever em fitpeso.com.br como cliente para encontrar um personal trainer e solicitar acompanhamento de treino.`. Os dois devem conter a linha `Hash:` assinada com HMAC. Os exemplos antigos abaixo servem apenas como histórico e **não são aceitos para cadastro direto pela Beta**. Consulte [os dois templates oficiais](./beta-cadastro-mensagem-assinada.md).

> **Atualização obrigatória — cadastro por mensagem compartilhável:** o endpoint `POST /api/auth/beta-onboarding` agora exige que a mensagem original tenha um **HMAC-SHA256** válido, na linha `Hash: ...`. **Mensagens sem hash ou editadas serão rejeitadas (HTTP 422).** As frases sem hash apresentadas abaixo são apenas o conteúdo-base; **não devem mais ser enviadas isoladamente para iniciar cadastro**. O mesmo convite assinado pode ser compartilhado com qualquer número de pessoas. Procedimento atualizado: [mensagem fixa com HMAC](./beta-cadastro-mensagem-assinada.md).


O FitPeso prepara mensagens para o WhatsApp da Beta. A automação que recebe as mensagens **não está implementada por este documento**: ela precisa ser atualizada no serviço da Beta para extrair os metadados reais do remetente e chamar as rotas descritas.

## Cadastro de cliente

Após receber a mensagem `Confirmar cadastro FitPeso <codigo>`, a Beta deve identificar **o número de origem real da mensagem** pelo provedor do WhatsApp, e não confiar em um número digitado no corpo da mensagem. Deve também extrair o nome de exibição fornecido pelo provedor, quando disponível. O texto pode trazer `Nome:` informado pelo cliente como alternativa, mas não comprova identidade civil.

Chamar `POST /api/customers/verify-whatsapp` com cabeçalho `X-Fitpeso-Verification-Secret` (o segredo já configurado na Lambda):

```json
{
  "whatsapp": "+5521999999999",
  "code": "CODIGO_DA_MENSAGEM",
  "name": "Nome recebido pela Beta"
}
```

Resposta após validação bem-sucedida:

```json
{
  "verified": true,
  "whatsapp": "+5521999999999",
  "name": "Nome recebido pela Beta"
}
```

O nome enviado pela Beta deve ser tratado como **nome declarado ou de exibição**, e não como certificação do titular da linha. O FitPeso verifica a posse do WhatsApp por meio do código enviado do próprio número. Se `name` vier vazio ou inválido, o nome informado no cadastro é preservado. A rota `POST /api/customers/verification-status` usada pelo navegador também retorna o nome associado ao cadastro *somente após a confirmação*.

## Login de cliente ou personal

As mensagens de login começam com `Confirmar login FitPeso <codigo>`. A Beta deve obter o número de origem real da mensagem e encaminhar `whatsapp`, `code` e `name` (se houver) para:

- `POST /api/customers/verify-login` — roteia o código de login do cliente ou personal e retorna o nome registrado da conta autenticada;
- ou `POST /api/trainers/verify-login` para um login exclusivo de personal.

As rotas requerem o mesmo cabeçalho secreto e continuam vinculando o código ao número de origem da mensagem. Nas confirmações de login bem-sucedidas, a resposta traz `verified`, `whatsapp` e `name` (nome cadastrado), além de `whatsappDisplayName` quando a Beta envia um nome de exibição válido. **O nome cadastrado não é sobrescrito durante o login**: o nome de exibição do provedor pode ser diferente do nome declarado na conta.

### Novo retorno: link seguro

Na branch `develop`, após `verified: true`, a API retorna **somente à integração Beta autenticada com o segredo**:

```json
{
  "verified": true,
  "whatsapp": "+5521999999999",
  "name": "Cliente ou Personal",
  "loginLink": "https://develop.fitpeso.com.br/?whatsappLoginCode=TOKEN_SEGURO",
  "loginLinkExpiresAt": 1795050000
}
```

A Beta deve enviar **somente para o número real remetente** (e nunca para o número digitado na mensagem):

> Login FitPeso confirmado! Clique no link abaixo para entrar ou aguarde a tela de login atualizar automaticamente. O link é válido por até 5 minutos e funciona uma única vez.
>
> [loginLink retornado pela API]

Não gere links no código da Beta. Não envie o segredo, `sessionToken` ou códigos completos para logs. Se `verified: true` não trouxer `loginLink` (por exemplo, link já consumido), informe apenas que a tela original pode atualizar ou que o usuário pode solicitar um novo login.

- O link é derivado via HMAC do desafio e do segredo interno, armazenado no DynamoDB somente como hash.
- Cada confirmação emite um link de **uso único**, com até **5 minutos** de validade, somente para a origem da branch configurada no backend.
- `POST /api/auth/verify-whatsapp-link` consome o token **atomicamente** e emite outra sessão válida para o dispositivo que abriu o link. GET/preview **não consome**.
- O navegador elimina `whatsappLoginCode` da barra de endereço **antes** de validar a sessão.
- A tela original continua consultando `/customers/login-status` ou `/trainers/login-status` como antes. Essa confirmação é a prioridade: não depende da entrega ou leitura da mensagem de resposta do Beta. O link é um meio alternativo de entrar caso o usuário saia da tela ou prefira voltar depois.

**A mudança no serviço externo da Beta é obrigatória.** Fazer o deploy da FitPeso isoladamente não altera as respostas que o robô envia. O WhatsApp Web automatizado permanece uma integração não oficial sujeita a bloqueio.

## Cadastro de personal

Para a mensagem de confirmação de cadastro do personal, chamar `POST /api/trainers/verify-whatsapp` com os mesmos campos `whatsapp`, `code` e `name`, utilizando o número real do remetente. A resposta inclui `verified`, `slug`, `whatsapp` e `name` registrado do profissional. O nome profissional não é sobrescrito automaticamente pelo nome de exibição.

## Proteções obrigatórias

- Nunca expor nem incorporar o segredo em código do navegador ou na mensagem de WhatsApp.
- Confirmar que o remetente verdadeiro corresponde ao telefone vinculado ao código; não confiar em número digitado na mensagem.
- Não tratar o nome de exibição como dado verificado de identidade civil.
- Evitar logs com códigos completos, nomes ou telefones; tratar dados sob a LGPD.
- Testar os três fluxos depois de atualizar e implantar a automação da Beta e a Lambda, incluindo código expirado, número diferente e tentativas repetidas.

## Observações sobre cadastro progressivo

O cadastro inicial do cliente agora não exige data de nascimento. O e-mail é opcional e pode ser preenchido na segunda etapa, mas, **por enquanto, o cadastro da conta ainda exige um WhatsApp**, pois ele é a chave primária da tabela de clientes e o método atual de ativação. O login por e-mail de contas existentes usa link de confirmação e dispensa a data de nascimento. A data é solicitada apenas na confirmação do pedido de atendimento.

## Cadastro e login iniciados diretamente no WhatsApp da Beta

A API FitPeso está preparada para receber os **comandos opt-in** iniciados pelo próprio contato:

- `Sou cliente fitpeso`
- `Sou personal fitpeso`

A Beta deve identificar o **telefone real do remetente** no evento recebido do WhatsApp Web, ignorar grupos e mensagens enviadas pelo próprio robô e chamar:

**POST `/api/auth/beta-onboarding`**, com o cabeçalho secreto `X-Fitpeso-Verification-Secret` já utilizado na integração. Corpo JSON:

```json
{
  "whatsapp": "+5521999999999",
  "message": "Sou personal fitpeso",
  "name": "Nome exibido no perfil do WhatsApp (se houver)"
}
```

A resposta `200 OK` fornece `role`, `action`, `registered`, `loginLink`, `loginLinkExpiresAt` e **`replyText`**. **A Beta deve responder ao mesmo número com `replyText`** retornado pela FitPeso, sem criar links ou colocar códigos ou segredos nos logs.

| Comando | Condição | Ação |
| --- | --- | --- |
| `Sou cliente fitpeso` | Cliente novo | Cria cadastro ativo com o WhatsApp verificado e retorna link de login. Dados complementares poderão ser informados depois. |
| `Sou cliente fitpeso` | Cliente ativo | Não duplica perfil; retorna link de login. |
| `Sou personal fitpeso` | Personal ativo e confirmado | Retorna link seguro de login. |
| `Sou personal fitpeso` | Personal novo | Inicia cadastro e devolve link seguro para completar nome, sexo, cidade, Instagram e slug. Ao concluir, ativa o perfil sem outra confirmação WhatsApp e entra automaticamente. |
| `Sou personal fitpeso` | Personal pendente, inativo ou conflito | Bloqueia duplicação automática e orienta procurar suporte (HTTP 409). |

O cadastro de personal **não é ativado apenas pela frase**: o link permite preencher os dados obrigatórios. A Beta confirma o número ao encaminhar a mensagem original autenticada. O nome do WhatsApp é **apenas um nome de exibição**, não comprova identidade civil. Se o nome do cliente não estiver disponível, o cadastro usa o nome provisório `Cliente FitPeso`, editável posteriormente.

**Links:** HTTPS com o domínio da branch (`develop.fitpeso.com.br` na develop), token único e opaco, uso único, duração de 5 minutos; o navegador remove o token da URL antes de consultar a API. O formulário de personal recebe uma sessão temporária vinculada ao telefone por 15 minutos e também de uso único ao concluir. Pré-visualizações GET não consomem links.

Rotas:

- `POST /api/auth/beta-onboarding` — exclusiva da Beta, exige o segredo compartilhado.
- `POST /api/auth/beta-trainer-signup/redeem` — abre o cadastro profissional por link seguro.
- `POST /api/auth/beta-trainer-signup/complete` — valida os campos, consome a sessão e ativa o perfil.

A API limita uma solicitação de cada tipo por WhatsApp a cada 30 segundos (HTTP 429). A Beta deve respeitar esse limite e nunca repetir automaticamente uma mensagem em loop. O fluxo de login tradicional no navegador **permanece imediato**, independente da entrega da mensagem de resposta.

**Atenção à implantação:** o repositório `calculadoraimc` possui a FitPeso, mas não o listener externo do WhatsApp Web da Beta. O deploy da FitPeso configura os endpoints, o cadastro e os links, porém **o robô precisa ser ajustado no serviço próprio** para reconhecer as duas frases, chamar a rota protegida e enviar `replyText`. Sem isso, as frases sozinhas não executarão o cadastro.

Os novos perfis de personal iniciados pela Beta usam uma trava transacional permanente por WhatsApp para bloquear cadastros simultâneos com o mesmo número. O token temporário de preenchimento é descartado ao cancelar a tela.

### Cadastro de professora/professor por mensagem única

Exemplo de mensagem original recebida do contato:

```text
Sou professora da Academia Aquatic Center, no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso.
```

A Beta deve encaminhar à mesma rota secreta `POST /api/auth/beta-onboarding` o campo `message` original, o número do remetente obtido do evento WhatsApp e `name` como nome de exibição do perfil (se disponível). A FitPeso identifica a intenção explícita de cadastro, o tipo `PERSONAL`, a academia, o bairro e a cidade. A expressão "professora" sugere `feminino` para pré-preenchimento, mas não constitui validação do sexo; o campo pode ser alterado.

Para preencher a academia, o backend consulta a tabela real de academias **ativas** pela cidade e compara nome e bairro. Só faz associação automática quando há **uma correspondência única**. Sem correspondência ou com ambiguidade, a tela orienta selecionar/conferir manualmente — nunca cria academia nova ou presume uma correspondência.

A Beta envia exatamente o campo `replyText` da API para o mesmo contato, contendo um link de uso único com formato:
`https://develop.fitpeso.com.br/cadastro/personal?betaSignupCode=TOKEN`.
Ao clicar, o navegador abre o formulário de cadastro de personal, consome a prova por POST e preenche nome de exibição, telefone confirmado, cidade e academia identificada. Instagram e CREF são **opcionais para o cadastro iniciado pela Beta**, e podem ser adicionados depois. O link expira em 5 minutos; a sessão temporária do formulário expira em 15 minutos e o telefone não precisa de outra validação.

A automação do WhatsApp Web da Beta **não faz parte deste repositório**. Deve ser adaptada para reconhecer essa mensagem natural, encaminhá-la à rota autenticada e responder com o link. O deploy do backend FitPeso sozinho não faz a Beta responder.
