import { defineBackend } from '@aws-amplify/backend'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
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
const trainers = new dynamodb.Table(requestStack, 'FitpesoProfessionals', {
  partitionKey: { name: 'city', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
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
const fitpesoProposals = new dynamodb.Table(requestStack, 'FitpesoProposals', {
  partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.RETAIN,
})
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
trainerSlugs.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem')
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
backend.imcSubmit.addEnvironment('TRAINER_SLUGS_TABLE', trainerSlugs.tableName)
backend.imcSubmit.addEnvironment('FITPESO_USER_REQUESTS_TABLE', fitpesoRequests.tableName)
backend.imcSubmit.addEnvironment('FITPESO_PROPOSALS_TABLE', fitpesoProposals.tableName)
backend.imcSubmit.addEnvironment('FITPESO_ATENDIMENTOS_TABLE', fitpesoAtendimentos.tableName)
backend.imcSubmit.addEnvironment('FITPESO_REQUEST_LOCKS_TABLE', requestLocks.tableName)
backend.imcSubmit.addEnvironment('FITPESO_CUSTOMERS_TABLE', customers.tableName)
backend.imcSubmit.addEnvironment('GOOGLE_OAUTH_CLIENT_ID', '250783469314-bg81qekefpf8rtunb0bppq7uitr5rv2l.apps.googleusercontent.com')
backend.imcSubmit.addEnvironment('BETA_EMAIL_ADDRESS', 'betasolucoesia@gmail.com')
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

// As novas tabelas ainda não são usadas pelas rotas atuais.
const newDataTables = [
  [pessoasV2, 'FITPESO_PESSOA_TABLE'],
  [usuariosV2, 'FITPESO_USUARIO_TABLE'],
  [tiposUsuarioV2, 'FITPESO_TIPO_USUARIO_TABLE'],
  [customersV2, 'FITPESO_CUSTOMER_V2_TABLE'],
  [personalsV2, 'FITPESO_PERSONAL_V2_TABLE'],
] as const
for (const [table, envName] of newDataTables) {
  table.grantReadWriteData(backend.imcSubmit.resources.lambda)
  backend.imcSubmit.addEnvironment(envName, table.tableName)
}
// Consultas em GSIs exigem permissão para ARN do índice.
for (const [table, indices] of [
  [usuariosV2, ['UsuarioByPessoa', 'UsuarioByUsername', 'UsuarioByTipo']],
  [customersV2, ['CustomerByUsuario']],
  [personalsV2, ['PersonalByUsuario', 'PersonalByCidade']],
] as const) {
  backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
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
    allowMethods: ['GET', 'POST', 'OPTIONS'],
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
adminResource.addResource('trainers').addMethod('POST', lambdaIntegration())
const trainersResource = apiResource.addResource('trainers')
trainersResource.addResource('register').addMethod('POST', lambdaIntegration())
trainersResource.addResource('verify-whatsapp').addMethod('POST', lambdaIntegration())
trainersResource.addResource('login').addMethod('POST', lambdaIntegration())
trainersResource.addResource('login-status').addMethod('POST', lambdaIntegration())
trainersResource.addResource('verify-login').addMethod('POST', lambdaIntegration())
trainersResource.addResource('profile').addMethod('POST', lambdaIntegration())
trainersResource.addResource('update-profile').addMethod('POST', lambdaIntegration())
trainersResource.addResource('received-requests').addMethod('GET', lambdaIntegration())
const customersResource = apiResource.addResource('customers')
customersResource.addResource('profile').addMethod('POST', lambdaIntegration())
customersResource.addResource('update-profile').addMethod('POST', lambdaIntegration())
customersResource.addResource('verification-status').addMethod('POST', lambdaIntegration())
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
  },
})
