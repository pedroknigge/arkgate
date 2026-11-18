---
name: verify-arkgate
description: "Drive the ArkGate CLIs, write hook, and MCP server against repo fixtures and write a pass/fail evidence report. Use when a change to the gate, start, doctor, coverage, recommend, ArkRules, ArkRun, ArkOrder, host hooks, MCP, or skills needs proof in a pull request."
---

# Verify ArkGate

Run the real CLIs against fixtures in this repo. Paste the report into the pull request. A green unit suite is not that report.

The map is `docs/feature-map.json`. One feature file in `features/` matches each id. Read the feature file before changing a proof. `/maintain-verification-skill` is the upkeep loop when the product changes.

## Launch

From the repository root:

```bash
npm ci
npm run build
```

`npm ci` installs `typescript-ark-host`. `ark-check` needs it to read TypeScript. `npm run build` writes `dist/index.js`. `ark-mcp` loads that file for the write hook and the MCP server.

There is no server to leave running. Each proof starts its own process. Two runs use different temp directories. Do not point a mutating proof at the repository root.

Ready means `node .cursor/skills/verify-arkgate/verify.mjs --doctor` prints `doctor ok`.

## Doctor

```bash
node .cursor/skills/verify-arkgate/verify.mjs --doctor
```

The check is read-only. It looks for `bin/ark-check.mjs`, `bin/ark.mjs`, `bin/ark-mcp.mjs`, `node_modules/typescript-ark-host/package.json`, `dist/index.js`, every fixture path in the map, and a feature file for each id.

Run it again after a failed proof, before the next drive. If a line says `MISSING`, run Launch again. Do not drive until the last line is `doctor ok`.

## Drive

Every mapped feature:

```bash
node .cursor/skills/verify-arkgate/verify.mjs
```

One feature:

```bash
node .cursor/skills/verify-arkgate/verify.mjs --only core-gate
```

The driver reads `docs/feature-map.json` and runs each proof with `driver: true`. Commands, fixtures, and expected signals live in that file. The feature file is the user path for the same id.

A proof that exits with the wrong code, or that lacks the expected signal, is a failure. Do not switch fixtures to make it pass. Record the command and the unmet precondition in that feature's Gotchas.

## Evidence

The driver prints the report and writes the same text to `/tmp/arkgate-verify-evidence.txt`. Override the path with `--evidence`.

Paste the report under `## Evidence` in the pull request. The template is `.github/PULL_REQUEST_TEMPLATE.md`.

Each block names the feature id, the proof id, the exit code, and the line that carried the signal. Capture the command and that line, not only the final `passed` count.

The write hook and MCP proofs exercise the built server. `--strict-merge` is the pull-request check. `start` preview must leave `ark.config.json` absent. `start --apply` passes `--skip-package-manager` so this run does not call the package manager. Confirm that by the report, not by the flag name alone. The apply proof requires `ark.config.json` to exist afterward.

## Cleanup

The driver deletes only temp directories it created, including after a failed proof. It also deletes paths listed on a proof's `cleanup` array (the new file a denied hook must not leave behind).

It does not delete `/tmp/arkgate-verify-evidence.txt`. Do not kill Node by process name.

## Helpers

```bash
node .cursor/skills/verify-arkgate/verify.mjs [--doctor] [--only <feature-id>] [--evidence <path>]
```

`verify.mjs` is the only helper. It uses Node's built-in modules and the repo's `bin/` entry points.
