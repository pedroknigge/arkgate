# Globpack

Packed-tarball journey for #373. A pnpm workspace: a private application
package (`packages/planner`), a published schema library, a docs site
(`apps/site`) with `og-image/` and `pages/api/`, plus docs and an example.

`packages/planner/src/adapters/` imports `plan.ts` in the same package.
`packages/planner/src/pages/home.ts` imports one of those adapters.
`apps/site/og-image/adapters/store.ts` imports `og-image/utils/font.ts`.
`apps/site/pages/api/health.ts` is a route handler and imports nothing else.
