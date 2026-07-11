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

Rule fields:

- `from`, `to`, `allowed`, `message`, `peerIsolation`, `sliceFolders`

Safety fields:

- `maxTsSuppressions`, `maxAnyCasts`
- `allowInMemory`, `allowDisabledPeerIsolation`

The packaged JSON Schema is authoritative for types, constraints, defaults, and the unknown-key
policy.
