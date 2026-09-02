# Versioned `ark.config.json`

ArkGate treats `ark.config.json` as a versioned product contract, not an untyped settings bag.
The CLI, MCP server, and ESLint plugin all use the same parser, migration, defaults, and validator.

## Start a config

`arkgate start`, `arkgate init`, and every preset emit the current metadata:

```json
{
  "$schema": "https://unpkg.com/arkgate@2/schemas/ark.config.schema.json",
  "schemaVersion": "1.3",
  "include": ["src"],
  "layers": [],
  "rules": []
}
```

`$schema` is for editor completion. `schemaVersion` controls ArkGate's runtime contract and is
independent from the npm package version. Schema **`1.1`** is additive over `1.0` and adds the
optional top-level **`arkRules`** map (ADR 0012). Schema **`1.2`** is additive over `1.1` and
adds the optional top-level **`arkRun`** extra (ADR 0020). Schema **`1.3`** is additive over
`1.2` and adds the optional top-level **`arkOrder`** extra (ADR 0027). Absence of `arkRules`,
`arkRun`, or `arkOrder` changes no Layers / ArkRules verdict. Per-layer structure/invariant
files use sibling schema `arkgate/schema/arkrules` (`schemas/ark.arkrules.schema.json`).
ArkRun and ArkOrder v1 stay **inline** (no sibling file). The plane factory is
`arkgate/order` in the same npm package — not a second install.

For offline editor completion, point `$schema` at the installed file instead:

```json
{
  "$schema": "./node_modules/arkgate/schemas/ark.config.schema.json",
  "schemaVersion": "1.0"
}
```

The same schema is exported through the stable package subpaths `arkgate/schema` and
`arkgate/schema/ark.config.schema.json`. Node tooling can locate it with
`require.resolve('arkgate/schema')`.

## Compatibility and migration

Configs without `schemaVersion` are the legacy shape shipped through ArkGate 1.x and early 2.x.
The loader deterministically projects them through `unversioned → 1.0 → 1.1 → 1.2 → 1.3` in memory by adding
contract metadata and the established defaults. It never rewrites the user's file during a check.
Newly generated
configs always contain the metadata, and unsupported future versions fail at
`$.schemaVersion` instead of being guessed.

Current defaults are:

| Field | Default |
|---|---|
| `include` | `["src"]` |
| `layers` | `[]` |
| `rules` | ArkGate's strict 11-layer deny matrix |
| `exclude` | `[]` |
| `excludeGenerated` | `true` |
| `cyclePolicy` | `"strict"` |
| `dynamicImportAllowlist` | `[]` |
| safety thresholds | zero; opt-ins disabled |

JSON Schema `default` values document the effective behavior. Optional defaults are not written
back to disk.

## Unknown and invalid fields

Unknown fields fail closed at every object level. Diagnostics name the exact JSON path:

```text
Invalid ArkGate config (/repo/ark.config.json):
- $.layers[0].forbiddenGlobal: unknown field
```

The same input cannot pass CI while being silently ignored by MCP or ESLint. Invalid JSON, wrong
types, empty required strings, duplicate string-array entries, negative safety thresholds, and
unsupported schema versions also fail before scanning begins.

## Supported fields

Top-level fields:

