# MCP server

`arkgate-mcp` speaks JSON-RPC on stdin. `validate_code` returns the same forbidden-global finding as the CLI.

## Sub-features

- `initialize` answers with server name `arkgate`.
- `validate` returns `FORBIDDEN_GLOBAL` for a domain file that calls `Date.now()`.

## How to get to it (user POV)

- The host starts `npx arkgate-mcp`.
- The agent calls `ark_identity`, then `ark_manifest` or `ark_prepare_write`. This proof calls `initialize` and `validate_code`.

## Driving it with verify.mjs

Preconditions:

- `dist/index.js` exists. Doctor checks it.
- Fixture `eval/cases/domain-forbidden-global` is present.

- **Handshake and validate.** The driver starts `node bin/ark-mcp.mjs --root <fixture>`, sends `initialize` with protocol `2024-11-05`, then `tools/call` `validate_code` for `src/domain/clock.ts` with body `export const t = Date.now();`. The replies contain `"name":"arkgate"` and `FORBIDDEN_GLOBAL`. The driver then stops that process.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only mcp`.

## Gotchas

- `validate_code` is one file. Its reply says the result is provisional. `FORBIDDEN_GLOBAL` is still the signal for this call.
- Do not leave the server running. The driver kills the process it spawned.
