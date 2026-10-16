# Storefront

Packed-tarball journey for #361. A root-level Next.js App Router app: `app/`,
`components/`, `lib/`, and `hooks/` sit next to `package.json`. There is no `src/`.

`lib/db.ts` imports `@/components/icons` (PersistenceAdapters → PresentationAdapters).
`start` writes the contract. The run is wrong when governed coverage is 100% while
`components/` and `lib/` stay outside `include`, and when `ark-check` exits 0.
