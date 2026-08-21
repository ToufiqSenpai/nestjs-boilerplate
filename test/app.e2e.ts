import { DataSource } from "typeorm"
import { User } from "./../src/modules/auth/entities/user.entity.js"
import { app } from "../src/main.js"

describe("AppController (e2e)", () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = app.get(DataSource)
  })

  it("runs against an in-memory PGlite database", async () => {
    const repository = dataSource.getRepository(User)
    const user = await repository.save(repository.create({ name: "Test User", email: "test@example.com" }))

    expect(user.id).toBeDefined()
    expect(user.id[14]).toBe("7")
    expect(user.emailVerified).toBe(false)

    const found = await repository.findOneBy({ id: user.id })
    expect(found?.name).toBe("Test User")
    expect(found?.email).toBe("test@example.com")

    // Clean up so the shared in-memory DB stays tidy for other suites
    await repository.delete({ id: user.id })
  })
})
