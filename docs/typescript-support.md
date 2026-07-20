# TypeScript support (5.x / 6.x / 7.x)

ArkGate’s architecture gate (`arkgate-check` / `ark-mcp`) needs a **JavaScript API**
TypeScript package that exposes:

- `ts.sys` (at least `fileExists`)
- `createSourceFile` (AST)
- `resolveModuleName` (module graph)
- `isInTypeQuery` (runtime-reference classification)

It does **not** require the Go-native `tsc` binary for the gate. Type-checking
semantics of your app still come from **your** project `typescript` + `tsconfig`.

## Supported versions

| Range | Status |
|-------|--------|
| **TypeScript 5.x** | Supported; packed compatibility cell uses **5.9.3** |
| **TypeScript 6.x** | Supported; packed compatibility cell uses **6.0.3** |
| **TypeScript 7.x** | Supported through the project's own compiler plus ArkGate's physically distinct TypeScript 6 analysis host; packed compatibility cell uses **7.0.2** |

These current-source claims passed the complete 36-cell packed matrix on source `228dd893` in
[CI run 29655190747](https://github.com/pedroknigge/arkgate/actions/runs/29655190747).
Published 3.7.0 remains outside this corrected support claim.

> **Distribution boundary:** published `arkgate@3.7.0` predates this correction. Its compatible
> analysis dependency can deduplicate to a TS7 version-only export, and its unavailable
> `--plan --json` result can incorrectly report `goal.met: true`. The current source candidate for
> the next corrective release fixes both defects with a non-deduplicable host and explicit analysis
> completeness. Do not attribute that fix to 3.7.0; upgrade once the corrective version is
> published.

Supported consumer range (also declared as an optional peer for compatibility):

```json
"peerDependencies": {
  "typescript": ">=5.0.0 <8"
}
```

The current source line installs one exact production fallback under a different package identity:

```json
"dependencies": {
  "typescript-ark-host": "npm:typescript@6.0.3"
}
```

The CLI still resolves the consumer project's **own** `typescript` first so a usable project API
and its module-resolution semantics win. If that export is missing or version-only, ArkGate loads
`typescript-ark-host`. Because the dependency key is distinct from `typescript`, npm, pnpm, and
Yarn cannot satisfy it by reusing the project's TS7 package. It also does not replace the project's
`tsc`; builds and type checks continue to run the compiler selected by the consumer lockfile.

## How loading works

1. Prefer `require('typescript')` from the **project** root when it has `sys` + AST + resolve.
2. If the project export is missing or **not API-compatible** (for example, the TS 7.0
   version-only export), load `typescript-ark-host` at exact `npm:typescript@6.0.3` from ArkGate's
   install tree.
3. If neither host is usable, analysis is `unavailable`: plan has `goal.met: false`, normal JSON
   has `valid: false` and `ok: false` with `ANALYSIS_HOST_UNAVAILABLE`, and the CLI exits `2`.
4. If the selected host reports parse diagnostics in governed files, analysis is `partial`:
   `--plan --json` has `goal.met: false`, normal JSON has `valid: false` / `ok: false`, and
   `--strict-merge` exits `1`. The non-strict command preserves its legacy advisory exit code;
   doctor also remains diagnostic while exposing the same completeness and parse-health evidence.

Debug which TypeScript was used:

```bash
ARK_DEBUG_TS=1 npx arkgate-check --plan
# project TS 5/6 → [ark-check] TypeScript 5.9.3 via project
# project TS 7   → [ark-check] TypeScript 6.0.3 via arkgate-fallback (fallback)
```

## Analysis identity and completeness (schema 1.3)

Every current CLI/MCP/hook diagnostic envelope carries required `mode`, `completeness`, and
structured `completenessReasons`:

| Value | Meaning | Can plan/check be green? |
|-------|---------|--------------------------|
| `complete` | Every governed file was analyzed with a usable host and no parse diagnostics | Yes, if the normal contract verdict is also clean |
| `partial` | A host ran, but governed syntax could not be fully parsed | No in JSON/plan; strict merge fails. The non-strict process exit remains advisory for compatibility |
| `unavailable` | No API-compatible host could produce architecture evidence | No; CLI exits `2` |

Schema 1.3 also distinguishes `resolved-candidate-facts` from `lexical-compatibility`.
Resolved complete/partial results carry `policyHash`, `resolverIdentity`, `factsHash`, and
`candidateTreeHash`, so adapters can prove they evaluated the same input. Single-file lexical
surfaces cannot prove module resolution and therefore report `partial`, `valid:false`, plus
`lexicalValid` where useful. Both the exported union and JSON Schema prohibit `valid:true` for
partial/unavailable analysis. The public TypeScript `AdapterResult` union still accepts
consumer-owned 1.0/1.1/1.2 values. For source compatibility, the low-level
`createAdapterResult({ valid, ... })` factory still treats omitted completeness as complete; that
legacy construction is not evidence of resolved adapter parity, and shipped adapters pass mode,
completeness, reasons, and identities explicitly.

## TypeScript 7 notes

TypeScript 7 is the **native (Go) compiler** generation. Important for tools like ArkGate:

- **`require('typescript')` on 7.0.x** exports only `{ version, versionMajorMinor }` — not `sys`, `createSourceFile`, or `resolveModuleName`.  
- Unstable programmatic surfaces live under `typescript/unstable/*` (sync/async API, AST). They are **not** the classic TS 5/6 host ArkGate uses today.
- Stable **programmatic JS API** maturity continues over the 7.x line (Microsoft: full story into **7.1+**).  
- When the project’s TypeScript is not API-compatible, the current source line loads the exact,
  separately named `typescript-ark-host` dependency. Published 3.7.0 does not yet have that fix.
- TypeScript 7 syntax that TypeScript 6.0.3 cannot parse is reported as `partial`, never clean.
  ArkGate fails closed until its analysis host can parse every governed file.
- Your **tsconfig** must follow TS 6/7 defaults (see below) or `tsc` / resolve can fail independently of ArkGate.

### tsconfig defaults that surprise teams (TS 6 → 7)

Adopt these before or when moving to TS 7:

| Option | TS7 direction |
|--------|----------------|
| `strict` | default `true` |
| `module` | often `esnext` |
| `moduleResolution` | `nodenext` or `bundler` (not `node` / `node10`) |
| `baseUrl` | removed — put paths relative to project root |
| `types` | default `[]` — list globals explicitly, e.g. `["node"]` |
| `rootDir` | default `./` — set `"./src"` when sources live under `src` |
| `target: es5` | unsupported |
| `esModuleInterop: false` | unsupported |

Example consumer-friendly skeleton (also used in `tests/fixtures/ts-consumer`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "rootDir": "./src",
    "types": ["node"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

## Project compiler remains project-owned

Do not downgrade, alias, or replace the project's `typescript` dependency for ArkGate. A TS7
project keeps TS7 for `tsc`, editor semantics, and its lockfile; `typescript-ark-host` is an
internal analysis dependency. If a repository intentionally runs multiple `tsc` versions for its
own migration, keep that setup separate from ArkGate's host resolution.

Declare the project compiler directly whenever you invoke `tsc`. If a consumer has no direct
`typescript` dependency, a package manager may expose the fallback alias's binary because it is the
only compiler in the install; that binary is not ArkGate's promise for project type checking. A
direct project `typescript` dependency wins in the packed npm, pnpm, and Yarn cells.

## Yarn PnP and the native TS7 compiler

The supported Yarn 4.17.1 matrix names its linker mode explicitly:

- TypeScript 5.9/6.0 cells use **strict PnP** with no root `node_modules`.
- TypeScript 7.0 cells use Yarn's **`node-modules` linker**, so the native compiler resolves normal
  package imports without an internal-path or unplugged-package bridge.

Yarn supports PnP for JS TypeScript releases by applying a compatibility patch to TypeScript's
resolver. The native TS7 compiler does not execute that JavaScript patch. ArkGate therefore does
not claim strict-PnP type-checking support for the TS7 cell; use Yarn's `node-modules` linker or
remain on the JS compiler for that workflow. ArkGate's CLI/MCP analysis-host fallback is a separate
concern and never changes the compiler selected by the project. See Yarn's
[PnP explanation](https://yarnpkg.com/getting-started/qa#why-is-typescript-patched-even-if-i-dont-use-plugnplay)
and Microsoft's [TS7 native release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

## CI matrix (this repo)

The release compatibility workflow packs the candidate first, then tests clean consumers across:

- Node **18 / 20 / 22 / 24**;
- **npm / pnpm / Yarn**;
- project TypeScript **5.9.3 / 6.0.3 / 7.0.2**.

That is 36 installed-artifact cells. Each cell verifies that the project's `tsc` stays on the
requested project compiler and that ArkGate resolves its fallback as exact 6.0.3 when the project
API is unusable. Reports record `installMode` so the Yarn TS7 linker boundary cannot disappear
behind a green job. All 36 cells passed on source `228dd893` in CI run `29655190747`. Locally, the
repository entry point is:

```bash
npm run test:ts-compat
```

## What “compatible” means for ArkGate

| Goal | Status |
|------|--------|
| Packed gate runs beside project TS 7 | Yes in current source; verified across the complete packed matrix. Published 3.7.0 predates the distinct host |
| Plan/check work with project TS 5/6 | Yes |
| Plan/check work when project has TS 7 + usable `sys` | Yes (uses project) |
| Project `tsc` remains the selected project version | Yes; the analysis alias does not replace it |
| TS7-only syntax outside the TS6 parser envelope reports clean | No; completeness becomes `partial` and strict merge fails |
| Missing analysis host can satisfy a plan | No; completeness is `unavailable`, goal is false, exit is `2` |
| Gate uses native Go typechecker API exclusively | Not required; future if 7.1+ exposes a stable Node API we adopt |
| User tsconfigs with removed options still “just work” | User must migrate tsconfig (TS6/7); Ark reports resolve/parse failures clearly |

## Static-analysis soundness envelope

ArkGate uses the TypeScript compiler API to extract dependency and ambient-capability facts. The
same Kernel implementation feeds the library, CLI, MCP write gate, and AICodeGate bundle.

Dependency forms enforced when their module specifier is a string literal:

- ESM `import`, `import type`, side-effect imports, and `export ... from` / `export type ... from`;
- TypeScript `import x = require("...")`;
- unshadowed CommonJS `require("...")`;
- dynamic `import("...")`.

Non-literal `import(expr)` and unshadowed `require(expr)` are reported as unresolved. They are
advisory by default, fail with `--strict-config`, and may be reviewed at file granularity through
`dynamicImportAllowlist`. A locally declared `require` function is not treated as CommonJS.

Forbidden capabilities are resolved with single-file TypeScript symbols. Local variables,
parameters, and imports shadow ambient names; aliases such as `const Clock = Date`, explicit
`globalThis`, static bracket access, and object destructuring remain detectable. Resolution of
module paths then uses the nearest tsconfig/jsconfig compiler options, including path aliases,
project-local packages, workspaces, and symlinked workspace entries.

`forbiddenGlobals: ["process"]` also owns the exact runtime module spellings `process` and
`node:process`. They report `FORBIDDEN_GLOBAL` with import-form evidence across the CLI, pure IR,
atomic preflight, MCP/AICodeGate, and ESLint. This is an exact dual, not a process-capability wall:
`node:process/subpath`, `child_process`, and `node:child_process` do not match. `import type` and
`export type` declarations are erased and do not produce this finding on any path. The
symbol-aware CLI/hook/AICodeGate path and ESLint also recognize all-type named lists; the
compiler-free pure IR retains its documented conservative treatment of those lists as value
imports.

ArkGate intentionally does not claim soundness for runtime-generated module names, `eval`, custom
loader functions, proxy-based globals, dynamically computed property keys, or aliases mutated
after declaration. Those constructs must remain absent from governed pure layers or be handled by
an explicit project policy. Every newly discovered bypass is minimized into the adversarial corpus.

## Future (7.1+ programmatic API)

When Microsoft ships a stable Node API for native TypeScript 7.1+:

1. Extend `usableTypescript` for the new export shape.  
2. Keep the multi-version matrix green.  
3. Optionally prefer project TS 7 for resolution without fallback.

Until then, the exact TypeScript 6 analysis alias is the compatibility bridge. Any `partial` or
`unavailable` result is a hard stop for accepting the analysis, not permission to trust a
clean-looking subset. Automation must read `valid`/`ok` or use `--strict-merge`; the legacy
non-strict process exit is not the completeness authority.
