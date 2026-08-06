import { DynamicModule, Module } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, EntityManager, EntitySchema } from "typeorm";
import { TransactionContextService } from "./unit-of-work/transaction-context.service.js";
import { createTransactionalRepository } from "./transactional-repository.factory.js";

export type EntityClassOrSchema = EntitySchema | (new (...args: any[]) => object);

/**
 * Provides transaction-aware `Repository<Entity>` instances.
 *
 * Replace `TypeOrmModule.forFeature([...])` with
 * `RepositoryModule.forFeature([...])` and keep using `@InjectRepository(Entity)`
 * exactly as before — but now repositories automatically join the transaction
 * opened by `UnitOfWork` / `@Transactional`.
 */
@Module({})
export class RepositoryModule {
  public static forFeature(entities: EntityClassOrSchema[]): DynamicModule {
    const providers = entities.map((entity) => ({
      provide: getRepositoryToken(entity),
      useFactory: (
        dataSource: DataSource,
        context: TransactionContextService<EntityManager>,
      ) =>
        createTransactionalRepository(
          dataSource,
          entity as never,
          context,
        ),
      inject: [DataSource, TransactionContextService],
    }));

    return {
      module: RepositoryModule,
      providers,
      exports: providers,
    };
  }
}
