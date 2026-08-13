import { describe, it, expect, afterAll } from "vitest"
import request from "supertest"
import { app } from "../../src/main.js"

describe("GET /health/*", () => {
  afterAll(async () => {
    await app.close()
  })

  it("GET /health/live returns 200 with memory_heap up", async () => {
    const res = await request(app.getHttpServer()).get("/health/live").expect(200)
    expect(res.body.status).toBe("ok")
    expect(res.body.details?.memory_heap?.status).toBe("up")
  })

  it("GET /health/ready returns 200 with database up", async () => {
    const res = await request(app.getHttpServer()).get("/health/ready").expect(200)
    expect(res.body.status).toBe("ok")
    expect(res.body.details?.database?.status).toBe("up")
  })

  it("GET /health/deep returns 200 with database and memory details", async () => {
    const res = await request(app.getHttpServer()).get("/health/deep").expect(200)
    expect(res.body.status).toBe("ok")
    expect(res.body.details?.database?.status).toBe("up")
    expect(res.body.details?.memory_heap?.status).toBe("up")
    expect(res.body.details?.memory_rss?.status).toBe("up")
  })
})
