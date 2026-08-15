import { Injectable } from "@nestjs/common"
import { AsyncLocalStorage } from "async_hooks"
import { DataSource, EntityManager } from "typeorm"
import type { IsolationLevel } from "typeorm/driver/types/IsolationLevel.js"

export const Propagation = {
  REQUIRED: "REQUIRED",
  REQUIRES_NEW: "REQUIRES_NEW",
  MANDATORY: "MANDATORY"
} as const

export type Propagation = (typeof Propagation)[keyof typeof Propagation]

export interface TransactionOptions {
  /** Whether the callback may run inside an existing transaction. */
  propagation?: Propagation
  /** Isolation level of the transaction when a new one is started. */
  isolationLevel?: IsolationLevel
  /** Runs after a successful commit. */
  onCommit?: () => Promise<void> | void
  /** Runs after a rollback. */
  onRollback?: (error: unknown) => Promise<void> | void
}

@Injectable()
export class UnitOfWork {
  public static instance: UnitOfWork | null = null

  private readonly storage = new AsyncLocalStorage<EntityManager>()

  public constructor(private readonly dataSource: DataSource) {
    UnitOfWork.instance = this
  }

  /** Returns the `EntityManager` of the active transaction, if any. */
  public getContext(): EntityManager | undefined {
    return this.storage.getStore()
  }

  /**
   * Executes the callback within a database transaction.
   *
   * Propagation semantics:
   * - `REQUIRED` (default): join an existing transaction, otherwise start one.
   * - `REQUIRES_NEW`: always start a new (independent) transaction.
   * - `MANDATORY`: must run inside an existing transaction, otherwise throw.
   */
  public async transaction<T>(callback: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    const { propagation = "REQUIRED" } = options
    const activeManager = this.getContext()

    if (propagation === Propagation.REQUIRED && activeManager) {
      return callback()
    }
    if (propagation === Propagation.MANDATORY && !activeManager) {
      throw new Error("@Transactional: propagation=MANDATORY requires an existing transaction, but none is active.")
    }

    const queryRunner = this.dataSource.createQueryRunner()
    let transactionStarted = false
    try {
      await queryRunner.connect()
      await queryRunner.startTransaction(options.isolationLevel)
      transactionStarted = true

      const result = await this.storage.run(queryRunner.manager, callback)
      await queryRunner.commitTransaction()
      await options.onCommit?.()
      return result
    } catch (error) {
      if (transactionStarted) {
        await queryRunner.rollbackTransaction()
      }
      await options.onRollback?.(error)
      throw error
    } finally {
      await queryRunner.release()
    }
  }
}
