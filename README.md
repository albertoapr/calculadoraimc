# Calculadora de IMC da Beta

Aplicação em Vue 3 + Vite preparada para deploy pelo AWS Amplify Gen 2. A tela inicial oferece **Avaliar meu peso**, **Encontrar personal** e o download do contato da IA Beta. O IMC é calculado no navegador. Ao enviar uma solicitação de contato, o backend valida os dados e encaminha a solicitação para a Beta pelo Gmail SMTP; após o envio ser aceito, a tela confirma em um popup e pede que a pessoa aguarde contato.

## O que é implantado

- Frontend Vue hospedado pelo Amplify Hosting.
- API Gateway e função Lambda provisionados pelo Amplify Gen 2 para validar solicitações e enviar e-mails.
- DynamoDB armazena temporariamente os códigos de confirmação usados no fluxo.

## Implantar pelo Amplify

1. No AWS Amplify, escolha **New app → Host web app → GitHub** e conecte o repositório `albertoapr/calculadoraimc` (branch `main`).
2. O Amplify detecta `amplify.yml`. O backend é provisionado primeiro; em seguida o build publica `dist/`.
3. Configure o secret `GMAIL_PASSWORD` nas configurações de secrets do branch conectado. Use uma senha de app do Google, nunca a senha normal da conta.
4. Dispare ou repita o deploy do branch e aguarde frontend e backend implantados. Acesse o domínio HTTPS disponibilizado em **Hosting**.
5. Consulte `custom.trainerDirectory.tableName` e `custom.trainerDirectory.slugTableName` em `amplify_outputs.json` e abra as tabelas no DynamoDB, na região indicada em `custom.imcApi.region`. Cadastros enviados pelo formulário são salvos como pendentes (`active: false`), com um item por cidade e o mesmo `trainerId`; o subdomínio escolhido é reservado na tabela de slugs. Revise e aprove o cadastro antes de ativá-lo. Para profissionais cadastrados manualmente, crie uma reserva de slug com `slug` e `trainerId` na tabela de slugs. O campo `email` é usado apenas no backend para encaminhar solicitações; endpoints públicos retornam somente nome e WhatsApp dos profissionais ativos.

## Desenvolvimento local

```sh
npm ci
npm run dev
```

O cálculo funciona localmente. O envio por e-mail depende do backend implantado e do secret `GMAIL_PASSWORD` configurado no Amplify. A senha é usada exclusivamente pela Lambda e nunca deve ser incluída no código ou no frontend.

O e-mail sempre vai para a Beta. A função também consulta a tabela privada `FitpesoProfessionals` e envia mensagens individuais aos profissionais ativos da cidade; o código de validação é enviado somente à Beta. Se um profissional atende duas cidades, adicione um item para cada cidade.

O perfil público pode ser acessado pelo link legado `https://fitpeso.com.br/p/<trainerId>` ou pelo subdomínio reservado `https://<slug>.fitpeso.com.br`. A aplicação lê o subdomínio e consulta `GET /api/trainers/by-slug/<slug>`; a Lambda resolve o identificador e retorna o perfil apenas quando o profissional está ativo. O cadastro escolhe/reserva um slug (sugerido a partir do nome) e os slugs são únicos. A tabela usa o índice secundário `TrainerById` para buscar o perfil sem varrer itens. Não leia o DynamoDB diretamente do navegador nem inclua os e-mails na resposta pública; a Lambda faz as consultas com acesso IAM limitado.

Sem o trecho `/p/<trainerId>`, a calculadora usa o título padrão **Beta Personal Trainer**. A tela inicial oferece acesso direto à avaliação, ao formulário de solicitação de personal e ao download do contato da Beta. Cadastros de profissionais são gravados como pendentes na tabela e não abrem WhatsApp; o consentimento explícito para compartilhar o contato do cliente continua obrigatório ao enviar uma solicitação.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, objetivo e disponibilidade são enviados à Beta após consentimento explícito. Peso, altura, sexo e IMC permanecem no cálculo local e não são incluídos no e-mail da solicitação.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
