import { describe, expect, it } from "vitest"
import { StorageKey } from "./storage-key.js"

describe("StorageKey", () => {
  describe("new StorageKey(collection, name)", () => {
    it("should create a key and expose collection/name", () => {
      const key = new StorageKey("avatars", "a.png")
      expect(key.collection).toBe("avatars")
      expect(key.name).toBe("a.png")
      expect(key.toString()).toBe("avatars/a.png")
    })

    it("should sanitize unsafe characters", () => {
      const key = new StorageKey("../avatars", "a/../../etc.png")
      expect(key.toString()).toBe("..avatars/a....etc.png")
    })

    it("should throw when collection or name is empty", () => {
      expect(() => new StorageKey("", "a.png")).toThrow()
      expect(() => new StorageKey("avatars", "")).toThrow()
    })

    it("should throw when sanitized segment becomes empty", () => {
      expect(() => new StorageKey("/", "a.png")).toThrow()
      expect(() => new StorageKey("avatars", "/")).toThrow()
    })
  })

  describe("new StorageKey(key)", () => {
    it("should parse a full key", () => {
      const key = new StorageKey("avatars/a.png")
      expect(key.collection).toBe("avatars")
      expect(key.name).toBe("a.png")
      expect(key.toString()).toBe("avatars/a.png")
    })

    it("should sanitize segments from key", () => {
      expect(new StorageKey("ava\\tars/a.png").toString()).toBe("avatars/a.png")
      expect(new StorageKey("avatars", "a/../../etc.png").toString()).toBe("avatars/a....etc.png")
    })

    it("should throw for invalid key format", () => {
      expect(() => new StorageKey("")).toThrow()
      expect(() => new StorageKey("avatars")).toThrow()
      expect(() => new StorageKey("a/b/c")).toThrow()
      expect(() => new StorageKey("/a.png")).toThrow()
      expect(() => new StorageKey("avatars/")).toThrow()
    })
  })

  describe("equals", () => {
    it("should return true for equal keys", () => {
      expect(new StorageKey("a", "b").equals(new StorageKey("a/b"))).toBe(true)
    })

    it("should return false for different keys", () => {
      expect(new StorageKey("a", "b").equals(new StorageKey("a", "c"))).toBe(false)
    })
  })
})
