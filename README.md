# Calculadora de IMC da Beta

Aplicação em Vue 3 + Vite preparada para deploy pelo AWS Amplify Gen 2. O IMC é calculado no navegador. Após a avaliação, a opção **Receber ajuda de um personal** abre os campos de contato. Ao enviar, o backend valida os dados e encaminha a solicitação para o e-mail da Beta pelo Gmail SMTP.

## O que é implantado

- Frontend Vue hospedado pelo Amplify Hosting.
- API Gateway e função Lambda provisionados pelo Amplify Gen 2 para validar solicitações e enviar e-mails.
- DynamoDB armazena temporariamente os códigos de confirmação usados no fluxo.

## Implantar pelo Amplify

1. No AWS Amplify, escolha **New app → Host web app → GitHub** e conecte o repositório `albertoapr/calculadoraimc` (branch `main`).
2. O Amplify detecta `amplify.yml`. O backend é provisionado primeiro; em seguida o build publica `dist/`.
3. Configure o secret `GMAIL_PASSWORD` nas configurações de secrets do branch conectado. Use uma senha de app do Google, nunca a senha normal da conta.
4. Dispare ou repita o deploy do branch e aguarde frontend e backend implantados. Acesse o domínio HTTPS disponibilizado em **Hosting**.
5. Consulte `custom.trainerDirectory.tableName` em `amplify_outputs.json` e abra essa tabela no DynamoDB, na região indicada em `custom.imcApi.region`. Adicione um item para cada cidade atendida, com `city` (String), `trainerId` (String), `email` (String) e `active` (Boolean `true`).

## Desenvolvimento local

```sh
npm ci
npm run dev
```

O cálculo funciona localmente. O envio por e-mail depende do backend implantado e do secret `GMAIL_PASSWORD` configurado no Amplify. A senha é usada exclusivamente pela Lambda e nunca deve ser incluída no código ou no frontend.

O e-mail sempre vai para a Beta. A função também consulta a tabela privada `FitpesoProfessionals` e envia mensagens individuais aos profissionais ativos da cidade; o código de validação é enviado somente à Beta. Se um profissional atende duas cidades, adicione um item para cada cidade.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, objetivo e disponibilidade são enviados à Beta após consentimento explícito. Peso, altura, sexo e IMC permanecem no cálculo local e não são incluídos no e-mail da solicitação.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
