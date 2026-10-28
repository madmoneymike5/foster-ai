import { config } from "dotenv";
// Load DATABASE_URL from .env.local for CLI commands (contract emit, migrations,
// verify). Default override=false: variables already supplied by the runtime or
// deployment platform win over the file.
config({ path: ".env.local" });
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

export default definePrismaConfig({
  orm: ormConfig({
    // Multi-file contract: every .prisma file beneath prisma/ (root schema.prisma
    // + prisma/models/*.prisma).
    contract: "./prisma/**/*.prisma",
    // Deterministic artifact directory (contract emit writes contract.json and
    // contract.d.ts into it) so lib/prisma.ts can import stable paths regardless
    // of which source files exist.
    output: "./prisma",
    db: {
      connection: process.env["DATABASE_URL"]!,
    },
  }),
});
