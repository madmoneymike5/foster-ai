# Prisma 8 — Data Models and Database Layer

## Goal

Prisma ORM 8 is already initialized in this existing Next.js project. Implement the project data models, a cached PostgreSQL database singleton, and the first migration using **Prisma ORM 8's current APIs and conventions**.

This is a Prisma 8 implementation, not a Prisma 7 migration or compatibility exercise. Do not use deprecated Prisma 7 commands, client initialization patterns, or generated-client imports.

## 1. Inspect Existing Configuration

Before making changes:

- Inspect `package.json`, `prisma.config.ts`, the existing `prisma/` directory, and relevant project conventions.
- Confirm the installed Prisma CLI version, PostgreSQL ORM package, Node.js version, and TypeScript version are compatible.
- Preserve the existing project layout and configurations wherever possible.
- Install `@prisma/orm-postgres` if it is not already installed.
- Use current Prisma 8 configuration imports and APIs, including `definePrismaConfig` from `prisma/config` when supported by the installed version.
- Do not rerun Prisma initialization or overwrite existing files unnecessarily.
- Do not downgrade to Prisma 7.

The project uses `.env.local` for its database connection. Ensure Prisma CLI commands load `DATABASE_URL` from `.env.local` correctly. Respect environment variables already supplied by the runtime or deployment platform.

Never expose database credentials or commit environment files.

### Contract configuration

The project uses multiple Prisma model files.

Configure `prisma.config.ts` to load all `.prisma` files recursively beneath `prisma/` using:

`contract: "./prisma/**/*.prisma"`

Preserve the PostgreSQL connection configuration.

Every participating `.prisma` file must begin with:

`// use prisma-8`

Retain the existing root `prisma/schema.prisma` if present. Do not create duplicate or conflicting model declarations.

Prisma 8 contract files must not contain Prisma 7 `generator` or `datasource` blocks.

## 2. Data Models

Create:

`prisma/models/project.prisma`

Implement exactly two models and one enum.

### ProjectStatus enum

Define `ProjectStatus` with these values:

- `DRAFT`
- `ARCHIVED`

Use Prisma 8's PostgreSQL-compatible enum declaration, storing the values as text using `@@type("pg/text@1")`.

### Project

Required fields:

- `id`: UUID primary key, generated on creation using Prisma 8 conventions.
- `ownerId`: String containing the Clerk user ID.
- `name`: Required String.
- `description`: Optional String.
- `status`: ProjectStatus, defaulting to `DRAFT`.
- `canvasJsonPath`: Optional String for future external canvas blob storage.
- `createdAt`: Automatically populated creation timestamp.
- `updatedAt`: Automatically maintained modification timestamp.
- `collaborators`: Relation to ProjectCollaborator.

Indexes:

- `ownerId`
- `createdAt`

Use Prisma 8 timestamp conventions rather than Prisma 7's `@updatedAt`. Prefer the supported `temporal` timestamp helpers, preserving normal JavaScript Date interoperability where appropriate.

The Clerk user ID is an external authentication identifier. Do not create a local User model or foreign-key relation to Clerk.

### ProjectCollaborator

Required fields:

- `projectId`: UUID foreign key referencing Project.
- `project`: Required relation to Project with `onDelete: Cascade`.
- `email`: Required String containing the collaborator's email.
- `createdAt`: Automatically populated creation timestamp.

Constraints and indexes:

- Enforce uniqueness on the combination of `projectId` and `email`.
- Index `email`.
- Add a composite index on `projectId` and `createdAt`.

Use a composite primary key on `[projectId, email]` to enforce uniqueness without introducing an unnecessary surrogate ID, unless an established repository convention requires otherwise.

Do not add invitation states, permission roles, acceptance timestamps, Clerk collaborator IDs, or additional fields.

Ensure the schema correctly defines the relationship in both directions.

## 3. Database Singleton

Create:

`lib/prisma.ts`

Implement a cached **Prisma 8 PostgreSQL database instance**.

Use the current Prisma 8 APIs:

