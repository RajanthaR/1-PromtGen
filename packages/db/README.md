# @promptgen/db

PromptForge Studio uses Drizzle for the Phase 1 data layer.

Drizzle keeps the Postgres schema typed in TypeScript while leaving migrations as checked-in SQL.
That matches the modular-monolith shape in the spec without adding a generated client step.

## Scripts

- `pnpm db:migrate` applies checked-in SQL migrations to `DATABASE_URL`.
- `pnpm db:reset` drops and recreates the `public` schema for `DATABASE_URL`, then reapplies
  migrations.

`db:reset` refuses to run when `NODE_ENV=production`.
