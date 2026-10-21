# Workpack

Packed-tarball journey for #366. A pnpm + turbo workspace: three apps (`web`,
`expo`, `start`) and shared packages (`ui`, `db`, `auth`, `api`, `validators`,
`billing`). The database package lives in `packages/db` and publishes `@repo/data`.

`apps/web/components/header.tsx` imports the shared Button. That import is not
a domain violation. `packages/billing/src/domain/invoice.ts` imports the
database package. That import is a violation. `packages/ui/src/badge.tsx`
imports the billing domain. That import is a violation.
`packages/api/src/router.ts` calls `Date.now` and `Math.random`. That is not a
domain global.
