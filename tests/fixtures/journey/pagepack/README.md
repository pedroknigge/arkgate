# Pagepack

Packed-tarball journey for #380. Anonymized pnpm workspace: a library under
`packages/tokens`, a parent package `site` (its own `src/`), and a nested
Next.js pages-router app `site/studio`.

`site/studio/pages/api/*.ts` imports sibling helpers in `utils/` and `lib/`.
`start --apply` must not put those helpers on Presentation while `pages/api`
is Application. The first `check:architecture` exits 0. Short `--doctor`
names failing violations and does not recommend requiring `--strict-merge`
while that check is red.