- `$schema`, `schemaVersion`, `name`
- `include`, `exclude`, `excludeGenerated`, `frameworkOverlay`
- `layers`, `rules`, `cyclePolicy`
- `dynamicImportAllowlist`, `safety`
- **`coverage`** (optional) — invariant-coverage scan controls: `testGlobs` (globs that decide
  which files count as tests, replacing the built-in `*.test.*` / `tests/` name heuristic),
  `maxFiles` (evidence file budget, default `400`) and `coverageRoots` (path prefixes where the
  project declares its runner actually executes tests). Absence is silent and changes no verdict.
  Unknown keys fail closed. **`maxFiles` also bounds structural-hint preload** for
  `orchestration-only`, `thin-adapter`, and `writes-via-aggregate` (the hint loader reuses
  coverage contents when present). There is no separate `arkrules.hintBudget`. When eligible
  governed files exceed that budget, the loader emits `ARKRULE_HINT_BUDGET_EXHAUSTED` with
  exact hinted/governed counts and per-sensor reviewed N/M of scope; `--strict-config` fails
  if an enforced hint sensor cannot see its scope. `--doctor` names this coupling.
  When the coverage budget is hit, `INVARIANT_UNCOVERED` reports the numbers
  (files loaded, tests retained, files discarded at the cap) and names `coverage.maxFiles` as
  the knob that raises it — coverage never claims "never had tests" because of our own cap.
  `maxFiles` is clamped to a hard ceiling of 20000 (the config validator has no
  `maximum` keyword, so a schema bound would be accepted and then ignored). The cap
  bounds files **retained as evidence**, not files opened: a test is read before it can
  be judged for naming an invariant, so the diagnostic reports files read alongside
  files retained.
  Nothing is dropped in silence: files past the budget, files over the 256KB per-file cap,
  unreadable files or directories (permissions, broken symlinks), directories past the walk depth
  limit (8), symlinks whose target resolves outside the project root, and tests naming no
  catalogued invariant are each counted and named in the diagnostic. A symlinked test is read only
  when its target is inside the root: a file that is not in this repo never proves an invariant
  covered.

  `coverageRoots` closes a false green ArkGate could otherwise produce. Coverage is proven by
  matching an invariant id in a test title — a filesystem walk plus a text match. **ArkGate never
  executes tests and never reads a runner config**, so a test in a folder no runner runs certifies
  the invariant just as well as one that runs. Declaring `coverageRoots` gives ArkGate a second
  declaration to compare the first against: when the only covering test falls outside them, it
  reports `INVARIANT_COVERAGE_OUTSIDE_ROOTS` (advisory) and refuses to promote that invariant to
  `enforced`. Declaring nothing keeps the old silence — without a declaration there is nothing to
  compare, and ArkGate makes no claim about where tests run.
- **`arkRules`** (optional, schema `1.1+`) — map of layer name → project-relative path to an
  ArkRules file (e.g. `"DomainModel": "arkrules/DomainModel.json"`). Keys must match a declared
  layer. Missing/invalid referenced files **fail closed**.
- **`arkRun`** (optional, schema `1.2+`) — inline ArkRun extra (`mode`, `kernelRoots`
  (`compositionRoots` alias), `managedLayers`, `requireDeclarations`). Absence is silent. Unknown keys fail closed.
  `managedLayers` must name existing `layers[].name` values. Empty `compositionRoots` in
  `enforced` mode fails closed (`ARKRUN_MISSING_ROOT`); empty `managedLayers` in `enforced`
  mode also fails closed (direct-new / undeclared / transport-bypass would otherwise no-op).
  Compact starters do not enable this extra. Demotion (`enforced` → `advisory`) or deletion
  is a policy-delta **weakening**. Enforced extra teeth share the CLI / MCP / hook /
  preflight / CI verdict and arm only when the layer plane is classified (same ≥50%
  governed and ≥1 populated-layer floor as ArkRules).
