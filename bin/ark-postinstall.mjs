#!/usr/bin/env node

if (process.env.ARK_POSTINSTALL_SILENT === '1') {
  process.exit(0);
}

console.log(`Ark installed, but not enforced yet.
Run: npx ark init

For non-interactive setup:
Run: npx ark init --yes

Already using Ark in this project? This version may ship new gate templates
and /ark-* skills. Refresh them for every detected agent CLI (Claude, Cursor,
Codex, Windsurf, Cline, Kiro) — only missing files are written:
Run: npx ark-check --install-agent-gates
`);
