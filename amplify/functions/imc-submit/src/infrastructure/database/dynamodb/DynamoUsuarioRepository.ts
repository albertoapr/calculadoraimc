import type { Usuario } from '../../../domain/entities'
import type { UsuarioRepository } from '../../../domain/repositories'
import { create, get, queryAll, replace, requiredTable } from './common'

/**
 * A busca por username utiliza GSI. Unicidade de username e a consistência
 * das referências devem ser garantidas pelo serviço via reservas transacionais.
 */
export class DynamoUsuarioRepository implements UsuarioRepository {
  constructor(private readonly table = requiredTable(process.env.FITPESO_USUARIO_TABLE, 'FITPESO_USUARIO_TABLE')) {}
  buscarPorId(id: string) { return get<Usuario>(this.table, { user_id: id }) }
  async buscarPorUsername(username: string): Promise<Usuario | null> {
    const rows = await queryAll<Usuario>(this.table, 'UsuarioByUsername', 'username', { S: username })
    return rows[0] ?? null
  }
  listarPorPessoa(pessoaId: string) {
    return queryAll<Usuario>(this.table, 'UsuarioByPessoa', 'pessoa_id', { S: pessoaId })
  }
  criar(usuario: Usuario) { return create(this.table, { ...usuario }, 'user_id') }
  atualizar(usuario: Usuario) { return replace(this.table, { ...usuario }, 'user_id') }
}
