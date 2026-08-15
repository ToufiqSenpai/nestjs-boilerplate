import { DynamicModule, Module } from "@nestjs/common"
import { getRepositoryToken } from "@nestjs/typeorm"
import { DataSource, EntitySchema } from "typeorm"
import { UnitOfWork } from "./unit-of-work/unit-of-work.js"

export type EntityClassOrSchema = EntitySchema | (new (...args: any[]) => object)

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
    const providers = entities.map(entity => ({
      provide: getRepositoryToken(entity),
      useFactory(dataSource: DataSource, unitOfWork: UnitOfWork) {
        const baseRepository = dataSource.getRepository(entity)

        return new Proxy(baseRepository, {
          get(target, property, receiver) {
            if (property === "manager") {
              return unitOfWork.getContext() ?? target.manager
            }
            return Reflect.get(target, property, receiver)
          }
        })
      },
      inject: [DataSource, UnitOfWork]
    }))

    return {
      module: RepositoryModule,
      providers,
      exports: providers
    }
  }
}
