import type { Customer } from '../../../domain/entities'
import type { CustomerRepository } from '../../../domain/repositories'
import { create, get, queryAll, replace, requiredTable } from './common'

export class DynamoCustomerRepository implements CustomerRepository {
  constructor(private readonly table = requiredTable(process.env.FITPESO_CUSTOMER_V2_TABLE, 'FITPESO_CUSTOMER_V2_TABLE')) {}
  buscarPorId(id: string) { return get<Customer>(this.table, { customer_id: id }) }
  async buscarPorUsuario(userId: string): Promise<Customer | null> {
    const rows = await queryAll<Customer>(this.table, 'CustomerByUsuario', 'user_id', { S: userId })
    return rows[0] ?? null
  }
  criar(customer: Customer) { return create(this.table, { ...customer }, 'customer_id') }
  atualizar(customer: Customer) { return replace(this.table, { ...customer }, 'customer_id') }
}
