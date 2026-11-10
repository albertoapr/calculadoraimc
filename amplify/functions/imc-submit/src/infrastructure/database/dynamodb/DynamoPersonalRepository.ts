import type { Personal } from '../../../domain/entities'
import type { PersonalRepository } from '../../../domain/repositories'
import { create, get, queryAll, replace, requiredTable } from './common'

export class DynamoPersonalRepository implements PersonalRepository {
  constructor(private readonly table = requiredTable(process.env.FITPESO_PERSONAL_V2_TABLE, 'FITPESO_PERSONAL_V2_TABLE')) {}
  buscarPorId(id: string) { return get<Personal>(this.table, { personal_id: id }) }
  async buscarPorUsuario(userId: string): Promise<Personal | null> {
    const rows = await queryAll<Personal>(this.table, 'PersonalByUsuario', 'user_id', { S: userId })
    return rows[0] ?? null
  }
  listarPorCidade(cidade: string) {
    return queryAll<Personal>(this.table, 'PersonalByCidade', 'cidade', { S: cidade })
  }
  criar(personal: Personal) { return create(this.table, { ...personal }, 'personal_id') }
  atualizar(personal: Personal) { return replace(this.table, { ...personal }, 'personal_id') }
}
