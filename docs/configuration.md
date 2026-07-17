# Versioned `ark.config.json`

ArkGate treats `ark.config.json` as a versioned product contract, not an untyped settings bag.
The CLI, MCP server, and ESLint plugin all use the same parser, migration, defaults, and validator.

## Start a config

`arkgate start`, `arkgate init`, and every preset emit the current metadata:

```json
{
  "$schema": "https://unpkg.com/arkgate@2/schemas/ark.config.schema.json",
  "schemaVersion": "1.0",
  "include": ["src"],
  "layers": [],
  "rules": []
}
```

`$schema` is for editor completion. `schemaVersion` controls ArkGate's runtime contract and is
independent from the npm package version.

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
The loader deterministically projects them to schema `1.0` in memory by adding contract metadata
and the established defaults. It never rewrites the user's file during a check. Newly generated
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

Layer fields:

- `name`, `patterns`, `exclude`, `description`
- `intentPrefixes`, `forbiddenGlobals`, `mayImportInfrastructure`, `optional`
- `capabilities: { deny: [...] }` — opt-in effect walls over the seven capability ids
  (`network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence`);
  `pure: true` is the shorthand that denies all seven. Absence changes no verdict.

`forbiddenGlobals: ["process"]` covers the ambient binding plus exact runtime imports from
`process` and `node:process`. It does not imply the broader `process` capability wall: subpaths
and `child_process` remain outside this narrow dual, and statement-level `import type` /
`export type` declarations are excluded. Declare `capabilities.deny: ["process"]` when the whole
process module-capability family must be denied.

Rule fields:

- `from`, `to`, `allowed`, `message`, `peerIsolation`, `sliceFolders`

Safety fields:

- `maxTsSuppressions`, `maxAnyCasts`
- `allowInMemory`, `allowDisabledPeerIsolation`

The packaged JSON Schema is authoritative for types, constraints, defaults, and the unknown-key
policy.

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

MCP clients can call `ark_policy_delta` with the previous `baseConfig`, an optional candidate
contract (the current project contract is the default), and the same optional acknowledgement.
It invokes the public classifier directly, is read-only, and marks a blocking result as an MCP
error without maintaining separate adapter policy.
