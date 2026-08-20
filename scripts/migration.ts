#!/usr/bin/env node
import { spawnSync } from "child_process"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const command = process.argv[2]
const name = process.argv[3]

const commands = ["generate", "run", "revert", "show", "create"] as const

if (!command || !(commands as readonly string[]).includes(command)) {
  console.error(`Usage: node --import 'data:text/javascript,...' scripts/migration.ts <${commands.join("|")}> [name]`)
  process.exit(1)
}

const dataSourcePath = "src/database/datasource.ts"
const migrationsDir = resolve(root, "src", "database", "migrations")

const args = command === "generate" || command === "create" ? [name ?? "init"] : []

const registerTsNode = [
  "data:text/javascript,",
  'import { register } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  `register("ts-node/esm", pathToFileURL(${JSON.stringify(root + "/")}));`
].join(" ")

const result = spawnSync(
  process.execPath,
  [
    "--import",
    registerTsNode,
    resolve(root, "node_modules", "typeorm", "cli.js"),
    `migration:${command}`,
    "-d",
    dataSourcePath,
    ...(args.length ? [resolve(migrationsDir, args[0])] : [])
  ],
  {
    cwd: root,
    stdio: "inherit"
  }
)

process.exit(result.status ?? 1)
