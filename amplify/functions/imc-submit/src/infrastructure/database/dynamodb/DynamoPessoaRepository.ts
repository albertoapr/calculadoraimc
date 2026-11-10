import type { Pessoa } from '../../../domain/entities'
import type { PessoaRepository } from '../../../domain/repositories'
import { create, get, replace, requiredTable } from './common'

export class DynamoPessoaRepository implements PessoaRepository {
  constructor(private readonly table = requiredTable(process.env.FITPESO_PESSOA_TABLE, 'FITPESO_PESSOA_TABLE')) {}
  buscarPorId(id: string) { return get<Pessoa>(this.table, { pessoa_id: id }) }
  criar(pessoa: Pessoa) { return create(this.table, { ...pessoa }, 'pessoa_id') }
  atualizar(pessoa: Pessoa) { return replace(this.table, { ...pessoa }, 'pessoa_id') }
}
