# Rollpack

Packed-tarball journey for #376. One TypeScript library: `package.json` with
`exports`, `src/index.ts`, and root tool configs (`rollup.config.mjs`,
`vite.config.ts`, `eslint.config.mjs`) that call `process`.

`pnpm-workspace.yaml` holds only `allowBuilds`. It has no `packages:` key.
That file is pnpm settings, not a workspace. `start` should choose
`library-sdk`. The root configs must not land in DomainModel. The first
check must exit 0. Apply must not report clean coverage when that check
would fail on a violation Ark created.
