import type { Customer, EntityId, Personal, Pessoa, TipoUsuario, TipoUsuarioId, Usuario } from './entities'

/** Contratos de persistência; serviços não devem depender de comandos DynamoDB. */
export interface PessoaRepository {
  buscarPorId(pessoaId: EntityId): Promise<Pessoa | null>
  criar(pessoa: Pessoa): Promise<void>
  atualizar(pessoa: Pessoa): Promise<void>
}

export interface UsuarioRepository {
  buscarPorId(userId: EntityId): Promise<Usuario | null>
  buscarPorUsername(username: string): Promise<Usuario | null>
  listarPorPessoa(pessoaId: EntityId): Promise<Usuario[]>
  criar(usuario: Usuario): Promise<void>
  atualizar(usuario: Usuario): Promise<void>
}

export interface TipoUsuarioRepository {
  buscarPorId(tipoUsuarioId: TipoUsuarioId): Promise<TipoUsuario | null>
  listar(): Promise<TipoUsuario[]>
}

export interface CustomerRepository {
  buscarPorId(customerId: EntityId): Promise<Customer | null>
  buscarPorUsuario(userId: EntityId): Promise<Customer | null>
  criar(customer: Customer): Promise<void>
  atualizar(customer: Customer): Promise<void>
}

export interface PersonalRepository {
  buscarPorId(personalId: EntityId): Promise<Personal | null>
  buscarPorUsuario(userId: EntityId): Promise<Personal | null>
  listarPorCidade(cidade: string): Promise<Personal[]>
  criar(personal: Personal): Promise<void>
  atualizar(personal: Personal): Promise<void>
}
