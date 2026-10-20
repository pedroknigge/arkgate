# Sortlint

Packed-tarball journey for #367. A pnpm workspace:

- Root `devDependencies` are alphabetical. `scripts/sorted-deps.mjs` is the
  postinstall lint and fails when they are not.
- `apps/web/tsconfig.json` extends `@repo/tsconfig/base.json`. That workspace
  package is not installed, so a check before `pnpm install` cannot read it.

The harness installs the packed tarball without rewriting `package.json`.
`ark start --apply` is the edit that inserts `arkgate`.
