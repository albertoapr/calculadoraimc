import { defineBackend } from '@aws-amplify/backend'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import { Duration, Stack } from 'aws-cdk-lib'
import { imcSubmit } from './functions/imc-submit/resource'

const backend = defineBackend({ imcSubmit })
const apiStack = backend.createStack('imc-api-stack')

const api = new apigateway.RestApi(apiStack, 'ImcPublicApi', {
  restApiName: 'calculadora-imc-api',
  description: 'Recebe resultados consentidos da Calculadora de IMC.',
  deployOptions: {
    stageName: 'prod',
    throttlingRateLimit: 10,
    throttlingBurstLimit: 20,
  },
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  },
})

const imcResource = api.root.addResource('api').addResource('imc')
imcResource.addMethod('POST', new apigateway.LambdaIntegration(backend.imcSubmit.resources.lambda, {
  proxy: true,
  timeout: Duration.seconds(20),
}))

backend.addOutput({
  custom: {
    imcApi: {
      endpoint: api.url,
      region: Stack.of(api).region,
    },
  },
})
