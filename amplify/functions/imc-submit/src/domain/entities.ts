/**
 * Entidades independentes do banco, alinhadas ao MER aprovado.
 * IDs de Pessoa/Usuario/Customer/Personal são UUIDs em string.
 * Esta etapa não modifica as tabelas legadas nem a autenticação atual.
 */
export type EntityId = string

export interface Pessoa {
  pessoa_id: EntityId
  nome?: string
  email?: string
  whatsapp?: string
  data_nascimento?: string
  created_at: string
  updated_at: string
}

export type TipoUsuarioId = 1 | 2 | 3

export interface TipoUsuario {
  tipo_usuario_id: TipoUsuarioId
  descricao: 'Administrador' | 'Cliente' | 'Personal'
}

export interface Usuario {
  user_id: EntityId
  pessoa_id: EntityId
  tipo_usuario_id: TipoUsuarioId
  username: string
  /** Identificador no provedor de identidade, caso seja adotado. */
  cognito_sub?: string
  /** Hash seguro, apenas se for escolhida autenticação própria. */
  password_hash?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  customer_id: EntityId
  user_id: EntityId
  ativo: boolean
  created_at: string
}

export interface Personal {
  personal_id: EntityId
  user_id: EntityId
  trainer_id_legado?: string
  cref?: string
  cidade?: string
  academias?: string[]
  instagram?: string
  ativo: boolean
  created_at: string
}
