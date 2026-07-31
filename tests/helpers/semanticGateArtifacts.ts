import fs from 'node:fs';
import path from 'node:path';

function write(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

export function writeSemanticGateArtifacts(root: string): void {
  write(
    root,
    'AGENTS.md',
    [
      '# ArkGate Enforcement',
      '',
      '`ark.config.json` is authoritative for this project.',
      'Run `npx ark-check --root . --config ark.config.json --strict-merge`.',
      '',
    ].join('\n'),
  );
  write(
    root,
    '.mcp.json',
    `${JSON.stringify(
      {
        mcpServers: {
          ark: {
            command: 'npx',
            args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    '.github/workflows/ark.yml',
    [
      'name: Ark',
      'on: [push]',
      'jobs:',
      '  architecture:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npx ark-check --root . --config ark.config.json --strict-merge',
      '',
    ].join('\n'),
  );
}
