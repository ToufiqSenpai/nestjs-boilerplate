import { DataSource, EntityManager, QueryRunner } from "typeorm";
import { UnitOfWork } from "./unit-of-work.js";
import { TransactionContextService } from "./transaction-context.service.js";
import { vi } from "vitest";

function createMocks() {
  const dataSource = { createQueryRunner: vi.fn() } as unknown as DataSource;
  const queryRunner = {
    manager: {} as EntityManager,
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueryRunner;

  dataSource.createQueryRunner.mockReturnValue(queryRunner);

  const context = new TransactionContextService<EntityManager>();
  const unitOfWork = new UnitOfWork(dataSource, context);

  return { dataSource, queryRunner, context, unitOfWork };
}

describe("UnitOfWork", () => {
  beforeEach(() => {
    UnitOfWork.instance = null;
  });

  it("should expose itself through the static instance reference", () => {
    const { unitOfWork } = createMocks();
    expect(UnitOfWork.instance).toBe(unitOfWork);
  });

  it("should commit and return the callback result", async () => {
    const { queryRunner, unitOfWork } = createMocks();

    const result = await unitOfWork.transaction(async () => "ok");

    expect(result).toBe("ok");
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("should expose the transactional manager inside the callback", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    let seenManager: EntityManager | undefined;

    await unitOfWork.transaction(async () => {
      seenManager = unitOfWork["transactionContext"].getContext();
    });

    expect(seenManager).toBe(queryRunner.manager);
  });

  it("should roll back and rethrow when the callback throws", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    const error = new Error("boom");

    await expect(
      unitOfWork.transaction(async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("should release the query runner even if rollback fails", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    const rollbackError = new Error("rollback failed");
    queryRunner.rollbackTransaction.mockRejectedValueOnce(rollbackError);

    await expect(
      unitOfWork.transaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(rollbackError);

    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("should not roll back if the transaction never started", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    const startError = new Error("start failed");
    queryRunner.startTransaction.mockRejectedValueOnce(startError);

    await expect(
      unitOfWork.transaction(async () => "never reached"),
    ).rejects.toThrow(startError);

    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("should reuse an existing transaction instead of nesting (propagation)", async () => {
    const { queryRunner, dataSource, unitOfWork } = createMocks();

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(async () => "inner");
    });

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("should clear the context after the transaction finishes", async () => {
    const { unitOfWork } = createMocks();

    await unitOfWork.transaction(async () => "ok");

    expect(unitOfWork["transactionContext"].getContext()).toBeUndefined();
  });

  it("should pass the isolation level to startTransaction", async () => {
    const { queryRunner, unitOfWork } = createMocks();

    await unitOfWork.transaction(async () => "ok", {
      isolationLevel: "SERIALIZABLE",
    });

    expect(queryRunner.startTransaction).toHaveBeenCalledWith("SERIALIZABLE");
  });

  it("should start a new transaction with REQUIRES_NEW even when one is active", async () => {
    const { dataSource, queryRunner, unitOfWork } = createMocks();

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(async () => "inner", {
        propagation: "REQUIRES_NEW",
      });
    });

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(2);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(2);
    expect(queryRunner.release).toHaveBeenCalledTimes(2);
  });

  it("should throw for MANDATORY when no transaction is active", async () => {
    const { queryRunner, unitOfWork } = createMocks();

    await expect(
      unitOfWork.transaction(async () => "nope", {
        propagation: "MANDATORY",
      }),
    ).rejects.toThrow("MANDATORY");

    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it("should run onCommit after a successful commit", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    const onCommit = vi.fn();

    await unitOfWork.transaction(async () => "ok", { onCommit });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("should run onRollback with the error after a rollback", async () => {
    const { queryRunner, unitOfWork } = createMocks();
    const onRollback = vi.fn();
    const error = new Error("boom");

    await expect(
      unitOfWork.transaction(
        async () => {
          throw error;
        },
        { onRollback },
      ),
    ).rejects.toThrow(error);

    expect(onRollback).toHaveBeenCalledWith(error);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it("should not run onCommit when the callback throws", async () => {
    const { unitOfWork } = createMocks();
    const onCommit = vi.fn();

    await expect(
      unitOfWork.transaction(async () => {
        throw new Error("boom");
      }, { onCommit }),
    ).rejects.toThrow();

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("should not call hooks when joining an existing transaction", async () => {
    const { unitOfWork } = createMocks();
    const onCommit = vi.fn();
    const onRollback = vi.fn();

    await unitOfWork.transaction(async () => {
      await unitOfWork.transaction(
        async () => "inner",
        { onCommit, onRollback },
      );
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onRollback).not.toHaveBeenCalled();
  });
});
