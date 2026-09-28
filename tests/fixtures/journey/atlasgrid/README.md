# Atlasgrid

Anonymized Next-style app used as a packed-tarball journey fixture for hierarchical slices.
Four universes (management, projects, external, operations), each with two or three features,
laid out on three trees: `components/features`, `lib/features`, and `lib/repositories/features`.

`ark.config.json` is today's universe wall: `peerIsolation` with `sliceFolders: ["features"]`
and shared roots `components/ui` and `lib/shared`. Nothing here is fetched at test time.

Pinned edges for later slices work:

- Five cross-universe imports, one per directed pair: projects to management, management to external, external to operations, operations to projects, management to projects.
- Three sibling imports, one per tree (rfi to scm, dispatch screen to fleet screen, eos repository to people repository).
- `load-rfi.ts` imports `rfi-repository.ts` (one importer) and `projects/domain`. `project-codes.ts` imports `rfi-intake.ts`.
- `catalog-repository.ts` is imported by rfi and scm.
- Shared roots reach into slices six times. Two of those continue a cross-universe path (management to operations through `format.ts`, projects to management through `dialog.tsx`). One stays inside projects (`labels.ts` to scm). `lib/compliance` sits outside features and imports nothing.
- `ark.config.deny-cross-parent.json` is the universe wall plus `sharedImportsSlice: "deny-cross-parent"`.
- `ark.config.subtree.json` is the child wall with `siblings.default` advisory and `features/projects/rfi` on `enforce`.
- `scm-uses-d2d.ts` and `rfi-uses-d2d.tsx` import `d2d-item`. The other configs exclude those two files so their goldens stay the walls they already record. `ark.config.wildcards.json` is the child wall that sees them: `features/projects/*` → `features/projects/d2d-item`, plus `features/*/*` → `features/management/eos`, plus a universe `allowedCrossSlice` of `features/*` → `features/*`. `ark.config.wildcards-bare.json` is that file with a bare `d2d-item` entry, which config load rejects.
- `uses-management.ts` lives under `lib/compliance` and imports management, projects common, and `retention.ts`. The other configs exclude it. `ark.config.aliases.json` aliases `lib/compliance/**` to `features/projects/compliance`. `ark.config.aliases-target.json` points that glob at the universe id alone. `ark.config.aliases-overlap.json` points `lib/features/**` at the same child.
- `ark.config.doctor-pilot.json` is the child wall again, under its own name, so doctor can show a flat-parent move card without rewriting the child-slices step.
