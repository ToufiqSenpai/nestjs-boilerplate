import { EntityManager, Repository } from "typeorm"
import { TransactionContextService } from "./unit-of-work/transaction-context.service.js"
import { createTransactionalRepository } from "./transactional-repository.factory.js"
import { vi } from "vitest"

class TestEntity {
  public id!: string
  public name!: string
}

function createMocks() {
  const defaultManager = { isDefault: true } as unknown as EntityManager
  const txManager = { isTx: true } as unknown as EntityManager

  const baseRepository = {
    manager: defaultManager,
    save: vi.fn(),
    find: vi.fn()
  } as unknown as Repository<TestEntity>

  const dataSource = {
    getRepository: vi.fn().mockReturnValue(baseRepository)
  } as any

  const context = new TransactionContextService<EntityManager>()

  return { baseRepository, defaultManager, txManager, dataSource, context }
}

describe("createTransactionalRepository", () => {
  it("should fall back to the default manager outside a transaction", () => {
    const { dataSource, context, defaultManager } = createMocks()

    const repository = createTransactionalRepository(dataSource, TestEntity, context)

    expect(repository.manager).toBe(defaultManager)
  })

  it("should use the transactional manager inside a transaction", async () => {
    const { dataSource, context, txManager } = createMocks()

    const repository = createTransactionalRepository(dataSource, TestEntity, context)

    await context.run(txManager, async () => {
      expect(repository.manager).toBe(txManager)
    })
  })

  it("should route repository operations through the transactional manager", async () => {
    const { dataSource, context, txManager, baseRepository } = createMocks()

    const repository = createTransactionalRepository(dataSource, TestEntity, context)

    await context.run(txManager, async () => {
      const entity = new TestEntity()
      await repository.save(entity)
    })

    expect(baseRepository.save).toHaveBeenCalledTimes(1)
  })

  it("should return the default manager again after the transaction ends", async () => {
    const { dataSource, context, txManager, defaultManager } = createMocks()

    const repository = createTransactionalRepository(dataSource, TestEntity, context)

    await context.run(txManager, async () => {
      expect(repository.manager).toBe(txManager)
    })

    expect(repository.manager).toBe(defaultManager)
  })
})
