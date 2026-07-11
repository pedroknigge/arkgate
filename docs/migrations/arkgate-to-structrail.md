# ArkGate to Structrail migration plan

- **Status:** Required before `C01`
- **Owner:** Pedro Knigge (`pedroknigge`), repository maintainer
- **Decision:** [ADR 0001](../adr/0001-product-identity-structrail.md)
- **Compatibility window:** all of Structrail major v3; removal no earlier than v4

## Goal

Move the canonical product to **Structrail** without breaking an existing ArkGate v2 consumer that
upgrades through the compatibility package. At the end of the migration, new users see only the
Structrail path, while every shipped ArkGate public surface has a tested deprecated route for at
least one major version.

This plan changes identity only. It must not redesign the analysis engine, onboarding flow, runtime,
or package split owned by later roadmap items.

## Migration inventory

The 2026-07-11 inventory found the case-insensitive `arkgate` identity in 96 tracked source/doc files,
`ark.config.json` in 115, `ark://` in 18, `ARK_*` environment names in 44, and `ark-` command/skill
names in 173. Generated `dist/` output and dependencies were excluded. Every category below must
have a migration assertion; a global text replacement is not an acceptable implementation strategy.

| Surface | Current | Structrail primary | v3 compatibility |
|---|---|---|---|
| npm package | `arkgate` | `structrail` | publish `arkgate@3` compatibility package |
| imports | `arkgate`, `/runtime`, `/eslint`, `/nestjs` | equivalent `structrail` subpaths | typed re-exports from the compatibility package |
| bins | `arkgate*` plus `ark*` | `structrail`, `structrail-check`, `structrail-mcp` | old package retains all six old bins |
| config | `ark.config.json` | `structrail.config.json` | loader accepts legacy filename with deprecation evidence |
| environment | `ARK_*` | `STRUCTRAIL_*` | legacy variables accepted; canonical value wins on conflict |
| MCP | `io.github.pedroknigge/arkgate`, `ark://...`, `ark_*` | Structrail registry, resources, and tools | old names remain aliases with deprecation metadata where supported |
| skills | `/ark-*` and `ark-*` files | `/structrail-*` | compatibility installer keeps old skill names working |
| website | `arkgate.online` | reserved Structrail domain | old domain redirects for the compatibility window |
| GitHub / Action | `pedroknigge/arkgate` | `pedroknigge/structrail` | GitHub redirect plus pinned transitional release |
| source types | exported `Ark*` names | new public `Structrail*` names | deprecated type/value aliases where public |

## Ordered implementation

### M0 — Recheck, reserve, and record external identity

This is a human-authorized external-state gate. Run the read-only availability recheck before local
implementation. M1–M5 may then proceed as reversible local commits, but do not change external
systems, publish packages, advertise the new domains, or mark `S07-M1` done until all M0 evidence is
complete:

1. Recheck and reserve the chosen `.com` and `.dev` domains.
2. Recheck npm and GitHub availability and reserve the needed identities without publishing a
   stable release.
3. Commission the appropriate trademark clearance for target jurisdictions/classes.
4. Store ownership and renewal responsibility outside the repository; record only non-secret proof
   links or issue references here.

If any prerequisite fails before public cutover, stop and supersede ADR 0001. Do not publish or
complete the migration with a partially available identity. Local work may be reverted or adapted
through a normal follow-up commit.

### M1 — Add failing compatibility fixtures

Before production changes, add installed-tarball fixtures that express both paths:

- ArkGate v2-style package imports and every public subpath.
- All six legacy bins and their `--version` / help paths.
- Legacy config auto-discovery, explicit `--config`, `ARK_*`, `ark://` resources, and `ark_*` tools.
- Current skill and host-template installation/update behavior.
- A new Structrail fixture covering the target package, three bins, config, environment, MCP, and
  skills.
- A conflict fixture for both config filenames and both environment-name generations.

Commit the red fixtures before making them pass.

### M2 — Establish target names internally