- **`arkOrder`** (optional, schema `1.3+`) — inline ArkOrder extra (`mode`, `planeRoots`,
  `managedLayers`, `maxXiKeys`, **`xiKeys`**, optional **`appliesTo`**). Absence is silent.
  Unknown keys fail closed. Import `createOrderPlane` from `arkgate/order` (same package).
  Empty `planeRoots` in `enforced` mode fails closed (`ARKORDER_MISSING_PLANE`).
  `xiKeys` is a repo-wide watchlist of slow names the product already knows (plan,
  protocol, cost-code bound). Empty `xiKeys` leaves `ARKORDER_XI_FIELD_WRITE` silent.
  `maxXiKeys` (default 7) is the Haken cap on one `release()` / `assertXiKeyCap`, not
  a cap on watchlist length: eight named `xiKeys` with `maxXiKeys` 7 is valid.
  `ARKORDER_TOO_MANY_PARAMS` fires when `release()` `keyCount` exceeds `maxXiKeys`.
  Optional `appliesTo` uses the same glob engine as `layers[].patterns`. Absence or
  empty keeps current behavior (every file in `managedLayers`). Non-empty emits
  `ARKORDER_XI_FIELD_WRITE` only when the layer is managed **and** the file matches
  at least one glob. Membership ids and recomputable statuses such as `paid` /
  `overdue` are not keys. Factory options `informationBudget`, `sigmaMaxAgeMs`,
  `store` (`ReleaseStore`), and capacity packs belong on `createOrderPlane`, not this
  extra object. Later ξ is `proposeRelease` then `apply`; `refreshSigma`; ingest
  residual `absorb | escalate_up | hold`. Demotion or deletion is a policy-delta
  **weakening**. Field ingest never mints a pattern.

