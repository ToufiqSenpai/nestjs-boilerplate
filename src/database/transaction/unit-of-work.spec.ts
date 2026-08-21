import { DataSource, EntityManager, QueryRunner } from "typeorm"
import { UnitOfWork } from "./unit-of-work.js"
import { vi } from "vitest"
import { mock } from "vitest-mock-extended"
import { Test } from "@nestjs/testing"

function createMocks() {
  const mockDataSource = mock<DataSource>()
  const mockQueryRunner = mock<QueryRunner>()
  const mockManager = mock<EntityManager>()
  mockQueryRunner.manager = mockManager
  mockQueryRunner.connect.mockResolvedValue(undefined)
  mockQueryRunner.startTransaction.mockResolvedValue(undefined)
  mockQueryRunner.commitTransaction.mockResolvedValue(undefined)
  mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined)
  mockQueryRunner.release.mockResolvedValue(undefined)

  mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner)

  return { dataSource: mockDataSource, queryRunner: mockQueryRunner, manager: mockManager }
}

async function createUnitOfWork(mocks: ReturnType<typeof createMocks>): Promise<{ unitOfWork: UnitOfWork; moduleRef: unknown }> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UnitOfWork,
      { provide: DataSource, useValue: mocks.dataSource }
    ]
  }).compile()
  const unitOfWork = moduleRef.get(UnitOfWork)
  return { unitOfWork, moduleRef }
}

describe("UnitOfWork", () => {
  beforeEach(() => {
    UnitOfWork.instance = null
  })

  it("should expose itself through the static instance reference", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    expect(UnitOfWork.instance).toBe(unitOfWork)
  })

  it("should commit and return the callback result", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    const result = await unitOfWork.transaction(async () => "ok")

    expect(result).toBe("ok")
    expect(mocks.queryRunner.connect).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.startTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.rollbackTransaction).not.toHaveBeenCalled()
    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it("should expose the transactional manager inside the callback", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    let seenManager: EntityManager | undefined

    await unitOfWork.transaction(async () => {
      seenManager = unitOfWork.getContext()
    })

    expect(seenManager).toBe(mocks.queryRunner.manager)
  })

  it("should roll back and rethrow when the callback throws", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const error = new Error("boom")

    await expect(
      unitOfWork.transaction(async () => {
        throw error
      })
    ).rejects.toThrow(error)

    expect(mocks.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.commitTransaction).not.toHaveBeenCalled()
    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it("should release the query runner even if rollback fails", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const rollbackError = new Error("rollback failed")
    mocks.queryRunner.rollbackTransaction.mockRejectedValueOnce(rollbackError)

    await expect(
      unitOfWork.transaction(async () => {
        throw new Error("boom")
      })
    ).rejects.toThrow(rollbackError)

    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it("should not roll back if the transaction never started", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const startError = new Error("start failed")
    mocks.queryRunner.startTransaction.mockRejectedValueOnce(startError)

    await expect(unitOfWork.transaction(async () => "never reached")).rejects.toThrow(startError)

    expect(mocks.queryRunner.rollbackTransaction).not.toHaveBeenCalled()
    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it("should reuse an existing transaction instead of nesting (propagation)", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(async () => "inner")
    })

    expect(mocks.dataSource.createQueryRunner).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.startTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it("should clear the context after the transaction finishes", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    await unitOfWork.transaction(async () => "ok")

    expect(unitOfWork.getContext()).toBeUndefined()
  })

  it("should pass the isolation level to startTransaction", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    await unitOfWork.transaction(async () => "ok", {
      isolationLevel: "SERIALIZABLE"
    })

    expect(mocks.queryRunner.startTransaction).toHaveBeenCalledWith("SERIALIZABLE")
  })

  it("should start a new transaction with REQUIRES_NEW even when one is active", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(async () => "inner", {
        propagation: "REQUIRES_NEW"
      })
    })

    expect(mocks.dataSource.createQueryRunner).toHaveBeenCalledTimes(2)
    expect(mocks.queryRunner.startTransaction).toHaveBeenCalledTimes(2)
    expect(mocks.queryRunner.commitTransaction).toHaveBeenCalledTimes(2)
    expect(mocks.queryRunner.release).toHaveBeenCalledTimes(2)
  })

  it("should throw for MANDATORY when no transaction is active", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)

    await expect(
      unitOfWork.transaction(async () => "nope", {
        propagation: "MANDATORY"
      })
    ).rejects.toThrow("MANDATORY")

    expect(mocks.queryRunner.startTransaction).not.toHaveBeenCalled()
  })

  it("should run onCommit after a successful commit", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const onCommit = vi.fn()

    await unitOfWork.transaction(async () => "ok", { onCommit })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(mocks.queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
  })

  it("should run onRollback with the error after a rollback", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const onRollback = vi.fn()
    const error = new Error("boom")

    await expect(
      unitOfWork.transaction(
        async () => {
          throw error
        },
        { onRollback }
      )
    ).rejects.toThrow(error)

    expect(onRollback).toHaveBeenCalledWith(error)
    expect(mocks.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1)
  })

  it("should not run onCommit when the callback throws", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const onCommit = vi.fn()

    await expect(
      unitOfWork.transaction(
        async () => {
          throw new Error("boom")
        },
        { onCommit }
      )
    ).rejects.toThrow()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it("should not call hooks when joining an existing transaction", async () => {
    const mocks = createMocks()
    const { unitOfWork } = await createUnitOfWork(mocks)
    const onCommit = vi.fn()
    const onRollback = vi.fn()

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(async () => "inner", { onCommit, onRollback })
    })

    expect(onCommit).not.toHaveBeenCalled()
    expect(onRollback).not.toHaveBeenCalled()
  })
})