1. Introduce target constants and one compatibility-name table in the pure/shared layer already
   responsible for each surface; do not create a general branding framework.
2. Rename source-owned files only when their filename is public or identity-bearing. Preserve
   unrelated internal identifiers until their owning task needs them.
3. Generate CLI pure artifacts through the existing generators rather than editing generated files.
4. Make new public types and diagnostics say Structrail; retain deprecated aliases only where v2
   exposed a symbol.

### M3 — Migrate package and bins

1. Make this repository build and pack `structrail@3` with the existing root, runtime, ESLint, and
   NestJS subpaths.
2. Expose only `structrail`, `structrail-check`, and `structrail-mcp` as primary bins in the new
   package.
3. Add a small `arkgate@3` compatibility package in this repository. It depends on the exact matching
   `structrail` major/minor, re-exports all four package entry points, and owns the six legacy bins.
4. Keep library imports side-effect free. Surface deprecation through npm metadata, docs, CLI help,
   and type annotations—not an import-time warning.
5. Test both packed tarballs together and separately. Verify that bin resolution is deterministic
   and that a consumer never needs both packages declared directly.

### M4 — Migrate config and environment contracts

1. Use `structrail.config.json` for new init/preset/setup output.
2. Loader precedence is: explicit `--config`; canonical filename; legacy filename. If both implicit
   files exist, fail with a diagnostic requiring an explicit choice—never guess.
3. Accept `ark.config.json` throughout v3 and emit a machine-readable deprecation notice without
   changing the enforcement verdict.
4. Add `STRUCTRAIL_*` canonical environment variables. Continue accepting their `ARK_*` equivalents
   through v3; when both are present, the canonical variable wins and the conflict is reported.
5. Provide an idempotent, preview-first config rename command. It may rename the file and known
   references only after explicit apply; it must not rewrite product source or unrelated scripts.

### M5 — Migrate MCP, hosts, and skills

1. Register `io.github.pedroknigge/structrail` and expose `structrail://manifest` plus
   `structrail_*` tools as the canonical MCP contract.
2. Keep legacy resource/tool aliases for v3 and test verdict parity between each alias pair.
3. Generate new host configurations with Structrail commands and names. Upgrade existing ArkGate
   blocks in place without duplicating MCP servers, hooks, CI workflows, or home-directory skills.
4. Rename published skills to `/structrail-*`. Compatibility installs keep `/ark-*` entry points as
   forwarding instructions, with one deprecation source and no behavioral fork.
5. Update docs snapshots and the truthful host-support matrix only after generated output is stable.

### M6 — Repository and public cutover

This step requires completed M0 evidence and explicit authorization because it changes external
systems.

1. Rename the GitHub repository and update Action examples, badges, issue links, security policy,
   release automation, MCP registry metadata, and provenance subjects.
2. Publish a final ArkGate v2 notice, `structrail@3`, and the matching deprecated `arkgate@3`
   compatibility package. Do not use the `latest` tag until installed-tarball smoke tests pass.
3. Move the public site to the reserved Structrail domain and redirect every known ArkGate URL.
4. Publish one migration page with exact package, command, config, MCP, and skill replacements.
5. Verify npm provenance, checksums, signed tags, GitHub redirects, Action checkout behavior, MCP
   discovery, and both package install paths from clean repositories.

### M7 — Ratchet and removal boundary

1. Add CI searches that reject new non-compatibility `Ark*` public names.
2. Mark every compatibility assertion with a single removal target: v4, never an earlier v3 minor.
3. Track compatibility-path usage only through existing opt-in/non-secret telemetry policy; do not
   add telemetry for the rename.
4. Before v4, publish a separate removal ADR based on field evidence. Until then, old paths are
   supported behavior, not best-effort aliases.

