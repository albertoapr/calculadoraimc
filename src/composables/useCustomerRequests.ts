import { computed, nextTick, ref, type Ref } from 'vue'
import {
  listCustomerRequests,
  sendCustomerRequestToTrainers,
  updateCustomerRequestVisibility,
  acceptCustomerProposal,
} from '../services/customerRequestsService'
import type { CustomerRequest, CustomerProposal } from '../types/domain'

export function useCustomerRequests(options: {
  signedInName: Ref<string>
  selectedTrainerIds: Ref<string[]>
  getToken: () => string
  onOpen: () => void
  onStatus: (message: string) => void
}) {
  const { signedInName: customerSignedInName, selectedTrainerIds: homeSelectedTrainerIds } = options
  const sharingRequestId = ref('')

  const sharingRequestMessage = ref('')

  const sharingRequestBusy = ref(false)

  const activeCustomerRequest = computed(() =>
    customerRequests.value.find(
      (request) =>
        request.lifecycle === 'OPEN' &&
        !request.requestExpired &&
        request.validUntil * 1000 > Date.now(),
    ),
  )

  const checkingCustomerRequests = ref(false)

  const customerRequestsLookupError = ref('')

  async function refreshShareableRequests() {
    if (!customerSignedInName.value) {
      customerRequests.value = []
      sharingRequestId.value = ''
      customerRequestsLookupError.value = ''
      return
    }
    checkingCustomerRequests.value = true
    customerRequestsLookupError.value = ''
    try {
      const token = options.getToken()
      if (!token) throw new Error('Entre novamente para consultar sua solicitação.')
      customerRequests.value = await listCustomerRequests(token)
      sharingRequestId.value = activeCustomerRequest.value?.requestId ?? ''
    } catch {
      customerRequestsLookupError.value =
        'Não foi possível consultar sua solicitação. Tente novamente.'
    } finally {
      checkingCustomerRequests.value = false
    }
  }

  async function sendRequestToSelectedTrainers() {
    if (!sharingRequestId.value || sharingRequestBusy.value) return
    if (!homeSelectedTrainerIds.value.length) {
      sharingRequestMessage.value = 'Selecione pelo menos um personal.'
      return
    }
    sharingRequestBusy.value = true
    sharingRequestMessage.value = ''
    try {
      const token = options.getToken()
      if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
      const added = await sendCustomerRequestToTrainers(
        token,
        sharingRequestId.value,
        homeSelectedTrainerIds.value,
      )
      sharingRequestMessage.value = added
        ? 'Solicitação enviada para ' + added + (added === 1 ? ' personal!' : ' personais!')
        : 'Estes profissionais já receberam sua solicitação.'
      homeSelectedTrainerIds.value = []
      await refreshShareableRequests()
    } catch (error) {
      sharingRequestMessage.value =
        error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.'
    } finally {
      sharingRequestBusy.value = false
    }
  }

  const customerRequests = ref<CustomerRequest[]>([])

  const customerRequestsStatus = ref('')

  const changingRequestId = ref('')

  const requestActionDialog = ref<{
    request: CustomerRequest
    action: 'deactivate' | 'reactivate'
  } | null>(null)

  const requestActionError = ref('')

  async function openCustomerRequests() {
    options.onOpen()
    customerRequestsStatus.value = 'Carregando suas solicitações…'
    await nextTick()
    window.scrollTo(0, 0)
    try {
      const token = options.getToken()
      if (!token) {
        customerRequestsStatus.value = 'Entre na sua conta para consultar suas propostas.'
        return
      }
      const requests = await listCustomerRequests(token)
      customerRequests.value = requests.filter(
        (request) =>
          !request.requestExpired &&
          request.validUntil * 1000 > Date.now() &&
          request.lifecycle === 'OPEN',
      )
      customerRequestsStatus.value = customerRequests.value.length
        ? ''
        : 'Você não possui solicitações ativas.'
    } catch (error) {
      customerRequestsStatus.value =
        error instanceof Error ? error.message : 'Não foi possível carregar suas solicitações.'
    }
  }

  async function changeRequestVisibility(
    request: CustomerRequest,
    action: 'deactivate' | 'reactivate',
  ) {
    if (
      changingRequestId.value ||
      request.requestExpired ||
      request.validUntil * 1000 <= Date.now()
    )
      return
    if (
      action === 'deactivate' &&
      (request.lifecycle !== 'OPEN' ||
        request.proposalCount !== 0 ||
        request.proposals.length !== 0)
    )
      return
    if (action === 'reactivate' && request.lifecycle !== 'INACTIVE') return
    requestActionError.value = ''
    requestActionDialog.value = { request, action }
  }

  async function confirmRequestVisibilityChange() {
    const pending = requestActionDialog.value
    if (!pending || changingRequestId.value) return
    const { request, action } = pending
    changingRequestId.value = request.requestId
    customerRequestsStatus.value = ''
    try {
      const token = options.getToken()
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
      await updateCustomerRequestVisibility(token, request.requestId, action)
      requestActionDialog.value = null
      await openCustomerRequests()
      customerRequestsStatus.value =
        action === 'deactivate'
          ? 'Solicitação inativada. Você pode reativá-la até o vencimento.'
          : 'Solicitação reativada.'
    } catch (error) {
      requestActionError.value =
        error instanceof Error ? error.message : 'Não foi possível atualizar a solicitação.'
    } finally {
      changingRequestId.value = ''
    }
  }

  async function acceptProposal(request: CustomerRequest, proposal: CustomerProposal) {
    if (proposal.expired || proposal.status !== 'OPEN') return
    try {
      const token = options.getToken()
      await acceptCustomerProposal(token, request.requestId, proposal.trainerId)
      await openCustomerRequests()
      options.onStatus(`Proposta de ${proposal.name} aceita. O profissional será avisado.`)
    } catch (error) {
      options.onStatus(
        error instanceof Error ? error.message : 'Não foi possível aceitar a proposta.',
      )
    }
  }
  return {
    sharingRequestId,
    sharingRequestMessage,
    sharingRequestBusy,
    activeCustomerRequest,
    checkingCustomerRequests,
    customerRequestsLookupError,
    customerRequests,
    customerRequestsStatus,
    changingRequestId,
    requestActionDialog,
    requestActionError,
    refreshShareableRequests,
    sendRequestToSelectedTrainers,
    openCustomerRequests,
    changeRequestVisibility,
    confirmRequestVisibilityChange,
    acceptProposal,
  }
}
