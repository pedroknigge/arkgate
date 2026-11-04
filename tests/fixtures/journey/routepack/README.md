# Routepack

Packed-tarball journey for a stock pnpm + turbo workspace. Three apps
(`next`, `expo`, `start`) and shared packages (`api`, `auth`, `db`, `ui`,
`validators`), plus `tooling/`.

`apps/next/src/app/api/**/route.ts` imports `src/auth/server.ts`. The API
package imports the db package (`@routepack/db`, `@routepack/db/schema`,
`@routepack/db/client`). App UI imports the db schema. Each app's
`src/auth/server.ts` imports the auth package.

`start --apply` must leave `check:architecture` exiting 0 after install.
A check before that install is a partial count.