**Local implementation (2026-07-11):** `npm run check:identity` scans tracked and non-ignored
public surfaces, rejects unmarked legacy names, validates balanced approval blocks, and requires
`removal=v4` (or `Removal target: v4` on deprecated TypeScript declarations). The reviewed
allowlist separates v3 compatibility/assertions/internal artifacts from immutable history,
migration material, and M6-gated external metadata. CI, the release script, and the token-backed
publish branch run the same ratchet. No rename telemetry was added; a removal ADR remains forbidden
until field evidence exists before v4.

## Acceptance gate for `S07-M1`

- Both tarballs pass clean npm, pnpm, and yarn install/import/bin smoke tests.
- Structrail is the only primary name in new generated output, docs, package metadata, and Phase C
  plans.
- Every v2 public identity category has a passing v3 compatibility test.
- Canonical and legacy paths produce identical enforcement verdicts.
- No implicit config or environment conflict is resolved silently.
- `rg` finds old names only in compatibility code, migration/history docs, fixtures, and explicit
  negative assertions approved by an allowlist.
- Common merge gate, TypeScript compatibility matrix, package dry-runs, security audit, and
  architecture gate pass from a clean checkout.
- External cutover evidence is attached to the implementation record; no release is required merely
  to start the code migration, but `S07-M1` cannot be marked done while the public identity is split.

## Local acceptance audit — 2026-07-11

The reversible/local portion of this gate was audited at commit `6df6716`. The audit used
`git archive HEAD` to create the ignored, non-ephemeral checkout `.tmp-s07-audit-clean`, followed by
a fresh `npm ci`. The checkout had no `.git`, prebuilt `dist`, or reused `node_modules`, so it also
exercised packaged-tree fallbacks instead of relying on working-tree metadata.

| Acceptance criterion | Reproducible evidence at `6df6716` | Result |
|---|---|---|
| Both package generations install cleanly | `tests/publish/structrail-package-managers.test.ts` plus `tests/publish/structrail-identity.test.ts` inside `npm run test:confidence` | 9/9 npm, pnpm, and Yarn primary/legacy/combined cases; 3/3 package identity/config/import/bin cases |
| New surfaces use the canonical identity | `structrailCliIdentity` 5/5, `structrailGeneration` 1/1, `structrailPublicAliases` 2/2, and `npm run check:identity` after mutation output existed | Green; ratchet scanned 289 text files with removal target v4 |
| Every v2 identity category retains a tested v3 path | Full 104-file Vitest run, including package subpaths/bins, config, environment, MCP, skills/hosts, and public type/value aliases | 782/782 tests passed |
| Canonical and legacy verdicts agree | `tests/unit/mcp/arkMcp.test.ts` resource/tool parity and the installed-package alias assertions | Green; canonical and compatibility values/resources produced equal results |
| Config/environment ambiguity is explicit | `structrail-identity` config cases plus `productIdentityEnvironment` 3/3 | Dual implicit configs reject; canonical environment values win and report conflicts |
| Common and confidence gates pass cleanly | typecheck; JS syntax; identity; layer/CLI generated parity; module budgets; package allowlist; architecture; build; `npm run test:confidence` | Green; coverage 91.79% statements, 85.23% branches, 94.98% functions, 91.79% lines; mutation 97.20% (415 killed, 1 timeout, 12 survived, 0 uncovered/errors) |
| Distribution checks pass | `npm pack --dry-run`, `npm run test:ts-compat`, `npm run security:audit` | 132-file tarball, 809.8 kB packed / 3.3 MB unpacked; TypeScript 5.9.3, 6.0.3, and 7.0.2 green; 0 production vulnerabilities |

This is not the final `S07-M1` completion record. M0 still needs reservation/ownership and legal
evidence, and M6 still needs explicit authorization for the GitHub, npm, website/domain, registry,
redirect, provenance, and signed-release cutover. After those external changes, repeat this clean
audit on the cutover commit and attach the external evidence before changing the item to `done`.

## Rollback

Before publication, revert the migration commit series normally. After publication, do not unpublish
packages or delete redirects. Restore the last green Structrail release, keep the ArkGate
compatibility package pinned to it, explain the incident, and ship a forward fix.
