import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import { createAdapterFactory } from "better-auth/adapters";
import type { CleanedWhere } from "better-auth/adapters";
import { User } from "./entities/user.entity.js";
import { Session } from "./entities/session.entity.js";
import { Account } from "./entities/account.entity.js";
import { Verification } from "./entities/verification.entity.js";

const ENTITY_MAP: Record<string, EntityTarget<ObjectLiteral>> = {
  user: User,
  session: Session,
  account: Account,
  verification: Verification,
};

function getEntity(model: string): EntityTarget<ObjectLiteral> {
  const entity = ENTITY_MAP[model];
  if (!entity) {
    throw new Error(`[typeorm-adapter] Unknown model: "${model}"`);
  }
  return entity;
}

interface WhereQueryBuilder {
  andWhere: (sql: string, params?: Record<string, unknown>) => void;
  orWhere: (sql: string, params?: Record<string, unknown>) => void;
}

export function createTypeormAdapter(dataSource: DataSource) {
  function getColumn(entity: EntityTarget<ObjectLiteral>, field: string) {
    const meta = dataSource.getMetadata(entity);
    const column =
      meta.findColumnWithDatabaseName(field) ?? meta.findColumnWithPropertyName(field);
    if (!column) {
      throw new Error(`[typeorm-adapter] Unknown field "${field}" for model "${meta.name}"`);
    }
    return column;
  }

  function applyWhere(
    qb: WhereQueryBuilder,
    entity: EntityTarget<ObjectLiteral>,
    alias: string,
    where: CleanedWhere[] | undefined,
  ): void {
    where?.forEach((w, i) => {
      const column = getColumn(entity, w.field);
      const col = `${alias}.${column.databaseName}`;
      const param = `p${i}`;
      const op = w.operator ?? "eq";
      const mode = w.mode ?? "sensitive";
      let sql: string;
      let value: unknown = w.value;

      switch (op) {
        case "ne":
          if (value === null) {
            qb.andWhere(`${col} IS NOT NULL`);
            return;
          }
          if (mode === "insensitive" && typeof value === "string") {
            sql = `LOWER(${col}) <> LOWER(:${param})`;
          } else {
            sql = `${col} <> :${param}`;
          }
          break;
        case "lt":
          sql = `${col} < :${param}`;
          break;
        case "lte":
          sql = `${col} <= :${param}`;
          break;
        case "gt":
          sql = `${col} > :${param}`;
          break;
        case "gte":
          sql = `${col} >= :${param}`;
          break;
        case "in":
          if (Array.isArray(value) && value.length === 0) {
            qb.andWhere("1 = 0");
            return;
          }
          sql = `${col} IN (:...${param})`;
          break;
        case "not_in":
          if (Array.isArray(value) && value.length === 0) {
            return;
          }
          sql = `${col} NOT IN (:...${param})`;
          break;
        case "contains":
        case "starts_with":
        case "ends_with": {
          let pattern = String(value);
          if (op === "contains") pattern = `%${pattern}%`;
          else if (op === "starts_with") pattern = `${pattern}%`;
          else pattern = `%${pattern}`;
          if (mode === "insensitive") {
            sql = `LOWER(${col}) LIKE LOWER(:${param})`;
          } else {
            sql = `${col} LIKE :${param}`;
          }
          value = pattern;
          break;
        }
        default:
          if (value === null) {
            qb.andWhere(`${col} IS NULL`);
            return;
          }
          if (mode === "insensitive" && typeof value === "string") {
            sql = `LOWER(${col}) = LOWER(:${param})`;
          } else {
            sql = `${col} = :${param}`;
          }
      }

      const params = { [param]: value };
      if (i === 0 || w.connector === "AND" || w.connector === undefined) {
        qb.andWhere(sql, params);
      } else {
        qb.orWhere(sql, params);
      }
    });
  }

  function getPrimaryKey(entity: EntityTarget<ObjectLiteral>): string {
    return dataSource.getMetadata(entity).primaryColumns[0].propertyName;
  }

  return createAdapterFactory({
    config: {
      adapterId: "typeorm",
      adapterName: "TypeORM Adapter",
      supportsJSON: false,
      supportsArrays: false,
      supportsDates: true,
      supportsBooleans: true,
      usePlural: false,
    },
    adapter: () => {
      return {
        create: async ({ model, data }) => {
          const repo = dataSource.getRepository(getEntity(model));
          const entity = repo.create(data as object);
          return (await repo.save(entity)) as any;
        },

        update: async ({ model, where, update }) => {
          const entity = getEntity(model);
          const alias = model;
          const pk = getPrimaryKey(entity);

          return dataSource.transaction(async (manager) => {
            const idQb = manager
              .createQueryBuilder()
              .select(`${alias}.${pk}`, "id")
              .from(entity, alias);
            applyWhere(idQb, entity, alias, where);
            const rows = await idQb.getRawMany();
            if (rows.length === 0) return null;
            const ids = rows.map((row) => row.id);

            const updateQb = manager.createQueryBuilder().update(entity).set(update);
            applyWhere(updateQb, entity, alias, where);
            await updateQb.execute();

            const findQb = manager.createQueryBuilder().select().from(entity, alias);
            findQb.where(`${alias}.${pk} IN (:...ids)`, { ids });
            return (await findQb.getOne()) ?? null;
          }) as any;
        },

        updateMany: async ({ model, where, update }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource.createQueryBuilder().update(entity).set(update);
          applyWhere(qb, entity, alias, where);
          const result = await qb.execute();
          return result.affected ?? 0;
        },

        findOne: async ({ model, where, select }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource
            .createQueryBuilder()
            .select()
            .from(entity, alias);
          if (select?.length) {
            qb.select(select.map((c) => `${alias}.${getColumn(entity, c).databaseName}`));
          }
          applyWhere(qb, entity, alias, where);
          return ((await qb.getOne()) ?? null) as any;
        },

        findMany: async ({ model, where, limit, select, sortBy, offset }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource
            .createQueryBuilder()
            .select()
            .from(entity, alias);
          if (select?.length) {
            qb.select(select.map((c) => `${alias}.${getColumn(entity, c).databaseName}`));
          }
          applyWhere(qb, entity, alias, where);
          if (limit != null) qb.take(limit);
          if (offset != null) qb.skip(offset);
          if (sortBy) {
            const column = getColumn(entity, sortBy.field);
            qb.orderBy(
              `${alias}.${column.databaseName}`,
              sortBy.direction.toUpperCase() as "ASC" | "DESC",
            );
          }
          return (await qb.getMany()) as any;
        },

        count: async ({ model, where }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource
            .createQueryBuilder()
            .select()
            .from(entity, alias);
          applyWhere(qb, entity, alias, where);
          return qb.getCount();
        },

        delete: async ({ model, where }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource
            .createQueryBuilder()
            .delete()
            .from(entity, alias);
          applyWhere(qb, entity, alias, where);
          await qb.execute();
        },

        deleteMany: async ({ model, where }) => {
          const entity = getEntity(model);
          const alias = model;
          const qb = dataSource
            .createQueryBuilder()
            .delete()
            .from(entity, alias);
          applyWhere(qb, entity, alias, where);
          const result = await qb.execute();
          return result.affected ?? 0;
        },

        incrementOne: async ({ model, where, increment, set }) => {
          const entity = getEntity(model);
          const alias = model;
          const pk = getPrimaryKey(entity);

          return dataSource.transaction(async (manager) => {
            const idQb = manager
              .createQueryBuilder()
              .select(`${alias}.${pk}`, "id")
              .from(entity, alias);
            applyWhere(idQb, entity, alias, where);
            const rows = await idQb.getRawMany();
            if (rows.length === 0) return null;
            const ids = rows.map((row) => row.id);

            const updateQb = manager.createQueryBuilder().update(entity);
            const setStatements: Record<string, unknown> = {};
            const params: Record<string, unknown> = {};
            if (set) {
              for (const [field, value] of Object.entries(set)) {
                const column = getColumn(entity, field);
                setStatements[column.propertyName] = value;
              }
            }
            if (increment) {
              for (const [field, value] of Object.entries(increment)) {
                const column = getColumn(entity, field);
                if (setStatements[column.propertyName] !== undefined) continue;
                setStatements[column.propertyName] = () =>
                  `${column.databaseName} + :inc_${field}`;
                params[`inc_${field}`] = value;
              }
            }
            updateQb.set(setStatements as any).setParameters(params);
            updateQb.where(`${alias}.${pk} IN (:...ids)`, { ids });
            await updateQb.execute();

            const findQb = manager.createQueryBuilder().select().from(entity, alias);
            findQb.where(`${alias}.${pk} IN (:...ids)`, { ids });
            return (await findQb.getOne()) ?? null;
          }) as any;
        },
      };
    },
  });
}
