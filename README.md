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


## Login de personal trainer por WhatsApp

O frontend oferece **Sou personal**, com login pelo WhatsApp registrado. O login exige cadastro ativo com WhatsApp previamente confirmado. Ao iniciar o fluxo, a API retorna um código de uso único válido por 15 minutos, vinculado a uma sessão aleatória gerada pelo navegador. O usuário envia o código pelo WhatsApp da Beta; depois de validado, a sessão dura até 12 horas no armazenamento da aba.

**Integração obrigatória no atendente/automação do WhatsApp:** quando chegar uma mensagem no formato `Confirmar login FitPeso <codigo>`, a automação precisa extrair o código e obter o número do remetente **diretamente dos metadados confiáveis do provedor**. Ela pode continuar chamando o endpoint já utilizado pelo cliente, `POST /api/customers/verify-login`, que agora reconhece o tipo de código (cliente ou personal) e valida o fluxo correspondente. Também permanece disponível `POST /api/trainers/verify-login` com JSON `{"code":"<codigo>","whatsapp":"<numero do remetente>"}` e cabeçalho `X-Fitpeso-Verification-Secret` com o secret `TRAINER_WHATSAPP_VERIFY_SECRET`. Esse segredo deve existir somente no backend da integração; **nunca** pode ser enviado ao navegador. Não aceite o número informado no texto da mensagem como prova de titularidade. Não use o endpoint público `login-status` para confirmar códigos.

O login utiliza `POST /api/trainers/login`, `POST /api/trainers/login-status` e `POST /api/trainers/profile`. O painel `GET /api/trainers/received-requests` exige `Authorization: Bearer <sessionToken>`, valida a identidade na Lambda e só retorna solicitações válidas que contenham o identificador do profissional em `selectedTrainerIds`. Cada item fornece um link de proposta assinado e com validade restrita. Os códigos/sessões são mantidos na tabela DynamoDB existente, sem novos GSIs, para evitar alterações incompatíveis de índice.

A implementação reutiliza a mensagem e o endpoint de confirmação já usados no login do cliente. Se a automação existente encaminhar mensagens `Confirmar login FitPeso <codigo>` à rota `/api/customers/verify-login`, não é necessário criar um fluxo de confirmação separado. A integração deve usar o número de origem autenticado pelo provedor de WhatsApp. O personal não informa data de nascimento porque esse campo não existe atualmente no cadastro dos profissionais; o login exige WhatsApp previamente confirmado. Após o deploy, teste o fluxo ponta a ponta com um cadastro de personal ativo.

## Dados e privacidade

Nome, WhatsApp, cidade, idade, objetivo e disponibilidade são enviados à Beta após consentimento explícito. Peso, altura, sexo e IMC permanecem no cálculo local e não são incluídos no e-mail da solicitação.

O IMC é uma referência para adultos e não substitui avaliação de profissional de saúde. Para menores de 18 anos, a tela informa que a interpretação precisa de curvas de crescimento.