**Activation is one shape.** ArkRun and ArkOrder both use `mode` + `managedLayers`.
Absence of either extra is silent. They keep different *root* names because they
name different factories: `arkRun.kernelRoots` (`compositionRoots` alias) vs
`arkOrder.planeRoots`. Do not fold them. Canonical: [arkorder.md](arkorder.md#activation-same-shape-as-arkrun).

Layer fields:

- `name`, `patterns`, `exclude`
- **`layers[].description`** (optional) — **app-context caption**: one product sentence for what
  this folder is *in the app*, not architecture jargon. `/ark-place` prints it next to
  the layer name and globs; doctor, coverage, and the HTML report show the same text.
  Changing the sentence does **not** change `policyHash` (same strip as `stewards`) and
  does **not** need a weakening ack. Absence is silent: never fails `--strict-config`,
  never invents a doctor residual, never flips `valid`. Empty string is invalid JSON for
  the field (`minLength: 1`). Compact starters may omit it. `/ark-adopt` writes it when
  the product map or glossary names the house; it does not invent captions. No
  `/ark-describe`.

```json
"layers": [
  {
    "name": "Application",
    "patterns": ["src/application/**"],
    "description": "Purchase requests — from asked to received."
  }
]
```

That sentence is product copy. Not “Rich domain model, business rules, and domain events.”
- `intentPrefixes`, `forbiddenGlobals`, `mayImportInfrastructure`, `optional`
- `reserved` / `allowEmpty` — future houses whose globs match nothing yet. `--strict-config` does not fail; `CONFIG_LAYER_PATTERN_NO_MATCHES` (typo warning) is skipped. A typo warning fires only when the glob is not reserved.
- `capabilities: { deny: [...] }` — opt-in effect walls over the seven capability ids
  (`network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence`);
  `pure: true` is the shorthand that denies all seven. Absence changes no verdict.

**Day-to-day maintenance:** new modules that land under an existing layer `patterns` glob need **no**
config edit. Edit `ark.config.json` when you add a layer, change who may import whom, cover an
ungoverned path under `include`, or adjust capabilities / forbidden globals. Optional ArkRules
`invariants[].appliesTo` globs only narrow *which files* a named invariant considers inside that
layer — they do not replace Layers placement. Empty `appliesTo: []` fails closed; zero-match globs
warn or fail by mode (`ARKRULE_SCOPE_EMPTY`). Product path: [use.md — New modules vs config edits](use.md#new-modules-vs-config-edits).

`forbiddenGlobals: ["process"]` covers the ambient binding plus exact runtime imports from
`process` and `node:process`. It does not imply the broader `process` capability wall: subpaths
and `child_process` remain outside this narrow dual, and statement-level `import type` /
`export type` declarations are excluded. Declare `capabilities.deny: ["process"]` when the whole
process module-capability family must be denied.

Rule fields:

- `from`, `to`, `allowed`, `message`, `peerIsolation`, `sliceFolders`, `sharedRoots`,
  `allowedCrossSlice`
- `peerIsolation: true` + `allowed: false`: deny only when slice ids differ; same-slice allows
  when both paths classify. Applies to **any** declared `from`→`to` pair, not only self-edges.
  Missing paths, empty slice folders, or unclassifiable slices **fail closed** (deny — cannot
  prove same-slice).

#### Cross-layer slice walls (already in the engine)

A slice wall on a cross-layer edge is a `peerIsolation` rule on that `from`/`to` pair
(`allowed: false`). There is no slice-wide engine mode, no new config key, and no new skill
name. `findDeniedEdgeDecision` already applies `peerIsolation` to any declared pair
(same-layer or cross-layer) — locked on `EdgeRule` and `findDeniedEdgeDecision` in
[`src/domain/layerMatch.ts`](../src/domain/layerMatch.ts). There is no dedicated ADR to add.

A feature slice is often cross-layer. Classic Application→Domain is allowed by omission, so
`ApplicationOrchestration/management` importing `DomainModel/projects` is invisible to an
Application→Application wall. Declare the cross-layer pair with the same `sliceFolders` /
`sharedRoots` as the same-layer wall:

```jsonc
{
  "from": "ApplicationOrchestration",
  "to": "DomainModel",
  "allowed": false,
  "peerIsolation": true,
  "sliceFolders": ["features"],
  "sharedRoots": ["ui", "hooks"]
}
```

Domain files that do not resolve to a slice **fail closed** unless they sit under a declared
`sharedRoots` entry. Do not invent a sixth rule shape for this.

#### Declared peerIsolation exceptions (4.8.4)

Fail-closed denies on **absence of evidence**, so in a repo that legitimately keeps shared code
outside `features/<slice>/` (a `ui/`, `hooks/`, `lib/permissions/` tree) every shared file reads as
a violation — thousands of them, none a real cross-slice import. That is ArkGate reporting *our*
inability to place a file as a fact about *your* code. Two declarations fix it, and a declaration
is evidence:

```jsonc
{
  "from": "Features", "to": "Features", "allowed": false, "peerIsolation": true,
  "sliceFolders": ["features"],
  // Roots this repo keeps shared on purpose — no longer "unclassifiable".
  "sharedRoots": ["ui", "layout", "providers", "hooks", "lib/permissions"],
  // Directed slice→slice edges this repo wants. One entry = one direction.
  "allowedCrossSlice": [{ "from": "features/checkout", "to": "features/catalog" }]
}
```

- `sharedRoots` is **anchored**: the root must start the repo-relative path, optionally after a
  single conventional source folder (`src/`, `app/`). So `ui` covers `ui/button.tsx` and
  `src/ui/button.tsx` but **not** `modules/a/ui/x.tsx` — an unanchored root would exempt a whole
  tree you never declared. Write a deeper or monorepo root out (`packages/web/src/ui`) or glob it
  (`packages/*/src/ui`). Matching is case-insensitive; a bare `*` or `**` is refused, because one
  character must not disable fail-closed. A path that still resolves to a slice keeps its slice —
  `features/auth/ui/form.tsx` stays `features/auth` — so a shared root can never launder a real
  cross-slice edge.
- `allowedCrossSlice` entries match a full slice id (`features/catalog`) or a bare slice name
  (`catalog`), and only in the direction written. The reverse edge still denies. A bare name
  matches that name under **any** slice folder, so in a repo with several slice parents
  (`features/auth` and `modules/auth`) write the full id — `features/auth` — or the
  declaration allows more edges than you meant.
- Everything else is unchanged: two different slices with nothing declared still deny, and a file
  that is neither in a slice nor under a declared shared root still **fails closed**.
- The denial now names which reason fired — `cross-slice edge features/a → features/b` (a fact
  about your code) versus `unclassifiable path (src/widgets/x.tsx)` (a fact about our evidence).
  `no slice folders` and `no path evidence` are the two remaining evidence reasons. A rule-level
  `message` override no longer hides it: the reason is appended to your text, not replaced by it.
- Both declarations are **weakening** changes in `ark policy-delta`
  (`shared-roots-added`, `cross-slice-allowance-added`), so a policy review sees them. Both are
  inert on a rule without `peerIsolation: true`, and policy-delta stays silent about them until
  the wall exists.

**The recommended model is still to promote a genuinely shared slice to its own layer** and let
the layer edges carry it: a one-way peer import between slices is a DAG the layer graph cannot
see. `sharedRoots` and `allowedCrossSlice` exist so ArkGate can enforce a design that made the
other choice deliberately, not so slices can drift into a mesh.

### Type-only edges (placement debt)

`import type` / `export type` and pure type-only named bindings are **type placement debt**, not
runtime coupling. They still appear on the **violations** list with `typeOnly: true`,
`failsStrict: false`, and adapter diagnostic **severity: warning** so doctor/HTML keep
`violations.typeOnly` / `typeEdgePolicy` honest — but they **do not** fail merge/exit, library
`valid`, or preflight the way **value** edges do. **Exception:** `peerIsolation` slice
boundaries stay hard even for type-only. A value import of a pure-type barrel is still a value
edge (not soft-skipped). Prefer placing shared types in a **SharedTypes** (or owning) layer
both sides may import. Optional starter: [`templates/layers/shared-types.starter.json`](../templates/layers/shared-types.starter.json)
(layer globs + allow rules). Doctor always emits `violations.typeEdgePolicy`; plan groups type-only
steps under `plan.typeOnlyGroup` when volume is high.

### Next.js API shell (framework overlay / presets)

When Next is detected (or `ui-surface` / monorepo patterns apply), **`app/api/**` and
`pages/api/**` classify as Application orchestration**, not Presentation. UI routes stay
Presentation. More-specific Application globs win over broad `**/app/**` Presentation patterns.
See [brownfield adoption](brownfield-adoption.md#nextjs-honesty-default-overlays--ui-surface--monorepo).

### ArkRules dual plane (when `arkRules` is present)

| Plane | What it is | Merge teeth |
|-------|------------|-------------|
| **Layers** | Inter-layer import graph | Always on |
| **Structure sensors** | Intra-layer heuristics | Only `mode: "enforced"` |
| **Invariants** | Catalog + coverage evidence (not a business runtime) | Only enforced + proven-uncovered |
| **ArkRun** (opt-in extra) | Kernel usage + complete declarations | Only `arkRun.mode: "enforced"` when classified |
| **ArkOrder** (opt-in extra) | Frozen pattern; first freeze `release()`, later ξ is `proposeRelease` then `apply` (no `update`) | Only `arkOrder.mode: "enforced"` when classified |

Absence of `arkRules`, `arkRun`, or `arkOrder` adds **no** extra merge teeth. **Advisory** structure sensors, advisory
invariants, advisory ArkRun, and advisory ArkOrder also add **no** merge teeth (FG-ARKRULES-ADVISORY-ONLY / ADR 0020 / ADR 0027) — packing every starter
`arkrules/*` file does not make merge fail structure alone. Enforced structure/invariants/ArkRun/ArkOrder arm
`mergePlanes.extraMergeTeeth` only when the layer plane is honestly classified
(governed ≥ 50% and ≥ 1 populated layer); empty classification never gets extra-plane teeth
(P1M-EXTRATEETH-EMPTY-GRAPH). Extra planes **never** merge into one architecture
score. Doctor exposes `rulesUnderContract.mergePlanes` (including `mergePlanes.arkRun`) for which plane can fail,
and a dedicated `doctor.arkRun` section that is always `notAScore`. ArkOrder skip findings are
`ARKORDER_*` diagnostics on that same extra-teeth floor.

Safety fields:

- `maxTsSuppressions`, `maxAnyCasts`
- `allowInMemory`, `allowDisabledPeerIsolation`

The packaged JSON Schema is authoritative for types, constraints, defaults, and the unknown-key
policy.

## ArkRules (intra-layer, opt-in)

Sibling schema export: `arkgate/schema/arkrules` (`schemas/ark.arkrules.schema.json`).

**Two planes (never one score):**

| Plane | Question | Where |
|-------|----------|--------|
| **[Layer]** (inter-layer) | Who may import whom? Pure / forbidden globals / capabilities? | `layers[]` + `rules[]` |
| **[ArkRules]** (intra-layer, opt-in) | How is code shaped *inside* a layer, and which named business policies are catalogued with coverage evidence? | `arkRules` map + `arkrules/<ExactLayerName>.json` |

Absence of `arkRules` is valid: only the Layers plane runs; inter-layer verdict is unchanged.

Each `arkrules/<Layer>.json` may declare:

| Section | Purpose | Modes | What it really enforces |
|---------|---------|--------|-------------------------|
| `structure[]` | Closed sensor ids (e.g. `orchestration-only`, `thin-adapter`, `writes-via-aggregate`, `aggregate-private-state`, `always-valid-factory`, `domain-event-on-mutation`, `no-anemic-model`) | `advisory` (default) or `enforced` | **Heuristics of module shape** — not proof that logic was extracted to Domain. `writes-via-aggregate` is driver-import + write-token in the declaring layer (ADR 0032). Tier-2 sensors (`no-anemic-model`) stay advisory-only (cannot promote to enforced). |
| `invariants[]` | Stable ids + description + `coverage` (`test` / `symbol`) + optional `appliesTo` globs | `advisory` or `enforced` | **Named policy + evidence** (symbol in source and/or test title/content). Does **not** execute business logic at check time and does **not** replace behavior/property tests. |

**Reporting:** diagnostics carry `evidence.arkruleId` + `evidence.arkruleSource`. Label residual
**`[Layer]`** vs **`[ArkRules]`** in agent output. Doctor / HTML: `rulesUnderContract` (catalog +
counts, **never a score**). Showcase HTML lists per-layer totals, structure sensors, uncovered
invariants, and a covered sample when the map is active.

**Promotion:** advisory→enforced is strengthening when coverage evidence exists; demote/delete is
a hash-bound policy weakening. Empty `appliesTo: []` fails closed; zero-match globs emit
`ARKRULE_SCOPE_EMPTY` (advisory warn / enforced fail). Enforced + proven uncovered →
`INVARIANT_UNCOVERED` with `failsStrict` (partial evidence stays honest, never fake-green).

**What they do not do:** prove business semantics end-to-end; replace Layers import edges;
make “green” mean elegant Shape. Promoting structure to enforced can force rename-to-pass
heuristics — prefer judgment extraction via `/ark-autopilot` when the real goal is
Domain ownership.

```bash
# Brownfield candidates (not a score)
npx arkgate-check --rules-inventory --json
```

Edit ArkRules through `/ark-adopt` (session 0) or `/ark-autopilot`; extract/implement via `/ark-autopilot`.

## Contract transitions

`ark-check --strict-merge` protects the transition into a new contract, not only the resulting
file. In a Git checkout it compares the candidate `ark.config.json` with the merge base when that
base is available. CI can bind the comparison explicitly:

```bash
ARK_POLICY_BASE_REF="$BASE_SHA" npx ark-check --strict-merge
```

For local or non-Git automation, supply a committed config file or Git ref:

```bash
npx ark-check --strict-config --policy-base ./before.ark.config.json --json
npx ark-check --strict-merge --policy-base-ref origin/main
```

The additive JSON result includes `policyDelta`: both policy hashes, the overall classification,
stable findings, and `blockingFindingIds`. Supported comparisons cover governed include/exclude
roots, layer patterns/exclusions/forbidden globals, deny rules, same-layer peer isolation,
cycle policy, dynamic-import allowlists, and safety thresholds. Ambiguous ownership changes are
`judgment-required` rather than guessed.

Weakening and judgment-required transitions fail closed. An intentional exception is an explicit
JSON artifact passed with `--policy-ack`:

```json
{
  "schemaVersion": "1.0",
  "basePolicyHash": "fnv1a-...",
  "candidatePolicyHash": "fnv1a-...",
  "findingIds": ["weakening:$.dynamicImportAllowlist:added"],
  "reason": "Temporary loader while the static registry is migrated."
}
```

The acknowledgement must list every blocking finding exactly. It is not a permanent allowlist:
changing either contract changes its hash and invalidates the acknowledgement.

## Team parliament (law vs feature)

Optional `stewards` lists **GitHub handles or emails** who may **loosen** the contract or
**grow** the baseline (`pedroknigge` or `pedroknigge@users.noreply.github.com` — not
`Pedro Knigge`). The field is metadata — it does not change the policy hash. `layers[].description` is stripped the same way (caption-only edits do not change `policyHash` and do not need a weakening ack; `contractHash` still fingerprints the raw config). The lock
matches `--author`, then `GITHUB_ACTOR` / `ARK_STEWARD`, then `GIT_AUTHOR_EMAIL`. A
noreply GitHub mail and the handle are the same person. Git `user.name` is not identity.

`--contract-session` is required to loosen the contract (T4) or grow the baseline
(`--update-baseline`, T5) **even when `stewards` is empty**. `--policy-ack` remains the
hash tooth on a weakening; session is the change-type tooth. An empty list cannot print
Healthy ENFORCE: doctor treats it as unfinished residual (`empty-stewards`) after a
30-day grace from the git first-add of `ark.config.json`, or immediately when that age
is unknown. `operatingMode` stays `enforce` (contract-fit). `/ark-adopt` asks; it does
not invent names.

Doctor detects several recent authors or a CODEOWNERS file (`doctor.stewardNudge`).
When `stewards` is empty it **asks** who owns the law and proposes handles or emails.
When the list exists but CODEOWNERS is ahead, or you started with one steward and git
now shows more authors, it shows the **gap** and asks whether to update. `/ark-adopt`
writes only after you confirm — it does not invent names or remove entries.

```json
"stewards": ["you", "your-co-steward"]
```

Law files (`ark.config.json`, `arkrules/*`, `.ark-baseline.json`) are a different change
type than product source:

| Check | What it does |
|-------|----------------|
| `ark-check --changed --base origin/dev` | Layer check on touched sources only. A CSS/i18n PR pays almost nothing. |
| `ark-check --against origin/dev` | New violation keys vs **that ref's** baseline (not only HEAD). |
| `ark-check --contract-diff --base origin/dev` | Classifies tighten / loosen / reclassify / baseline-grow. |
| `--contract-session --author <id>` | Law-only PR. Mixed law+product still fails. Loosen/grow need a session even with an empty `stewards[]`; a non-empty list also needs a matching listed author. |
| `--persona touch\|contributor\|agent\|steward` | Budget presets for the same teeth. |
| `ark status --vs origin/dev` | One line: pin / contract / baseline drift vs that ref. |

Write-gate ApplyPatch denies a batch that mixes law files with product source. Humans who
never hit PreToolUse are unchanged. Local `pnpm` gates should call `--changed --base`, not
only full-tree `--strict-merge`.

`--changed` honors the touched-file list for **file-local** ArkRules structure sensors
(class shape, orchestration-only, thin-adapter, writes-via-aggregate) and for
structural-hint preload. Import-edge, layer, and cycle sensors still evaluate the full
governed graph. That is a bound on the existing scan, not a second analysis engine, and
it does not turn a full-tree run into a seconds-long one. A `--changed` pass is not a
full-tree structural verdict.

MCP clients can call `ark_policy_delta` with the previous `baseConfig`, an optional candidate
contract (the current project contract is the default), and the same optional acknowledgement.
It invokes the public classifier directly, is read-only, and marks a blocking result as an MCP
error without maintaining separate adapter policy.
