/** Public-page metadata only. Private account and request screens must not be indexed. */
const BASE = 'https://fitpeso.com.br'
type Page = 'home' | 'directory' | 'private'
function setMeta(name: string, content: string, attribute: 'name' | 'property' = 'name') {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.content = content
}
function setCanonical(path: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = BASE + path
}
export function updatePageSeo(
  page: Page,
  options: { path?: string; academy?: string; city?: string; notFound?: boolean } = {},
) {
  const directory = page === 'directory'
  const privatePage = page === 'private'
  const academy = options.academy?.trim().replace(/^academia\s+/i, '') ?? ''
  const academyPage = directory && Boolean(academy && options.city)
  const title = academyPage
    ? `Academia ${academy} em ${options.city} | FitPeso`
    : directory
      ? 'Profissionais de educação física | FitPeso'
      : 'Encontre um personal trainer | FitPeso'
  const description = academyPage
    ? `Encontre profissionais de educação física da Academia ${academy} em ${options.city} na FitPeso.`
    : directory
      ? 'Consulte profissionais de educação física e encontre um personal trainer para seus objetivos de treino no FitPeso.'
      : 'Encontre um personal trainer, compare profissionais e solicite propostas de atendimento pelo FitPeso.'
  const path = directory ? (options.path ?? '/profissionais') : '/'
  document.title = privatePage ? 'Minha área | FitPeso' : title
  setMeta('description', privatePage ? 'Área de acesso restrito do FitPeso.' : description)
  setMeta('robots', privatePage || options.notFound ? 'noindex, nofollow' : 'index, follow')
  setMeta('og:title', title, 'property')
  setMeta('og:description', description, 'property')
  setMeta('og:type', 'website', 'property')
  setMeta('og:url', BASE + path, 'property')
  setCanonical(path)
}
