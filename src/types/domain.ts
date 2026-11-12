export type Sex = 'feminino' | 'masculino' | 'outro'

export type GoogleCredentialResponse = { credential: string }

export type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
      }) => void
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
    }
  }
}

export type Theme = 'light' | 'dark'

export type ImcResult = {
  weight: number
  heightCm: number
  imc: number
  waistCm?: number
  bodyFatPercent?: number
  bodyFatClassification?: string
  bodyFatSex?: 'feminino' | 'masculino'
  bodyFatAge?: number
}

export type TrainerRequestDetails = {
  clientName: string
  age?: number
  clientGender?: 'feminino' | 'masculino' | 'nao_informar'
  city: string
  objective?: string
  desiredDuration?: string
  singleLesson?: boolean
  withCompanion?: boolean
  attendsGym: boolean
  gymName?: string
  trainingDays: string[]
  trainingShifts: string[]
  trainingStartTime?: string
  trainingEndTime?: string
  validUntil: number
  proposalAlreadySent?: boolean
}

export type EligibleTrainer = {
  trainerId: string
  name: string
  slug: string
  instagram?: string
  cref?: string
  sex?: string
  gender?: string
  academias?: string[]
  gymName?: string
  academy?: string
}

export type CustomerProposal = {
  trainerId: string
  name: string
  whatsapp: string
  instagram?: string
  monthlyPrice: number
  message: string
  status: string
  validUntil: number
  expired: boolean
}

export type TrainerReceivedRequest = {
  requestId: string
  clientName: string
  city: string
  objective?: string
  createdAt: string
  validUntil: number
  lifecycle: string
  token: string
}

export type EditableProfile = {
  name: string
  whatsapp: string
  email: string
  dateOfBirth: string
  instagram: string
  cref: string
  slug: string
  academias: string[]
}

export type TrainerAccountProfile = {
  trainerId: string
  name: string
  whatsapp: string
  email?: string
  dateOfBirth?: string
  instagram?: string
  cref?: string
  sex?: string
  slug?: string
  academias?: string[]
}

export type AdminTrainer = {
  trainerId: string
  name: string
  whatsapp: string
  email: string
  dateOfBirth: string
  sex: string
  cref: string
  instagram: string
  slug: string
  cities: string[]
  academias: string[]
  active: boolean
}

export type CustomerRequest = {
  requestId: string
  city: string
  objective?: string
  selectedTrainerIds?: string[]
  lifecycle: string
  proposalCount: number
  validUntil: number
  requestExpired?: boolean
  acceptedAt?: string
  proposals: CustomerProposal[]
}

export type AmplifyRuntimeOutputs = { custom?: { imcApi?: { endpoint?: string } } }

export type PendingWhatsAppLogin = {
  role: 'customer' | 'trainer'
  whatsapp: string
  code: string
  token: string
  expiresAt: number
  progressStartedAt: number
  awaitingReturn: boolean
}
