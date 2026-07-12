# TypeScript support (5.x · 6.x · 7.x)

ArkGate’s architecture gate (`arkgate-check` / `ark-mcp`) needs a **JavaScript API**
TypeScript package that exposes:

- `ts.sys` (at least `fileExists`)
- `createSourceFile` (AST)
- `resolveModuleName` (module graph)

It does **not** require the Go-native `tsc` binary for the gate. Type-checking
semantics of your app still come from **your** project `typescript` + `tsconfig`.

## Supported versions

| Range | Status |
|-------|--------|
| **TypeScript 5.x** | Fully supported (primary CI) |
| **TypeScript 6.x** | Supported (bridge release before 7) |
| **TypeScript 7.x** | Supported as **project** compiler; gate loads project TS when API-compatible, otherwise **falls back** to a JS-API TypeScript |

Optional peer (documentational):

```json
"peerDependencies": {
  "typescript": ">=5.0.0 <8"
}
```

ArkGate does not hard-require `typescript` as a runtime dependency of the package
itself; the CLI resolves it from the **project** first, then from the environment.

## How loading works

1. Prefer `require('typescript')` from the **project** root (when it has `sys` + AST + resolve).  
2. If missing or **not API-compatible** (TS 7.0 version-only export, or incomplete host), fall back to **ArkGate’s own** `typescript` dependency (JS-API 5.x nested under the package), then bare `import('typescript')`.
3. If nothing usable is found:  
   - `--plan` still prints **coverage honesty** (no import graph)  
   - full check exits non-zero with an install hint  

Debug which TypeScript was used:

```bash
ARK_DEBUG_TS=1 npx arkgate-check --plan
# → [ark-check] TypeScript 5.9.x via arkgate (fallback)
```

## TypeScript 7 notes

TypeScript 7 is the **native (Go) compiler** generation. Important for tools like ArkGate:

- **`require('typescript')` on 7.0.x** exports only `{ version, versionMajorMinor }` — not `sys`, `createSourceFile`, or `resolveModuleName`.  
- Unstable programmatic surfaces live under `typescript/unstable/*` (sync/async API, AST). They are **not** the classic TS 5/6 host ArkGate uses today.
- Stable **programmatic JS API** maturity continues over the 7.x line (Microsoft: full story into **7.1+**).  
- When the project’s TypeScript is not API-compatible, ArkGate loads its **bundled JS-API dependency** (`typescript@^5.9`, nested under the package) so the host write path and CI check keep working while you try TS 7 as the project compiler.
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

## Side-by-side TypeScript 6 + 7 (tooling)

If you need **tsc 7** for builds and a **JS API 6** for tools that still expect classic exports:

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6.0.0",
    "typescript-7": "npm:typescript@^7.0.0"
  }
}
```

- `npx tsc6` — TypeScript 6 CLI (from the alias package)  
- `npx typescript-7` / install path — TypeScript 7 CLI as needed  

ArkGate will prefer the project’s `typescript` package; keep that entry **API-compatible** (5/6, or 7 once `sys` is present). See Microsoft’s TS 7 RC blog for dual-install details.

## CI matrix (this repo)

GitHub Actions job `ts-compat` installs TypeScript **5.9.x**, **6.0.x**, and **7.0.x** into a temp copy of `tests/fixtures/ts-consumer` and runs:

```bash
node bin/ark-check.mjs --root <fixture> --plan --json --no-cache
```

Locally:

```bash
node scripts/ts-compat-matrix.mjs 5.9.3
node scripts/ts-compat-matrix.mjs 6.0.3
node scripts/ts-compat-matrix.mjs 7.0.2
```

## What “compatible” means for ArkGate

| Goal | Status |
|------|--------|
| Gate does not crash on project TS 7 | Yes (fallback if API incomplete) |
| Plan/check work with project TS 5/6 | Yes |
| Plan/check work when project has TS 7 + usable `sys` | Yes (uses project) |
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

ArkGate intentionally does not claim soundness for runtime-generated module names, `eval`, custom
loader functions, proxy-based globals, dynamically computed property keys, or aliases mutated
after declaration. Those constructs must remain absent from governed pure layers or be handled by
an explicit project policy. Every newly discovered bypass is minimized into the adversarial corpus.

## Future (7.1+ programmatic API)

When Microsoft ships a stable Node API for native TypeScript 7.1+:

1. Extend `usableTypescript` for the new export shape.  
2. Keep the multi-version matrix green.  
3. Optionally prefer project TS 7 for resolution without fallback.

Until then, **fallback + matrix** is the compatibility story so teams can try TS 7 today without breaking the architecture gate.
