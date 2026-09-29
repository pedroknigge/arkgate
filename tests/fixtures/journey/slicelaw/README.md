# Slicelaw

Co-located feature tree for the #341 journey. One universe (`projects`), two features
(`rfi`, `scm`). Each feature keeps domain, application, persistence, and UI together
under `src/features/projects/<feature>/`. `src/app/projects/rfi/page.tsx` is a framework
route that cannot move. `src/lib/compliance/hold.ts` is a real owed move.

`ark.config.json` is today's contract: one string `arkRules` path, and both aliases
unpinned. The slice files (`arkrules.DomainModel.json`) are not referenced.
`arkrules/orphan.json` is the top-level drift file the check already warns about.

Later configs are the #341 claims. They are red until a design is implemented:

- `ark.config.array.json` — `arkRules.DomainModel` is two paths.
- `ark.config.duplicate.json` — those two paths share `INV-DUP`.
- `ark.config.discovery.json` — `arkRulesDiscovery.sliceFiles` is `arkrules.<Layer>.json`.
  `include` omits `scm`, so the escaping file is not a governed child root.
- `ark.config.escape.json` — the same discovery, with `scm` governed. Its rule file
  sets `appliesTo` outside the slice.
- `ark.config.pinned-only.json` — the app route is `pinned: true` with
  `reason: "framework-route"`.
- `ark.config.pinned.json` — that pinned route plus the unpinned compliance alias.

Nothing here is fetched at test time.
