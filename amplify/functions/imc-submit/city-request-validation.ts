const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
export function parseCityRequest(data: Record<string, unknown> | null) {
  if (!data || Object.keys(data).some(key => !['name', 'state'].includes(key))) return null
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ').normalize('NFC') : ''
  const state = typeof data.state === 'string' ? data.state.trim().toUpperCase() : ''
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name) || !slug || !states.has(state)) return null
  return { name, state, requestId: slug + '-' + state.toLowerCase() }
}
