/**
 * Package surface truth: the MCP Registry launch argv, CJS declarations in the exports map,
 * the Action pin in the CI docs, and the deprecated companion's migration pointer.
 * The packed-tarball end-to-end checks live in tests/publish/pack-restore.test.ts.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectDualTypesErrors } from '../../../scripts/verify-package-files.mjs';
import {
  MCP_COMMANDS,
  isMcpCommand,
  isPassthroughCommand,
} from '../../../bin/lib/passthrough-commands.mjs';

const read = (rel: string) => fs.readFileSync(rel, 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('MCP Registry descriptor', () => {
  it('passes a first argument that the default npx bin routes to the MCP server', () => {
    const server = JSON.parse(read('server.json'));
    const entry = server.packages[0];
    // npx runs the bin named after the package, never `arkgate-mcp`.
    expect(pkg.bin[entry.identifier]).toBe('bin/ark.mjs');
    const first = entry.packageArguments[0];
    expect(first).toMatchObject({ type: 'positional', value: 'mcp' });
    expect(isMcpCommand(first.value)).toBe(true);
  });

  it('keeps the spellings used by registry entries published through 4.8.23', () => {
    expect(MCP_COMMANDS).toEqual(['mcp', 'arkgate-mcp', 'ark-mcp']);
    for (const command of [...MCP_COMMANDS, 'dashboard', 'report']) {
      expect(isPassthroughCommand(command), command).toBe(true);
    }
    for (const command of ['start', 'upgrade', 'mcp-server', undefined]) {
      expect(isPassthroughCommand(command), String(command)).toBe(false);
    }
  });
});

describe('dual ESM/CJS declarations', () => {
  it('the current package.json maps require to .d.cts and ships them', () => {
    expect(collectDualTypesErrors(pkg, pkg.files)).toEqual([]);
  });

  it('flags the 4.8.23 shape (one ESM types for both conditions, *.d.cts excluded)', () => {
    const legacy = {
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.cjs' },
        './runtime': {
          types: './dist/runtime/index.d.ts',
          import: './dist/runtime/index.js',
          require: './dist/runtime/index.cjs',
        },
      },
    };
    const errors = collectDualTypesErrors(legacy, ['dist', '!dist/**/*.d.cts'], '/nonexistent');
    expect(errors).toContain(
      'package.json files[] excludes *.d.cts: CommonJS consumers lose their declarations'
    );
    expect(errors).toContain(
      'exports["./runtime"] must nest { types, default } under both import and require'
    );
  });

  it('flags a subpath missing its node10 typesVersions entry', () => {
    const { typesVersions: _drop, ...withoutTypesVersions } = pkg;
    const errors = collectDualTypesErrors(withoutTypesVersions, pkg.files);
    expect(errors.some((error: string) => error.includes('typesVersions["*"]["runtime"]'))).toBe(true);
  });
});

describe('docs truth', () => {
  it('the composite Action example pins the current release', () => {
    const pins = [...read('docs/ai-gates.md').matchAll(/pedroknigge\/arkgate@(v[^\s`'"]+)/g)].map(
      (match) => match[1]
    );
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(pin).toBe(`v${pkg.version}`);
  });

  it('configuration.md names real policy-delta entry points and the childSlices identity', () => {
    const config = read('docs/configuration.md');
    expect(config).not.toMatch(/`ark policy-delta`/);
    expect(config).toContain('`--policy-base-ref <ref>`');
    expect(config).toContain('`ark_policy_delta`');
    expect(config).toMatch(/With `"sliceIdentity": "stars"`, `lib\/features\/\*\/\*`/);
    expect(config).toContain('`CONFIG_CHILD_SLICE_EXTENDS`');
  });

  it('the deprecated companion points at arkgate/runtime', () => {
    const runtime = JSON.parse(read('packages/runtime/package.json'));
    expect(runtime.description).toMatch(/^DEPRECATED/);
    expect(runtime.description).toContain('"arkgate/runtime"');
    expect(runtime.description).toContain('"arkgate/nestjs"');
    expect(read('packages/runtime/README.md')).toContain("from 'arkgate/runtime'");
    expect(read('CONTRIBUTING.md')).toContain("npm deprecate '@arkgate/runtime@*'");
  });
});
