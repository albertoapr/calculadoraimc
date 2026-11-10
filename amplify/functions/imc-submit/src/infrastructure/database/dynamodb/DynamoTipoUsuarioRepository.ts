import type { TipoUsuario, TipoUsuarioId } from '../../../domain/entities'
import type { TipoUsuarioRepository } from '../../../domain/repositories'
import { get, requiredTable, scanAll } from './common'

export class DynamoTipoUsuarioRepository implements TipoUsuarioRepository {
  constructor(private readonly table = requiredTable(process.env.FITPESO_TIPO_USUARIO_TABLE, 'FITPESO_TIPO_USUARIO_TABLE')) {}
  buscarPorId(id: TipoUsuarioId) { return get<TipoUsuario>(this.table, { tipo_usuario_id: id }) }
  listar() { return scanAll<TipoUsuario>(this.table) }
}
