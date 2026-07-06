#!/usr/bin/env node
import { arkCommand } from './ark-shared.mjs';

if (process.env.ARK_POSTINSTALL_SILENT === '1') {
  process.exit(0);
}

// During a dependency install the lifecycle cwd is THIS package's own dir inside
// node_modules; INIT_CWD is the directory the user ran the install from (their project
// root). Detect the package manager there so the hints match a pnpm/yarn repo instead of
// always saying npx — a "pnpm only, never npx" repo treats an emitted `npx` as a violation.
const root = process.env.INIT_CWD || process.cwd();

console.log(`Ark installed, but not enforced yet.
Run: ${arkCommand(root, 'ark', 'init')}

For non-interactive setup:
Run: ${arkCommand(root, 'ark', 'init --yes')}

Already using Ark in this project? This version may ship new gate templates
and /ark-* skills. Refresh them for every detected agent CLI (Claude, Cursor,
Codex, Windsurf, Cline, Kiro) — only missing files are written:
Run: ${arkCommand(root, 'ark-check', '--install-agent-gates')}
`);
