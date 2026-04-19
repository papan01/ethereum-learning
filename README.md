# Ethereum Cathay

Monorepo foundation: **Next.js** (`apps/web`), **Node API** (`apps/api`), **Prisma + PostgreSQL** (`apps/api/packages/db`), and **Hardhat** (`apps/contracts`), with **Sign-In with Ethereum (SIWE)**.

Shared TypeScript presets live under [`tooling/tsconfig`](tooling/tsconfig) (not a runtime package).

## Prerequisites

- Node.js 22.10+（Hardhat 3 最低需求；Prisma ORM 7 亦相容）
- [pnpm](https://pnpm.io/) 9+
- **PostgreSQL** running locally (or any reachable instance)

## Quick start

1. **Create a local database**

Create an empty database (example name `ethereum_cathay`) in your local Postgres, and a user with access to it.

2. **Install dependencies**

```bash
pnpm install
```

3. **Configure environment**

Copy [`.env.example`](.env.example) to the repo root `.env` and set `DATABASE_URL` to your local connection string (host/port/user/password/database).

4. **Generate Prisma client + migrate**

```bash
pnpm db:generate
pnpm db:migrate
```

`db:migrate` / `db:push` load environment variables from the repo-root `.env` via `dotenv-cli`.

5. **Run web + API**

```bash
pnpm dev
```

`apps/web/next.config.ts` loads the repo-root `.env` so `NEXT_PUBLIC_*` values are available during `next dev` / `next build` without duplicating env files.

- Web: `http://localhost:3000`
- API: `http://localhost:3001` (the web app calls it via Next rewrite at `/api-proxy/*` so cookies stay first-party)

## SIWE notes

- `SIWE_CHAIN_ID` in the API must match `NEXT_PUBLIC_SIWE_CHAIN_ID` in the web app.
- For local Hardhat / chain `31337`, run a wallet on that chain (e.g. MetaMask “Localhost 8545”) before signing.
- `WEB_ORIGIN` must match the browser origin that loads the Next app (default `http://localhost:3000`).

## Useful commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run `web` + `api` in parallel |
| `pnpm db:migrate` | Prisma migrate (dev) |
| `pnpm db:push` | Prisma `db push` (schema sync without migration files) |
| `pnpm contracts:compile` | Hardhat 3：`contracts` 的 `build`（編譯合約） |

## Production considerations (later)

- Serve the web app and API under a coherent HTTPS setup; align SIWE `domain` / `uri` with public URLs.
- Set `NODE_ENV=production` so the API sets `Secure` cookies.
- Prefer `pnpm db:migrate` in CI/CD with `prisma migrate deploy` against a managed Postgres instance.
