/** Shared runtime API endpoint discovery; keeps deployment-specific URLs out of UI code. */
type RuntimeOutputs = { custom?: { imcApi?: { endpoint?: string } } }
let pendingEndpoint: Promise<string> | undefined

export async function getRequestApiEndpoint(signal?: AbortSignal): Promise<string> {
  // Do not share an abortable request across independent consumers.
  if (signal) return loadEndpoint(signal)
  pendingEndpoint ??= loadEndpoint().catch((error) => {
    pendingEndpoint = undefined
    throw error
  })
  return pendingEndpoint
}

async function loadEndpoint(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/amplify_outputs.json', { cache: 'no-store', signal })
  if (!response.ok)
    throw new Error('A validação ainda não está disponível. Tente novamente mais tarde.')
  const outputs = (await response.json()) as RuntimeOutputs
  const endpoint = outputs.custom?.imcApi?.endpoint?.trim()
  if (!endpoint)
    throw new Error('A validação ainda não está disponível. Tente novamente mais tarde.')
  return endpoint.replace(/\/+$/, '')
}
