# Beta ↔ FitPeso — dois templates de cadastro fixos com HMAC-SHA256

## Templates oficiais

Existem **somente dois templates genéricos**, idênticos para todos os usuários. A API gera a assinatura estável `HMAC-SHA256` usando um segredo do servidor, separado do corpo compartilhado.

**Personal trainer:**

```text
Quero me inscrever em fitpeso.com.br como personal para receber pedidos de acompanhamento de treino.

Hash: <HASH_PERSONAL_GERADO_PELA_API>
```

**Cliente:**

```text
Quero me inscrever em fitpeso.com.br como cliente para encontrar um personal trainer e solicitar acompanhamento de treino.

Hash: <HASH_CLIENTE_GERADO_PELA_API>
```

Os marcadores **não são hashes reais** e não devem ser enviados. A Beta deve gerar o convite assinado pela API e compartilhar a propriedade `shareText`, que contém a mensagem correta com sua assinatura real.

## Emissão dos dois modelos

A Beta, autenticada pelo segredo da integração (`X-Fitpeso-Verification-Secret`), chama:

`POST /prod/api/auth/beta-onboarding-template`

`Content-Type: application/json`

Para personal: `{"role":"trainer"}`

Para cliente: `{"role":"customer"}`

A resposta fornece `role`, `message`, `hash` e `shareText`. A assinatura e o `shareText` são **sempre os mesmos** para o mesmo template e segredo; não dependem do remetente, da data, da academia ou da cidade. A API **não aceita outro texto ou `academyId`**.

## Processamento do WhatsApp

Ao receber uma mensagem privada, a Beta extrai o número real do remetente, `name` de exibição (quando disponível) e envia o corpo original integral, inclusive a linha `Hash: <hex64>`, para:

`POST /prod/api/auth/beta-onboarding`

com o mesmo cabeçalho secreto. Exemplo do JSON enviado:

```json
{
  "whatsapp": "+5521999999999",
  "name": "Nome de exibição",
  "message": "Quero me inscrever em fitpeso.com.br como personal para receber pedidos de acompanhamento de treino.\nHash: <HASH_REAL_GERADO_PELA_API>"
}
```

**Não recalcular o hash no robô, não normalizar o texto e não compartilhar o segredo.** Qualquer alteração no texto ou no hash retorna `HTTP 422`; a API não cria cadastro ou link. Mesmo um convite antigo válido, fora dos dois templates oficiais, é rejeitado. Mensagens repetidas no mesmo WhatsApp são limitadas por cooldown de 30 segundos.

A API confere primeiro a assinatura HMAC e o texto aprovado. Se válidos, cria ou localiza o cadastro do cliente e envia link individual de login; para personal novo, devolve link de uso único que abre o formulário de cadastro profissional, sem academia predeterminada. O usuário poderá informar cidade, academia, Instagram e CREF depois. O link de login/cadastro expira em até 5 minutos, mas **o hash da mensagem fixa não expira por pessoa e é reutilizável entre várias pessoas**.

O texto assinado fornece **integridade**, não comprovação de identidade civil, habilitação profissional ou vínculo a uma academia. A Beta nunca deve confiar em números de telefone digitados no texto. A automação WhatsApp externa precisa ser atualizada para encaminhar os dois modelos com o hash; o deploy da FitPeso isoladamente não atualiza o robô.
