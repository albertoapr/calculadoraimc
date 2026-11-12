import { computed, type Ref } from 'vue'

/** Single source of truth for the visible page heading. */
export function usePageTitle(mode: Ref<string>) {
  return computed(
    () =>
      (
        ({
          'public-trainers': 'Profissionais',
          'select-trainers': 'Selecionar profissionais',
          'trainer-request': 'Solicitação de atendimento',
          'customer-requests': 'Minhas solicitações',
          'trainer-requests': 'Solicitações recebidas',
          'my-profile': 'Meu cadastro',
        }) as Record<string, string>
      )[mode.value] ?? '',
  )
}
