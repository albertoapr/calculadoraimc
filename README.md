# Calculadora de IMC da Beta

Aplicação em Vue 3 + Vite preparada para deploy pelo AWS Amplify Gen 2. Inicialmente, o formulário mostra apenas peso e altura, e calcula o IMC no navegador. Ao marcar **Quero receber contato do personal**, aparecem os campos de contato; o único botão passa a calcular o IMC e enviar os dados após o consentimento.

## O que é implantado

- Frontend Vue hospedado pelo Amplify Hosting.
- API REST pública em API Gateway (`POST /api/imc`) e função Lambda Node.js.
- A Lambda valida os campos e encaminha apenas os dados autorizados para o hook do OpenClaw.
- O segredo `OPENCLAW_HOOK_TOKEN` é lido somente pela função; não é enviado ao navegador nem incluído no Git.
- O API Gateway limita a taxa de requisições para reduzir abuso básico.

## Implantar pelo Amplify

1. No AWS Amplify, escolha **New app → Host web app → GitHub** e conecte o repositório `albertoapr/calculadoraimc` (branch `main`).
2. O Amplify detecta `amplify.yml`. O backend é provisionado primeiro; em seguida o build publica `dist/`.
3. Antes de iniciar o primeiro deploy, abra as configurações de secrets do backend/branch no Amplify e crie `OPENCLAW_HOOK_TOKEN` com o token do hook do OpenClaw. Não o coloque em `VITE_*`, no frontend, no Git ou em `amplify.yml`.
4. Dispare ou repita o deploy do branch. O Amplify gera `amplify_outputs.json` durante o deploy do backend; o frontend usa o endpoint gerado automaticamente.
5. Aguarde o backend e o frontend ficarem com status **Deployed**. Acesse o domínio HTTPS disponibilizado em **Hosting**.

O frontend estático pode ser compilado sem token, mas o envio só funcionará quando o segredo estiver configurado e o hook `/hooks/imc` estiver acessível. Se o segredo for adicionado depois do primeiro deploy, faça um novo deploy do backend.

## Desenvolvimento local

```sh
npm ci
npm run dev
```

O cálculo funciona localmente; o envio exige a API provisionada. Para desenvolver também o backend, use o Amplify Sandbox com credenciais AWS autorizadas e configure o secret `OPENCLAW_HOOK_TOKEN` no sandbox. Não use o token real em arquivos locais versionados.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, sexo, peso, altura e IMC só são enviados após consentimento explícito. Sem marcar a opção, peso e altura são usados somente no cálculo local. A aplicação não mantém banco de dados; a Lambda valida o pedido e repassa os campos consentidos ao hook configurado. O CORS permite que o site público chame a API; isso não substitui validação ou limitação de requisições no backend.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
