/**
 * AR15 rules-migration counts must be honest: structure suggestions count as under
 * contract by (layer, sensor), frozen counts ArkRules-plane baseline keys, and the
 * same counts reach --rules-inventory, MCP (shared payload), and doctor.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRulesInventory, isArkRulesFrozenKey } from '../../../src/domain/rulesInventory';
import { buildRulesInventory as buildCli } from '../../../bin/lib/rules-inventory.mjs';
import {
  buildRulesInventoryPayload,
  formatArkRulesDoctorLines,
  summarizeRulesUnderContract,
} from '../../../bin/lib/rules-under-contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const ANEMIC = `export class Customer {
  public id: string;
  public name: string;
  public email: string;
}
`;

function domainInventory(input: Record<string, unknown>) {
  const base = {
    fileContents: { 'src/domain/customer.ts': ANEMIC },
    fileLayers: { 'src/domain/customer.ts': 'Domain' },
    layerContexts: [{ name: 'Domain', intentPrefixes: ['Domain.'] }],
  };
  const domain = buildRulesInventory({ ...base, ...input });
  const cli = buildCli({ ...base, ...input });
  expect({ u: cli.underContract, f: cli.frozen }).toEqual({
    u: domain.underContract,
    f: domain.frozen,
  });
  return domain;
}

describe('rules migration counts (arkrules cluster)', () => {
  it('a structure suggestion is under contract by (layer, sensor), whatever the rule id', () => {
    const none = domainInventory({});
    const anemic = none.candidates.find((c) => c.kind === 'anemic-entity');
    expect(anemic?.suggestedArkRule?.sensor).toBe('no-anemic-model');
    const layer = anemic!.suggestedArkRule!.layer;
    expect(none.underContract).toBe(0);
    expect(
      domainInventory({ contractedStructure: [{ layer, sensor: 'no-anemic-model' }] }).underContract
    ).toBe(1);
    // Same sensor on ANOTHER layer does not count.
    expect(
      domainInventory({ contractedStructure: [{ layer: 'Other', sensor: 'no-anemic-model' }] })
        .underContract
    ).toBe(0);
  });

  it('frozen counts only ArkRules-plane baseline keys', () => {
    expect(isArkRulesFrozenKey('ARKRULE_STRUCTURE|src/domain/o.ts|Domain||x')).toBe(true);
    expect(isArkRulesFrozenKey('INVARIANT_UNCOVERED|arkrules/D.json|Domain||INV-1')).toBe(true);
    expect(isArkRulesFrozenKey('LAYER_IMPORT_VIOLATION|src/a.ts|A|B|x')).toBe(false);
    const inv = domainInventory({
      frozenKeys: [
        'ARKRULE_STRUCTURE|src/domain/o.ts|Domain||domain-event-on-mutation',
        'ARKRULE_STRUCTURE|src/domain/p.ts|Domain||domain-event-on-mutation',
        'LAYER_IMPORT_VIOLATION|src/a.ts|A|B|x',
      ],
    });
    expect(inv.frozen).toBe(2);
  });

  it('tooling: --rules-inventory, the shared MCP payload, and doctor agree', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rules-migration-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'domain', 'customer.ts'), ANEMIC);
    const config = {
      schemaVersion: '1.1',
      include: ['src'],
      layers: [{ name: 'Domain', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] }],
      rules: [],
      dynamicImportAllowlist: [],
      arkRules: { Domain: 'arkrules/Domain.json' },
    };
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
    fs.writeFileSync(
      path.join(root, 'arkrules', 'Domain.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'Domain',
        structure: [{ id: 'my-anemic', sensor: 'no-anemic-model' }],
      })
    );
    fs.writeFileSync(
      path.join(root, '.ark-baseline.json'),
      JSON.stringify({
        version: 2,
        violations: [
          'ARKRULE_STRUCTURE|src/domain/customer.ts|Domain||no-anemic-model',
          'LAYER_IMPORT_VIOLATION|src/a.ts|A|B|x',
        ],
      })
    );

    const { payload } = buildRulesInventoryPayload(root, config);
    expect(payload.rulesMigration).toMatchObject({ underContract: 1, frozen: 1, notAScore: true });
    expect(payload.rulesMigration.inventoried).toBeGreaterThanOrEqual(1);

    const cli = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'bin', 'ark-check.mjs'),
        '--root',
        root,
        '--config',
        path.join(root, 'ark.config.json'),
        '--rules-inventory',
        '--json',
      ],
      { encoding: 'utf8' }
    );
    const cliJson = JSON.parse(cli.stdout);
    expect(cliJson.rulesMigration).toEqual(payload.rulesMigration);
    expect(Object.keys(cliJson).sort()).toEqual(Object.keys(payload).sort());

    const section = summarizeRulesUnderContract(root, config, { files: [] });
    expect(section.rulesMigration).toEqual(payload.rulesMigration);
    expect(formatArkRulesDoctorLines(section).join('\n')).toMatch(
      /ArkRules migration: \d+ inventoried, 1 under contract, \d+ frozen/
    );

    const doctor = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'bin', 'ark-check.mjs'),
        '--root',
        root,
        '--config',
        path.join(root, 'ark.config.json'),
        '--doctor',
        '--json',
      ],
      { encoding: 'utf8' }
    );
    const doctorJson = JSON.parse(doctor.stdout);
    const doc = doctorJson.doctor ?? doctorJson;
    expect(doc.rulesMigration).toEqual(payload.rulesMigration);
  });
});
