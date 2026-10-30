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
4. Configure `TRAINER_ROSTER_JSON` como secret com a lista de e-mails dos profissionais aprovados. Exemplo inicial: `[]`. Cada item deve ter `email`, `cities` e `active: true`; inclua somente profissionais ativos e validados.
5. Dispare ou repita o deploy do branch e aguarde frontend e backend implantados. Acesse o domínio HTTPS disponibilizado em **Hosting**.

## Desenvolvimento local

```sh
npm ci
npm run dev
```

O cálculo funciona localmente. O envio por e-mail depende do backend implantado e do secret `GMAIL_PASSWORD` configurado no Amplify. A senha é usada exclusivamente pela Lambda e nunca deve ser incluída no código ou no frontend.

O e-mail sempre vai para a Beta. A função também envia mensagens individuais aos endereços ativos em `TRAINER_ROSTER_JSON` que atendem a cidade informada; o código de validação é enviado somente à Beta. A lista não deve ser exposta no frontend nem versionada no repositório.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, objetivo e disponibilidade são enviados à Beta após consentimento explícito. Peso, altura, sexo e IMC permanecem no cálculo local e não são incluídos no e-mail da solicitação.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
