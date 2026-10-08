# Rootbound

Packed-tarball journey for #352. Two trees sit side by side:

- `contract/` holds the Ark contract (`DomainModel` forbids `Date.now`) and a
  domain file that obeys it.
- `target/` is the `--root`. `src/lib/sample/domain/deadline.ts` calls `Date.now()`.

The step is `ark-check --root target --config contract/ark.config.json`. The
config file is outside `--root`. The check has to read `target/` and report
`Date.now` in `deadline.ts`.
