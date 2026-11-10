# FitPeso — Camada de acesso a dados (Etapa 2.1)

Estrutura **aditiva**, ainda **não conectada ao handler**. A aplicação continua
utilizando as tabelas e rotas legadas. A Etapa 2.2 adicionou a definição das cinco
tabelas, índices, permissões IAM e variáveis de ambiente em `amplify/backend.ts`.
**As tabelas só existirão na AWS após um deploy aprovado e bem-sucedido.**

## Organização

- `domain/entities.ts`: entidades e tipos independentes do banco.
- `domain/repositories.ts`: interfaces de persistência.
- `infrastructure/database/dynamodb/`: implementações para DynamoDB.

## Contrato esperado para a Etapa 2.2

| Repositório | Variável de ambiente | PK |
|---|---|---|
| Pessoa | FITPESO_PESSOA_TABLE | pessoa_id (S) |
| Usuario | FITPESO_USUARIO_TABLE | user_id (S) |
| TipoUsuario | FITPESO_TIPO_USUARIO_TABLE | tipo_usuario_id (N) |
| Customer | FITPESO_CUSTOMER_V2_TABLE | customer_id (S) |
| Personal | FITPESO_PERSONAL_V2_TABLE | personal_id (S) |

Índices previstos: `UsuarioByUsername`, `UsuarioByPessoa`,
`CustomerByUsuario`, `PersonalByUsuario`, `PersonalByCidade`.

## Segurança e consistência

- `criar` usa gravação condicional por chave primária; `atualizar` exige
  registro existente.
- Os métodos de busca por índices **não garantem unicidade**. Na Etapa 2.3,
  criar serviços transacionais para reservar `username`, garantir um perfil por
  usuário e validar referências a Pessoa/TipoUsuario.
- Nunca registrar senhas em logs. Definir Cognito versus hash seguro antes
  de conectar o cadastro.
- A substituição integral de itens em `atualizar` é intencional para os novos
  modelos, mas requer controle de concorrência antes de uso em produção.
- As tabelas e índices da Etapa 2.2 estão declarados em uma stack independente
  (`fitpeso-identity-data`). Nenhum dado inicial foi inserido em TipoUsuario;
  os valores 1=Administrador, 2=Cliente e 3=Personal precisam de carga controlada.
- A Etapa 2.3 deve implementar a integridade entre entidades e a unicidade
  transacional antes de disponibilizar endpoints de gravação.
