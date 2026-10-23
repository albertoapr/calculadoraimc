# Calculadora de IMC da Beta

Aplicação em Vue 3 + Vite preparada para deploy pelo AWS Amplify Gen 2. O IMC é calculado no navegador. Após a avaliação, a opção **Receber ajuda de um personal** abre os campos de contato. Ao enviar, o aplicativo abre o WhatsApp com os dados preenchidos; a pessoa escolhe a conversa e confirma o envio no próprio WhatsApp.

## O que é implantado

- Frontend Vue hospedado pelo Amplify Hosting.
- O projeto mantém recursos de backend/API provisionados pelo Amplify, mas o formulário atual não os chama: o envio é iniciado manualmente pelo WhatsApp.

## Implantar pelo Amplify

1. No AWS Amplify, escolha **New app → Host web app → GitHub** e conecte o repositório `albertoapr/calculadoraimc` (branch `main`).
2. O Amplify detecta `amplify.yml`. O backend é provisionado primeiro; em seguida o build publica `dist/`.
3. Dispare ou repita o deploy do branch e aguarde o frontend ficar com status **Deployed**. Acesse o domínio HTTPS disponibilizado em **Hosting**. O backend continua no projeto, mas não é necessário configurar um hook para o fluxo atual de WhatsApp.

## Desenvolvimento local

```sh
npm ci
npm run dev
```

O cálculo funciona localmente. Para testar o formulário, marque a opção de contato, preencha os dados e clique em **Abrir WhatsApp para enviar**; o WhatsApp abre com a mensagem preenchida para a pessoa revisar e enviar.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, sexo, peso, altura e IMC só são incluídos na mensagem após consentimento explícito. Sem marcar a opção, peso e altura são usados somente no cálculo local. A aplicação não envia esses dados automaticamente nem mantém banco de dados: a pessoa escolhe a conversa e precisa confirmar o envio no WhatsApp.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
