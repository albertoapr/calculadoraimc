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
trainers.addGlobalSecondaryIndex({
  indexName: 'TrainerById',
  partitionKey: { name: 'trainerId', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.INCLUDE,
  nonKeyAttributes: ['name', 'whatsapp', 'active'],
})
requestCodes.grant(backend.imcSubmit.resources.lambda, 'dynamodb:PutItem', 'dynamodb:UpdateItem')
trainers.grant(backend.imcSubmit.resources.lambda, 'dynamodb:Query', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem')
trainerSlugs.grant(backend.imcSubmit.resources.lambda, 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem')
backend.imcSubmit.resources.lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [`${trainers.tableArn}/index/TrainerById`],
}))
backend.imcSubmit.addEnvironment('IMC_REQUESTS_TABLE', requestCodes.tableName)
backend.imcSubmit.addEnvironment('TRAINERS_TABLE', trainers.tableName)
backend.imcSubmit.addEnvironment('TRAINER_SLUGS_TABLE', trainerSlugs.tableName)
backend.imcSubmit.addEnvironment('BETA_EMAIL_ADDRESS', 'betasolucoesia@gmail.com')
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
    allowHeaders: ['Content-Type'],
  },
})

const apiResource = api.root.addResource('api')
const imcResource = apiResource.addResource('imc')
imcResource.addMethod('POST', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))
imcResource.addResource('verify').addMethod('POST', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))
const trainersResource = apiResource.addResource('trainers')
trainersResource.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))
trainersResource.addResource('by-slug').addResource('{slug}').addMethod('GET', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))
trainersResource.addResource('{trainerId}').addMethod('GET', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))

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
