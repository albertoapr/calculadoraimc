import { defineFunction } from '@aws-amplify/backend'

export const imcSubmit = defineFunction({
  name: 'imc-submit',
  entry: './handler.ts',
  timeoutSeconds: 20,
})
