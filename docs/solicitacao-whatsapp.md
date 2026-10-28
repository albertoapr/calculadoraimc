# Validação de solicitações da calculadora via WhatsApp

## Fluxo do aplicativo

1. A tela carrega `amplify_outputs.json` publicado junto com o frontend e lê `custom.imcApi.endpoint`.
2. Após validar o formulário e o consentimento, o frontend envia os campos necessários para `POST {endpoint}/api/imc`.
3. A função Amplify valida os dados, cria um código aleatório de 128 bits com validade de 15 minutos e guarda apenas o hash do código e sua expiração no DynamoDB. Não grava nome, idade nem dados da avaliação nessa tabela.
4. O código vai na mensagem pré-preenchida do WhatsApp. O usuário ainda precisa revisar e enviar a mensagem.

## Verificação da mensagem recebida

Quando uma mensagem da calculadora chegar, a integração WhatsApp/OpenClaw deve obter o código que veio no texto e chamar:

```http
POST {custom.imcApi.endpoint}/api/imc/verify
Content-Type: application/json

{"code":"<código recebido>"}
```

`{"valid":true}` significa que o código foi emitido pelo backend, não expirou e ainda não foi usado. A chamada o consome; não repetir a validação do mesmo código. `{"valid":false}` significa inválido, expirado ou já usado. Se a API estiver indisponível, não tratar a mensagem como verificada.

O código prova que houve uma solicitação registrada pelo backend; ele não autentica uma pessoa por si só. A integração OpenClaw deve usar como número de contato o remetente fornecido nos metadados oficiais da mensagem WhatsApp, nunca um número declarado no texto. O formulário não pede número.

O endpoint é público e protegido contra adivinhação pela entropia do código (128 bits), uso único e limite de requisições do API Gateway. Não registrar nem imprimir códigos em logs.
