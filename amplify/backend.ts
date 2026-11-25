import { defineBackend } from '@aws-amplify/backend'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import { imcSubmit } from './functions/imc-submit/resource'

const backend = defineBackend({ imcSubmit })
const requestStack = backend.createStack('imc-request-code-store')
const requestCodes = new dynamodb.Table(requestStack, 'ImcRequestCodes', {
  partitionKey: { name: 'codeHash', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.DESTROY,
})
// Public trainer-page banners. Objects are private; the API serves only active profiles.
const trainerBanners = new s3.Bucket(requestStack, 'FitpesoTrainerBanners', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  removalPolicy: RemovalPolicy.RETAIN,
  autoDeleteObjects: false,
  lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
})
backend.imcSubmit.addEnvironment('TRAINER_BANNERS_BUCKET', trainerBanners.bucketName)
const trainers = new dynamodb.Table(requestStack, 'FitpesoProfessionals', {
  partitionKey: { name: 'city', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
const academies = new dynamodb.Table(requestStack, 'FitpesoAcademies', {
  partitionKey: { name: 'academyId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
academies.addGlobalSecondaryIndex({
  indexName: 'AcademiesByCity',
  partitionKey: { name: 'city', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'academyId', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
const trainerAcademies = new dynamodb.Table(requestStack, 'FitpesoTrainerAcademies', {
  partitionKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'academyId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
trainerAcademies.addGlobalSecondaryIndex({
  indexName: 'TrainersByAcademy',
  partitionKey: { name: 'academyId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.KEYS_ONLY,
})
const trainerSlugs = new dynamodb.Table(requestStack, 'FitpesoTrainerSlugs', {
  partitionKey: { name: 'slug', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
const fitpesoRequests = new dynamodb.Table(requestStack, 'FitpesoUserRequests', {
  partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.RETAIN,
})
fitpesoRequests.addGlobalSecondaryIndex({
  indexName: 'RequestsByStatus',
  partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'validUntil', type: dynamodb.AttributeType.NUMBER },
  projectionType: dynamodb.ProjectionType.ALL,
})
fitpesoRequests.addGlobalSecondaryIndex({
  indexName: 'RequestsByCustomer',
  partitionKey: { name: 'clientPhone', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
// Índice aditivo: solicitações passam a pertencer ao customer_id, não ao número.
fitpesoRequests.addGlobalSecondaryIndex({
  indexName: 'RequestsByCustomerId',
  partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
const fitpesoProposals = new dynamodb.Table(requestStack, 'FitpesoProposals', {
  partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.RETAIN,
})
fitpesoProposals.addGlobalSecondaryIndex({
  indexName: 'ProposalsByNotificationStatus',
  partitionKey: { name: 'notificationStatus', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'validUntil', type: dynamodb.AttributeType.NUMBER },
  projectionType: dynamodb.ProjectionType.KEYS_ONLY,
})
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${fitpesoProposals.tableArn}/index/ProposalsByNotificationStatus`],
}))
const fitpesoAtendimentos = new dynamodb.Table(requestStack, 'FitpesoAtendimentos', {
  partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
const requestLocks = new dynamodb.Table(requestStack, 'FitpesoRequestPhoneLocks', {
  partitionKey: { name: 'clientPhone', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.RETAIN,
})
const customers = new dynamodb.Table(requestStack, 'FitpesoCustomers', {
  partitionKey: { name: 'whatsapp', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
})
trainers.addGlobalSecondaryIndex({
  indexName: 'TrainerById',
  partitionKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.INCLUDE,
  nonKeyAttributes: ['name', 'whatsapp', 'active'],
})
requestCodes.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:TransactWriteItems')
trainers.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem', 'dynamodb:UpdateItem')
academies.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems')
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${academies.tableArn}/index/AcademiesByCity`],
}))
trainerAcademies.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:TransactWriteItems')
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${trainerAcademies.tableArn}/index/TrainersByAcademy`],
}))
trainerSlugs.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem', 'dynamodb:DeleteItem')
fitpesoRequests.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems')
fitpesoProposals.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems')
fitpesoAtendimentos.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:TransactWriteItems')
requestLocks.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:TransactWriteItems')
customers.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:TransactWriteItems')
customers.grant(backend.imcSubmit.resources.lambda, 'dynamodb:Query')
customers.addGlobalSecondaryIndex({
  indexName: 'CustomerByEmail',
  partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${customers.tableArn}/index/CustomerByEmail`],
}))
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${trainers.tableArn}/index/TrainerById`],
}))
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${fitpesoRequests.tableArn}/index/RequestsByStatus`],
}))
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${fitpesoRequests.tableArn}/index/RequestsByCustomer`],
}))
backend.imcSubmit.addEnvironment('IMC_REQUESTS_TABLE', requestCodes.tableName)
backend.imcSubmit.addEnvironment('TRAINERS_TABLE', trainers.tableName)
backend.imcSubmit.addEnvironment('ACADEMIES_TABLE', academies.tableName)
backend.imcSubmit.addEnvironment('TRAINER_ACADEMIES_TABLE', trainerAcademies.tableName)
backend.imcSubmit.addEnvironment('TRAINER_SLUGS_TABLE', trainerSlugs.tableName)
backend.imcSubmit.addEnvironment('FITPESO_USER_REQUESTS_TABLE', fitpesoRequests.tableName)
backend.imcSubmit.addEnvironment('FITPESO_PROPOSALS_TABLE', fitpesoProposals.tableName)
backend.imcSubmit.addEnvironment('FITPESO_ATENDIMENTOS_TABLE', fitpesoAtendimentos.tableName)
backend.imcSubmit.addEnvironment('FITPESO_REQUEST_LOCKS_TABLE', requestLocks.tableName)
backend.imcSubmit.addEnvironment('FITPESO_CUSTOMERS_TABLE', customers.tableName)
backend.imcSubmit.addEnvironment('GOOGLE_OAUTH_CLIENT_ID', '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com')
backend.imcSubmit.addEnvironment('BETA_EMAIL_ADDRESS', 'betasolucoesia@gmail.com')
// Link de login aponta para o frontend da branch, sem redirecionar develop para produção.
backend.imcSubmit.addEnvironment(
  'FITPESO_WHATSAPP_LOGIN_URL',
  process.env.AWS_BRANCH === 'main'
    ? 'https://fitpeso.com.br/'
    : 'https://develop.fitpeso.com.br/',
)
// Etapa 2.2: novas entidades isoladas das tabelas legadas.
// Stack separada para evitar alterações em chaves/GSIs já existentes.
const identityStack = backend.createStack('fitpeso-identity-data')
const identityTable = (id: string, key: string, type = dynamodb.AttributeType.STRING) =>
  new dynamodb.Table(identityStack, id, {
    partitionKey: { name: key, type },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  })

const pessoasV2 = identityTable('FitpesoPessoa', 'pessoa_id')
// Identificacoes de login pertencem a pessoa, nao a um perfil individual.
const identificacoesV2 = identityTable('FitpesoPessoaIdentificacao', 'identificationKey')
identificacoesV2.addGlobalSecondaryIndex({
  indexName: 'IdentificacoesByPessoa',
  partitionKey: { name: 'pessoa_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
const usuariosV2 = identityTable('FitpesoUsuario', 'user_id')
const tiposUsuarioV2 = identityTable('FitpesoTipoUsuario', 'tipo_usuario_id', dynamodb.AttributeType.NUMBER)
const customersV2 = identityTable('FitpesoCustomerV2', 'customer_id')
const personalsV2 = identityTable('FitpesoPersonalV2', 'personal_id')

usuariosV2.addGlobalSecondaryIndex({
  indexName: 'UsuarioByPessoa',
  partitionKey: { name: 'pessoa_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
usuariosV2.addGlobalSecondaryIndex({
  indexName: 'UsuarioByUsername',
  partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
usuariosV2.addGlobalSecondaryIndex({
  indexName: 'UsuarioByTipo',
  partitionKey: { name: 'tipo_usuario_id', type: dynamodb.AttributeType.NUMBER },
  projectionType: dynamodb.ProjectionType.ALL,
})
customersV2.addGlobalSecondaryIndex({
  indexName: 'CustomerByUsuario',
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
personalsV2.addGlobalSecondaryIndex({
  indexName: 'PersonalByUsuario',
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})
personalsV2.addGlobalSecondaryIndex({
  indexName: 'PersonalByCidade',
  partitionKey: { name: 'cidade', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
})

// Preserva os nomes/tabelas existentes; o backfill ocorre apenas após login verificado.
const newDataTables = [
  [pessoasV2, 'FITPESO_PESSOA_TABLE'],
  [identificacoesV2, 'FITPESO_PESSOA_IDENTIFICACAO_TABLE'],
  [usuariosV2, 'FITPESO_USUARIO_TABLE'],
  [tiposUsuarioV2, 'FITPESO_TIPO_USUARIO_TABLE'],
  [customersV2, 'FITPESO_CUSTOMER_V2_TABLE'],
  [personalsV2, 'FITPESO_PERSONAL_V2_TABLE'],
] as const

// Cada política gerenciada IAM tem limite de 6.144 caracteres (PolicySize).
// Dividimos as permissões por domínio; múltiplas políticas inline não resolveriam
// o limite cumulativo de 10.240 caracteres da role.
const lambdaPolicyStack = Stack.of(backend.imcSubmit.resources.lambda)
const identityDataPolicy = new iam.ManagedPolicy(lambdaPolicyStack, 'FitpesoIdentityDataAccess')
const profileDataPolicy = new iam.ManagedPolicy(lambdaPolicyStack, 'FitpesoProfileDataAccess')
const bannerDataPolicy = new iam.ManagedPolicy(lambdaPolicyStack, 'FitpesoTrainerBannerAccess')
const lambdaRole = backend.imcSubmit.resources.lambda.role
if (!lambdaRole) throw new Error('A Lambda imc-submit precisa de uma IAM role')
lambdaRole.addManagedPolicy(identityDataPolicy)
lambdaRole.addManagedPolicy(profileDataPolicy)
lambdaRole.addManagedPolicy(bannerDataPolicy)

trainerBanners.grantReadWrite(bannerDataPolicy)
for (const [table, envName] of newDataTables) {
  backend.imcSubmit.addEnvironment(envName, table.tableName)
}
for (const table of [pessoasV2, identificacoesV2, usuariosV2]) {
  table.grantReadWriteData(identityDataPolicy)
}
for (const table of [tiposUsuarioV2, customersV2, personalsV2]) {
  table.grantReadWriteData(profileDataPolicy)
}
// Edições administrativas de cliente atualizam V2 e cadastro legado atomicamente.
profileDataPolicy.addStatements(new iam.PolicyStatement({
  actions: ['dynamodb:TransactWriteItems'],
  resources: [customersV2.tableArn],
}))
// Criação atômica de pessoa + identificação comprovada.
identityDataPolicy.addStatements(new iam.PolicyStatement({
  actions: ['dynamodb:TransactWriteItems'],
  resources: [pessoasV2.tableArn, identificacoesV2.tableArn],
}))
// Consultas em GSIs exigem permissão nos ARNs dos índices correspondentes.
for (const [policy, table, indices] of [
  [identityDataPolicy, identificacoesV2, ['IdentificacoesByPessoa']],
  [identityDataPolicy, usuariosV2, ['UsuarioByPessoa', 'UsuarioByUsername', 'UsuarioByTipo']],
  [profileDataPolicy, customersV2, ['CustomerByUsuario']],
  [profileDataPolicy, personalsV2, ['PersonalByUsuario', 'PersonalByCidade']],
] as const) {
  policy.addStatements(new iam.PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: indices.map(index => `${table.tableArn}/index/${index}`),
  }))
}

const apiStack = backend.createStack('imc-api-stack')

const api = new apigateway.RestApi(apiStack, 'ImcPublicApi', {
  restApiName: 'calculadora-imc-api',
  description: 'API de solicitações da Calculadora de IMC e diretório público de personais ativos.',
  deployOptions: {
    stageName: 'prod',
    throttlingRateLimit: 10,
    throttlingBurstLimit: 20,
  },
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Fitpeso-Verification-Secret'],
  },
})

const apiResource = api.root.addResource('api')
const apiLambdaInvokeRole = new iam.Role(apiStack, 'ApiGatewayInvokeImcSubmitRole', {
  assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
})
apiLambdaInvokeRole.addToPolicy(new iam.PolicyStatement({
  actions: ['lambda:InvokeFunction'],
  resources: [backend.imcSubmit.resources.lambda.functionArn],
}))

const lambdaIntegration = () => new apigateway.AwsIntegration({
  service: 'lambda',
  path: `2015-03-31/functions/${backend.imcSubmit.resources.lambda.functionArn}/invocations`,
  proxy: true,
  options: {
    credentialsRole: apiLambdaInvokeRole,
    timeout: Duration.seconds(20),
  },
})

const imcResource = apiResource.addResource('imc')
imcResource.addMethod('POST', lambdaIntegration())
imcResource.addResource('verify').addMethod('POST', lambdaIntegration())
const adminResource = apiResource.addResource('admin')
const adminAcademiesResource = adminResource.addResource('academies')
adminAcademiesResource.addMethod('GET', lambdaIntegration())
adminAcademiesResource.addMethod('POST', lambdaIntegration())
const adminAcademyItem = adminAcademiesResource.addResource('{academyId}')
adminAcademyItem.addMethod('GET', lambdaIntegration())
adminAcademyItem.addMethod('PUT', lambdaIntegration())
adminAcademyItem.addMethod('DELETE', lambdaIntegration())
const academiesResource = apiResource.addResource('academies')
academiesResource.addMethod('GET', lambdaIntegration())
academiesResource.addResource('{academyId}').addMethod('GET', lambdaIntegration())
const adminCustomersResource = adminResource.addResource('customers')
adminCustomersResource.addMethod('GET', lambdaIntegration())
adminCustomersResource.addResource('{customerId}').addMethod('PUT', lambdaIntegration())
const adminTrainersResource = adminResource.addResource('trainers')
adminTrainersResource.addMethod('GET', lambdaIntegration())
adminTrainersResource.addMethod('POST', lambdaIntegration())
adminTrainersResource.addResource('{trainerId}').addMethod('PUT', lambdaIntegration())
const personalResource = apiResource.addResource('personal')
personalResource.addResource('listar').addMethod('GET', lambdaIntegration())
const trainersResource = apiResource.addResource('trainers')
trainersResource.addResource('register').addMethod('POST', lambdaIntegration())
trainersResource.addResource('verify-whatsapp').addMethod('POST', lambdaIntegration())
trainersResource.addResource('login').addMethod('POST', lambdaIntegration())
trainersResource.addResource('login-status').addMethod('POST', lambdaIntegration())
trainersResource.addResource('verify-login').addMethod('POST', lambdaIntegration())
trainersResource.addResource('profile').addMethod('POST', lambdaIntegration())
trainersResource.addResource('update-profile').addMethod('POST', lambdaIntegration())
trainersResource.addResource('upload-banner').addMethod('POST', lambdaIntegration())
trainersResource.addResource('banner').addResource('{trainerId}').addMethod('GET', lambdaIntegration())
trainersResource.addResource('received-requests').addMethod('GET', lambdaIntegration())
const signupResource = apiResource.addResource('signup')
signupResource.addResource('start-phone').addMethod('POST', lambdaIntegration())
signupResource.addResource('status-phone').addMethod('POST', lambdaIntegration())
signupResource.addResource('verify-phone').addMethod('POST', lambdaIntegration())
// Sessao unica: consulta a pessoa e seus perfis utilizando apenas token validado.
const authResource = apiResource.addResource('auth')
authResource.addResource('me').addMethod('GET', lambdaIntegration())
authResource.addResource('switch-profile').addMethod('POST', lambdaIntegration())
authResource.addResource('verify-whatsapp-link').addMethod('POST', lambdaIntegration())
authResource.addResource('beta-onboarding').addMethod('POST', lambdaIntegration())
authResource.addResource('beta-onboarding-template').addMethod('POST', lambdaIntegration())
const betaTrainerSignupResource = authResource.addResource('beta-trainer-signup')
betaTrainerSignupResource.addResource('redeem').addMethod('POST', lambdaIntegration())
betaTrainerSignupResource.addResource('complete').addMethod('POST', lambdaIntegration())
const customersResource = apiResource.addResource('customers')
customersResource.addResource('profile').addMethod('POST', lambdaIntegration())
customersResource.addResource('update-profile').addMethod('POST', lambdaIntegration())
customersResource.addResource('verification-status').addMethod('POST', lambdaIntegration())
customersResource.addResource('start-phone-verification').addMethod('POST', lambdaIntegration())
customersResource.addResource('phone-verification-status').addMethod('POST', lambdaIntegration())
customersResource.addResource('login').addMethod('POST', lambdaIntegration())
customersResource.addResource('start-email-login').addMethod('POST', lambdaIntegration())
customersResource.addResource('email-login-status').addMethod('POST', lambdaIntegration())
const emailConfirmationResource = customersResource.addResource('verify-email-login')
emailConfirmationResource.addMethod('GET', lambdaIntegration())
emailConfirmationResource.addMethod('POST', lambdaIntegration())
customersResource.addResource('login-status').addMethod('POST', lambdaIntegration())
customersResource.addResource('verify-login').addMethod('POST', lambdaIntegration())
customersResource.addResource('register').addMethod('POST', lambdaIntegration())
customersResource.addResource('verify-whatsapp').addMethod('POST', lambdaIntegration())
trainersResource.addResource('by-slug').addResource('{slug}').addMethod('GET', lambdaIntegration())
trainersResource.addResource('{trainerId}').addMethod('GET', lambdaIntegration())
const requestsResource = apiResource.addResource('requests')
requestsResource.addMethod('POST', lambdaIntegration())
requestsResource.addResource('trainer-view').addMethod('GET', lambdaIntegration())
requestsResource.addResource('verify-whatsapp').addMethod('POST', lambdaIntegration())
requestsResource.addResource('valid').addMethod('GET', lambdaIntegration())
requestsResource.addResource('proposals').addMethod('POST', lambdaIntegration())
requestsResource.addResource('accepted-notifications').addMethod('GET', lambdaIntegration())
requestsResource.addResource('proposal-notifications').addMethod('GET', lambdaIntegration())
requestsResource.addResource('proposal-notified').addMethod('POST', lambdaIntegration())
const requestIdResource = requestsResource.addResource('{requestId}')
requestIdResource.addResource('processed').addMethod('POST', lambdaIntegration())
requestIdResource.addResource('accept').addMethod('POST', lambdaIntegration())
requestIdResource.addResource('visibility').addMethod('POST', lambdaIntegration())
requestIdResource.addResource('send-to-trainers').addMethod('POST', lambdaIntegration())
requestIdResource.addResource('acceptance-notified').addMethod('POST', lambdaIntegration())
trainersResource.addResource('eligible').addMethod('GET', lambdaIntegration())
customersResource.addResource('requests').addMethod('GET', lambdaIntegration())

backend.addOutput({
  custom: {
    imcApi: {
      endpoint: api.url,
      region: Stack.of(api).region,
    },
    trainerDirectory: {
      tableName: trainers.tableName,
      slugTableName: trainerSlugs.tableName,
    },
    academyDirectory: {
      tableName: academies.tableName,
      trainerAcademiesTableName: trainerAcademies.tableName,
    },
  },
})
