# Beta ↔ FitPeso — mensagens fixas assinadas (HMAC-SHA256)

## Requisito

Uma única mensagem padrão com **o mesmo hash para todas as pessoas** pode ser distribuída e encaminhada pelo WhatsApp. Qualquer edição no texto, inclusive pontuação, maiúsculas, acentos ou inclusão de frases, invalida o hash. O usuário não recebe um novo hash para cada conversa.

A assinatura é um **HMAC-SHA256 com segredo exclusivo do backend**, não um SHA-256 público. Conhecer o texto e seu hash não permite criar um hash válido para uma mensagem diferente. A mesma assinatura pode ser usada por quantas pessoas receberem a mensagem. Isso protege **integridade do convite**, não identidade, vínculo empregatício ou titularidade do CREF.

## Gerar uma vez e compartilhar com vários profissionais

A Beta autorizada chama:

**POST /prod/api/auth/beta-onboarding-template**

Cabeçalhos: `Content-Type: application/json` e `X-Fitpeso-Verification-Secret: <segredo já utilizado pela Beta>`.

Corpo de exemplo, com o `academyId` real de uma academia ativa (consultável em `GET /prod/api/academies?city=Mesquita`):

```json
{
  "role": "trainer",
  "academyId": "<UUID_REAL_DA_ACADEMIA>"
}
```

O backend **não aceita textos arbitrários para assinar**: lê a academia da tabela DynamoDB, exige academia ativa e constrói a frase padronizada a partir dos campos do cadastro. Isso impede que a Beta assine nomes ou lugares inventados por um contato.

Resposta ilustrativa:

```json
{
  "role": "trainer",
  "academyId": "<UUID_REAL_DA_ACADEMIA>",
  "message": "Sou personal da Academia Aquatic Center, no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso.",
  "hash": "<HMAC_SHA256_REAL_GERADO_PELO_BACKEND>",
  "shareText": "Sou personal da Academia Aquatic Center, no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso.\nHash: <HMAC_SHA256_REAL_GERADO_PELO_BACKEND>"
}
```

**Não compartilhe o exemplo com placeholder.** Copie e distribua somente o `shareText` real devolvido pela API. Ele contém um hash hexadecimal de 64 caracteres calculado com o segredo real do ambiente. O mesmo `role` e `academyId` sempre geram a mesma mensagem e o mesmo hash enquanto a academia e o segredo permanecerem os mesmos.

Também é possível gerar convites genéricos com `{"role":"trainer"}` (texto `Sou personal fitpeso`) ou `{"role":"customer"}` (texto `Sou cliente fitpeso`): **também exigem hash**.

## O que o robô Beta faz quando recebe uma mensagem

1. Recebe mensagem privada de um contato, sem reescrever o texto. Ignora grupos e mensagens enviadas pela própria Beta.
2. Obtém `whatsapp` do número real do remetente e `name` do nome de exibição, quando existir.
3. Encaminha **a mensagem completa, incluindo a linha `Hash: ...`**, sem remover espaços, trocar capitalização, alterar pontuação ou recalcular o hash, à API:

```http
POST /prod/api/auth/beta-onboarding
Content-Type: application/json
X-Fitpeso-Verification-Secret: <segredo da integração>
```

```json
{
  "whatsapp": "+5521999999999",
  "name": "Nome de exibição do remetente",
  "message": "Sou personal da Academia Aquatic Center, no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso.\nHash: <HMAC_SHA256_REAL>"
}
```

4. A FitPeso confere o HMAC **antes de interpretar a intenção, consultar o banco, aplicar cooldown ou gerar qualquer link**. Ela compara os bytes do texto recebido com os bytes assinados, sem normalizar.
5. Se o hash for inválido, ausente ou não corresponder ao texto: **HTTP 422**, nenhuma criação de cadastro e nenhum link. Beta informa que é preciso encaminhar a mensagem original sem editar.
6. Se for válido: a API verifica o cadastro do remetente e retorna `replyText`, `loginLink` e `loginLinkExpiresAt`. A Beta envia exatamente o `replyText` ao **mesmo remetente**. Esse link é **individual**, de uso único e válido por até 5 minutos, enquanto o **hash do convite é fixo e reutilizável**.

## Exemplos de edição que devem ser rejeitados

- Alterar `Mesquita` para `Canadá`.
- Adicionar frases ou declarações pessoais.
- Substituir `Aquatic Center` por outra academia.
- Alterar ou substituir a linha `Hash:`.
- Enviar somente a frase, sem hash.
- Enviar um SHA-256 puro do texto alterado no lugar do HMAC.

O hash foi calculado usando `HMAC-SHA256(segredo, "fitpeso.beta.onboarding-message.v1\\n" + texto)`. O prefixo protege o domínio de uso do segredo. Nunca incluir o segredo nos logs, mensagens ou frontend.

## Segurança e limitações

- **O hash não identifica o usuário e não expira individualmente.** É intencionalmente o mesmo para todos os destinatários de um convite compartilhado.
- O número de WhatsApp vem do evento do provedor, nunca do corpo da mensagem. O nome de exibição pode ser editado pelo próprio usuário.
- O HMAC **não prova** que alguém trabalha naquela academia ou possui CREF. A validação dessa informação exige um processo separado.
- Para revogar todos os convites do ambiente, é possível rotacionar o segredo, mas isso também afetará as rotas que usam o mesmo segredo compartilhado; planeje a rotação com a integração Beta.
- Não há código de confirmação por pessoa na mensagem fixa; **somente o link posterior é individual e temporário**.
- A atualização precisa ser implantada na FitPeso e no serviço externo do robô Beta. A alteração do repositório FitPeso, isoladamente, não altera o listener do WhatsApp.

## Critérios de aceite

- Dois remetentes diferentes podem encaminhar o mesmo `shareText` e ambos recebem seus próprios links seguros.
- Texto ou hash alterado, mesmo um único caractere: HTTP 422 e **nenhum cadastro**.
- Sem hash: HTTP 422.
- A mensagem original permanece compartilhável por tempo indeterminado, enquanto a academia permanecer válida e o segredo não for rotacionado.
- A página de cadastro profissional mantém o pré-preenchimento de academia, cidade, WhatsApp e nome de exibição; Instagram e CREF podem ser preenchidos mais tarde.
