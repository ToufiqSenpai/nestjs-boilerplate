#!/usr/bin/env node
import { spawnSync } from "child_process"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const name = process.argv[2] ?? "init"

const result = spawnSync(
  "typeorm-ts-node-esm",
  ["migration:create", resolve(root, "src", "database", "migrations", name)],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
)

process.exit(result.status ?? 1)
