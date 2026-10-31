import { defineFunction, secret } from '@aws-amplify/backend'

export const imcSubmit = defineFunction({
  name: 'imc-submit',
  entry: './handler.ts',
  timeoutSeconds: 20,
  environment: {
    GMAIL_USER: 'betasolucoesia@gmail.com',
    GMAIL_PASSWORD: secret('GMAIL_PASSWORD'),
    TRAINER_WHATSAPP_VERIFY_SECRET: secret('TRAINER_WHATSAPP_VERIFY_SECRET'),
  },
})
