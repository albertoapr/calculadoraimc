import { defineFunction, secret } from '@aws-amplify/backend'

export const imcSubmit = defineFunction({
  name: 'imc-submit',
  entry: './handler.ts',
  timeoutSeconds: 20,
  environment: {
    OPENCLAW_HOOK_TOKEN: secret('OPENCLAW_HOOK_TOKEN'),
    OPENCLAW_IMC_HOOK_URL: 'https://darkcyan-gorilla-158656.hostingersite.com/hooks/imc',
  },
})
