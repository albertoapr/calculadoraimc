import { ref } from 'vue'
import { getTrainerRequest, sendTrainerProposal } from '../services/trainerProposalService'
import type { TrainerRequestDetails } from '../types/domain'

export function useTrainerProposal(trainerRequestToken: string) {
  const trainerRequest = ref<TrainerRequestDetails | null>(null)
  const trainerProposalPrice = ref('')
  const trainerProposalMessage = ref('')
  const trainerProposalSubmitting = ref(false)
  const trainerRequestStatus = ref(trainerRequestToken ? 'Carregando solicitação…' : '')
  async function loadTrainerRequest() {
    if (!trainerRequestToken) return
    try {
      trainerRequest.value = await getTrainerRequest(trainerRequestToken)
      trainerRequestStatus.value = ''
    } catch (error) {
      trainerRequestStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar esta solicitação.'
    }
  }

  async function submitTrainerProposal() {
    if (!trainerRequestToken || !trainerProposalPrice.value || trainerProposalSubmitting.value)
      return
    trainerProposalSubmitting.value = true
    trainerRequestStatus.value = 'Enviando proposta…'
    try {
      await sendTrainerProposal({
        token: trainerRequestToken,
        monthlyPrice: Number(trainerProposalPrice.value),
        message: trainerProposalMessage.value,
      })
      if (trainerRequest.value) trainerRequest.value.proposalAlreadySent = true
      trainerRequestStatus.value =
        'Proposta enviada. O usuário poderá conversar com os profissionais e escolher uma proposta pelo painel.'
    } catch (error) {
      trainerRequestStatus.value =
        error instanceof Error ? error.message : 'Não foi possível enviar a proposta agora.'
    } finally {
      trainerProposalSubmitting.value = false
    }
  }

  return {
    trainerRequest,
    trainerProposalPrice,
    trainerProposalMessage,
    trainerProposalSubmitting,
    trainerRequestStatus,
    loadTrainerRequest,
    submitTrainerProposal,
  }
}
