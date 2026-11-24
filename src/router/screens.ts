import type { AppViewMode } from '../types/navigation'
import { parseAcademyPath } from './academyRoutes'

export type AppScreen = AppViewMode | 'login' | 'customer-signup' | 'trainer-signup'
export type ScreenAccess = 'public' | 'customer' | 'trainer' | 'account' | 'admin'

export const screenRoutes: Array<{
  path: string
  screen: AppScreen
  access: ScreenAccess
}> = [
  { path: '/', screen: 'home', access: 'public' },
  { path: '/profissionais', screen: 'public-trainers', access: 'public' },
  { path: '/entrar', screen: 'login', access: 'public' },
  { path: '/cadastro/cliente', screen: 'login', access: 'public' },
  { path: '/cadastro/cliente/dados', screen: 'customer-signup', access: 'public' },
  { path: '/cadastro/personal', screen: 'trainer-signup', access: 'public' },
  { path: '/avaliacao', screen: 'assessment', access: 'public' },
  { path: '/solicitar-treinamento', screen: 'contact', access: 'public' },
  { path: '/solicitar-treinamento/profissionais', screen: 'select-trainers', access: 'public' },
  { path: '/minhas-solicitacoes', screen: 'customer-requests', access: 'customer' },
  { path: '/solicitacoes-recebidas', screen: 'trainer-requests', access: 'trainer' },
  { path: '/meu-cadastro', screen: 'my-profile', access: 'account' },
  { path: '/sobre', screen: 'about', access: 'public' },
  { path: '/registro-profissional', screen: 'professional-registration', access: 'public' },
  { path: '/admin/academias', screen: 'admin-academies', access: 'admin' },
  { path: '/admin/profissionais', screen: 'admin-trainers', access: 'admin' },
  { path: '/admin/clientes', screen: 'admin-customers', access: 'admin' },
  { path: '/admin/profissionais/novo', screen: 'admin-trainers', access: 'admin' },
  { path: '/proposta', screen: 'trainer-request', access: 'public' },
]

const legacyHashes: Record<string, string> = {
  '#entrar': '/entrar',
  '#cadastro-cliente': '/cadastro/cliente',
  '#cadastro-personal': '/cadastro/personal',
  '#avaliacao': '/avaliacao',
  '#sobre': '/sobre',
  '#minhas-solicitacoes': '/minhas-solicitacoes',
}

export function pathForLegacyHash(hash: string) {
  return legacyHashes[hash]
}

export function isPersonalPath(path: string) {
  return /^\/(?:personal|p)\/[^/]+\/?$/.test(path)
}

export function screenForPath(path: string) {
  if (parseAcademyPath(path)) return 'public-trainers'
  return screenRoutes.find((route) => route.path === path)?.screen ?? 'home'
}

export function pathForScreen(screen: AppScreen, currentPath = '/') {
  if (screen === 'home' && isPersonalPath(currentPath)) return currentPath
  if (screen === 'public-trainers' && parseAcademyPath(currentPath)) return currentPath
  return screenRoutes.find((route) => route.screen === screen)?.path ?? '/'
}

/** Only known internal destinations can be used after authentication. */
export function safeReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return ''
  const path = value.split(/[?#]/)[0]
  return (
    Boolean(parseAcademyPath(path)) ||
    screenRoutes.some(
      (route) =>
        route.path === path && !['login', 'customer-signup', 'trainer-signup'].includes(route.screen),
    )
  )
    ? value
    : ''
}
