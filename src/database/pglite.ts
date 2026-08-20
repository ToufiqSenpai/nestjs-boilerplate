import { EventEmitter } from "node:events"
import { PGlite } from "@electric-sql/pglite"

type PGliteConnectCallback = (error: unknown, client: PGlitePool | null, done: () => void) => void

type PGliteQueryCallback = (error: unknown, result: { rows: any[] } | null) => void

let pgliteInstance: Promise<PGlite> | null = null

function getPGliteInstance(): Promise<PGlite> {
  if (!pgliteInstance) {
    pgliteInstance = PGlite.create({ dataDir: "memory://" })
  }
  return pgliteInstance
}

async function closePGlite(): Promise<void> {
  if (pgliteInstance) {
    const instance = await pgliteInstance
    await instance.close()
    pgliteInstance = null
  }
}

/**
 * Minimal `pg.Pool`-compatible adapter over a shared in-memory PGlite
 * instance. TypeORM's Postgres driver only needs `Pool`, `connect(cb)`,
 * `query(...)` and `end(cb)` — the adapter implements exactly that surface.
 * There is no real pooling: every query runner shares the single PGlite
 * connection, which PGlite serializes internally.
 */
export class PGlitePool extends EventEmitter {
  public connect(callback: PGliteConnectCallback): void {
    getPGliteInstance()
      .then(() => {
        callback(null, this, () => {})
      })
      .catch(error => {
        callback(error, null, () => {})
      })
  }

  public query(
    sql: string,
    params?: any[] | PGliteQueryCallback,
    maybeCallback?: PGliteQueryCallback
  ): Promise<{ rows: any[] }> | undefined {
    let callback: PGliteQueryCallback | undefined
    let parameters: any[] | undefined

    if (typeof params === "function") {
      callback = params
    } else {
      parameters = params
      callback = maybeCallback
    }

    const run = async (): Promise<{ rows: any[] }> => {
      const db = await getPGliteInstance()
      if (parameters && parameters.length > 0) {
        return db.query(sql, parameters)
      }
      // exec returns one result per statement; TypeORM expects the last
      // statement's result (e.g. DDL followed by a SELECT).
      const results = await db.exec(sql)
      return results[results.length - 1] ?? { rows: [] }
    }

    const promise = run()
    promise.then(
      result => {
        callback?.(null, result)
      },
      error => {
        callback?.(error, null)
      }
    )
    return promise
  }

  public end(callback: (error: unknown) => void): void {
    closePGlite()
      .then(() => {
        callback(null)
      })
      .catch(error => {
        callback(error)
      })
  }
}
