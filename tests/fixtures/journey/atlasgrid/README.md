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
