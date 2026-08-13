import { TransactionContextService } from "./transaction-context.service.js"

describe("TransactionContextService", () => {
  let service: TransactionContextService<unknown>

  beforeEach(() => {
    service = new TransactionContextService<unknown>()
  })

  it("should return undefined when no context is set", () => {
    expect(service.getContext()).toBeUndefined()
  })

  it("should expose the context inside run() and clear it after", async () => {
    const context = { txId: "tx-1" }

    await service.run(context, async () => {
      expect(service.getContext()).toBe(context)
    })

    expect(service.getContext()).toBeUndefined()
  })

  it("should propagate the context through async work", async () => {
    const context = { txId: "tx-2" }

    await service.run(context, async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(service.getContext()).toBe(context)
    })
  })

  it("should isolate concurrent executions", async () => {
    const seen: unknown[] = []

    const first = service.run({ id: "first" }, async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      seen.push(service.getContext())
    })
    const second = service.run({ id: "second" }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      seen.push(service.getContext())
    })

    await Promise.all([first, second])

    expect(seen).toContainEqual({ id: "first" })
    expect(seen).toContainEqual({ id: "second" })
  })

  it("should nest contexts correctly", async () => {
    const outer = { id: "outer" }
    const inner = { id: "inner" }
    const seen: unknown[] = []

    await service.run(outer, async () => {
      seen.push(service.getContext())
      await service.run(inner, async () => {
        seen.push(service.getContext())
      })
      seen.push(service.getContext())
    })

    expect(seen).toEqual([outer, inner, outer])
  })

  it("should propagate errors from the callback", async () => {
    const error = new Error("boom")

    await expect(
      service.run({}, async () => {
        throw error
      })
    ).rejects.toThrow(error)
  })
})
