import { Injectable } from "@nestjs/common"
import { DataSource, EntityManager } from "typeorm"
import type { IsolationLevel } from "typeorm/driver/types/IsolationLevel.js"
import { TransactionContextService } from "./transaction-context.service.js"

export enum Propagation {
  REQUIRED,
  REQUIRES_NEW,
  MANDATORY
}

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

  public constructor(
    private readonly dataSource: DataSource,
    private readonly transactionContext: TransactionContextService<EntityManager>
  ) {
    UnitOfWork.instance = this
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
    const activeManager = this.transactionContext.getContext()

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

      const result = await this.transactionContext.run(queryRunner.manager, callback)
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