- `postgres` from `@prisma/orm-postgres/runtime`.
- `contractFromJson` from `@prisma/orm-postgres/static`.
- The emitted `contract.json` and `contract.d.ts` files from the project's configured contract directory.

The database instance must be created using `postgres({ contract, url })` or an equivalent documented Prisma 8 PostgreSQL binding.

Requirements:

- Read `DATABASE_URL` from the environment.
- Support ordinary PostgreSQL `postgres://` and `postgresql://` connection strings.
- Use Prisma 8's native PostgreSQL connection handling.
- Export the database instance as `db`.
- Cache the instance on `globalThis` during development to prevent unnecessary connection pools during Next.js hot reloads.
- Preserve TypeScript type safety without using `any`.
- Provide one shared instance per server process.
- Do not close the shared instance after individual requests.
- Restrict database imports to server-side code.
- Validate required runtime configuration without exposing credentials.

Do **not** use:

- `PrismaClient` from `@prisma/client`.
- `PrismaPg` from `@prisma/adapter-pg`.
- `@prisma/extension-accelerate`.
- `withAccelerate()`.
- Prisma 7 generated client imports.

Hosted Prisma Accelerate is being retired. Do not implement special Accelerate branching for `prisma+postgres://` URLs.

If the configured URL uses an unsupported protocol, stop and report that a compatible PostgreSQL connection string is required. Do not silently reinterpret it.

Follow the existing project's conventions for imports, environment loading, and server-only modules.

## 4. Database Migration

Use the Prisma ORM 8 migration workflow.

First, emit the contract:

`npx prisma contract emit`

Verify that the emitted contract includes both models, the enum, their relations, indexes, and constraints.

Next, plan the initial migration:

`npx prisma migration plan --name init`

Review the generated migration and its SQL preview before applying it.

Confirm that the configured connection points to the intended development database. Do not run destructive operations or apply a new initial migration against an existing production database.

Apply the migration using:

`npx prisma db migrate --advance-ref db`

Then verify the database against the contract:

`npx prisma db verify`

Important:

- Do not use `prisma generate`.
- Do not use `prisma migrate dev`.
- Do not use `prisma db push`.
- Do not reset or recreate an existing database.
- Preserve the generated migration history.
- Ensure emitted contract artifacts are available to the application and tracked in version control where required.

If the database cannot be reached, complete contract emission and offline migration planning, but report that migration application and verification remain incomplete.

## 5. Dependencies

Previously installed dependencies may include:

- `prisma`
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`

For Prisma 8, ensure the project has:

- `prisma` — Prisma 8 CLI
- `@prisma/orm-postgres` — Prisma 8 PostgreSQL ORM
- `dotenv` — environment loading where required
- `temporal-polyfill` — if required by the installed PostgreSQL ORM package

Do not assume Prisma 7 dependencies implement Prisma 8 functionality.

Install missing packages only as necessary. Do not remove existing dependencies without first checking whether other application code uses them.

## 6. Verification

When implementation is complete:

1. Confirm both models and the enum appear in the emitted contract.
2. Verify the Project → ProjectCollaborator relation and cascade deletion.
3. Verify uniqueness on project/collaborator email and all requested indexes.
4. Confirm creation and update timestamps use supported Prisma 8 behavior.
5. Confirm `lib/prisma.ts` exports a single cached, correctly typed `db` instance.
6. Confirm that the database connection uses the intended environment configuration.
7. Verify the migration was planned, reviewed, applied, and recorded successfully.
8. Run `npx prisma db verify`.
9. Run `npm run build` and resolve any issues introduced by this implementation.

Do not add unrelated functionality, models, routes, services, or UI components.

## 7. Final Report

When finished, report:

- Files created or modified.
- Dependencies added or changed.
- Whether contract emission succeeded.
- Whether the migration was planned and applied.
- Whether database verification succeeded.
- Whether `npm run build` passed.
- Any remaining errors, blockers, or assumptions.

Do not report a successful migration or build without actually executing and verifying it.

Follow the project's existing coding standards and debug logging conventions. Never print environment secrets, passwords, or database connection strings in logs.