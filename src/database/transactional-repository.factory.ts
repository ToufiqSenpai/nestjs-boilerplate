import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from "typeorm"
import { TransactionContextService } from "./unit-of-work/transaction-context.service.js"

/**
 * Wraps a standard TypeORM `Repository` in a Proxy so that its `manager`
 * is resolved from the active transaction context.
 *
 * When a transaction is running (an `EntityManager` is present in the
 * AsyncLocalStorage context), every repository operation (`find`, `save`,
 * `createQueryBuilder`, ...) goes through that transactional manager. When no
 * transaction is active, the repository falls back to the default manager.
 *
 * This lets you keep injecting plain `Repository<Entity>` via
 * `@InjectRepository` without writing custom repository classes.
 */
export function createTransactionalRepository<T extends ObjectLiteral>(
  dataSource: DataSource,
  entity: EntityTarget<T>,
  context: TransactionContextService<EntityManager>
): Repository<T> {
  const baseRepository = dataSource.getRepository(entity)

  return new Proxy(baseRepository, {
    get(target, property, receiver) {
      if (property === "manager") {
        return context.getContext() ?? target.manager
      }
      return Reflect.get(target, property, receiver)
    }
  })
}
