#!/usr/bin/env node

if (process.env.ARK_POSTINSTALL_SILENT === '1') {
  process.exit(0);
}

console.log(`Ark installed, but not enforced yet.
Run: npx ark init

For non-interactive setup:
Run: npx ark init --yes
`);
