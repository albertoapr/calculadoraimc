# Integração Beta ↔ FitPeso: confirmação WhatsApp

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

As rotas requerem o mesmo cabeçalho secreto e continuam vinculando o código ao número de origem da mensagem. O nome cadastrado não deve ser sobrescrito silenciosamente a cada login: o nome de exibição recebido pelo provedor pode ser diferente do nome declarado na conta.

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
