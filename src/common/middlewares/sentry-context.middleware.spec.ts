import { Request, Response, NextFunction } from "express"
import { SentryContextMiddleware } from "./sentry-context.middleware.js"

const setUser = vi.fn()
const setTag = vi.fn()

vi.mock("@sentry/nestjs", () => ({
  setUser: (...args: unknown[]) => setUser(...args),
  setTag: (...args: unknown[]) => setTag(...args)
}))

describe("SentryContextMiddleware", () => {
  let middleware: SentryContextMiddleware

  beforeEach(() => {
    middleware = new SentryContextMiddleware()
    vi.clearAllMocks()
  })

  it("should set user and role tag when req.user present", () => {
    const req = { user: { id: "u1", email: "a@b.com", role: "admin" } } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    middleware.use(req, {} as Response, next)

    expect(setUser).toHaveBeenCalledWith({ id: "u1", email: "a@b.com" })
    expect(setTag).toHaveBeenCalledWith("user.role", "admin")
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("should set user without role tag when role missing", () => {
    const req = { user: { id: "u2", email: "b@b.com" } } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    middleware.use(req, {} as Response, next)

    expect(setUser).toHaveBeenCalledWith({ id: "u2", email: "b@b.com" })
    expect(setTag).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("should handle id coercion and undefined email", () => {
    const req = { user: { id: 123 as unknown as string } } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    middleware.use(req, {} as Response, next)

    expect(setUser).toHaveBeenCalledWith({ id: "123", email: undefined })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("should not set user when req has no user", () => {
    const req = {} as Request
    const next = vi.fn() as unknown as NextFunction

    middleware.use(req, {} as Response, next)

    expect(setUser).not.toHaveBeenCalled()
    expect(setTag).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("should always call next", () => {
    const next = vi.fn() as unknown as NextFunction

    middleware.use({} as Request, {} as Response, next)
    middleware.use({ user: { id: "x" } } as unknown as Request, {} as Response, next)

    expect(next).toHaveBeenCalledTimes(2)
  })
})
