# @boina/db

## Migrations

`bun run db:migrate` is the authoritative migration command for this package.

Migrations are hand-written SQL files in `packages/db/migrations` and are applied by
`packages/db/src/migrate.ts`. The migrator creates and maintains the
`drizzle.__drizzle_migrations` ledger so local Docker databases can be initialized
or updated without relying on Drizzle Kit's generated migration metadata.

For an existing local database that already has the base schema, the migrator
baselines `0000_*.sql` in the ledger and applies later migrations normally. This
keeps the current Docker DB usable while making new databases reproducible from
the SQL migration files.

Do not use `bun run db:generate` for the current hand-written migration flow.
Create a new timestamped or numbered SQL file under `packages/db/migrations`,
split multi-statement files with `--> statement-breakpoint` when needed, then run:

```bash
bun run db:migrate
```
