/**
 * `ark-check --sensors` and `--promote` end to end.
 *
 * Everything runs in a temp directory removed in a `finally` — the harness must
 * never dirty the tree it is measuring.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECK_BIN = path.join(REPO_ROOT, 'bin/ark-check.mjs');

function run(root: string, extra: string[]) {
  const result = spawnSync(
    'node',
    [CHECK_BIN, '--root', root, '--config', 'ark.config.json', ...extra],
    { encoding: 'utf8' }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const ARKRULES = {
  schemaVersion: '1.0',
  layer: 'DomainModel',
  structure: [
    // The field's own case: the author's id is "types-only", the sensor is
    // "no-anemic-model", and the old rejection named only the sensor.
    { id: 'types-only', sensor: 'no-anemic-model', mode: 'advisory' },
    { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
    { id: 'thin', sensor: 'thin-adapter', mode: 'advisory' },
  ],
  invariants: [
    { id: 'INV-NO-EVIDENCE', description: 'nothing covers this one', mode: 'advisory' },
  ],
};

function seed(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-sensors-'));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    `${JSON.stringify(
      {
        schemaVersion: '1.1',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
        arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(root, 'arkrules/DomainModel.json'),
    `${JSON.stringify(ARKRULES, null, 2)}\n`
  );
  // One exported class with public mutable state, so `private-state` has a
  // finding to charge a promotion for.
  fs.writeFileSync(
    path.join(root, 'src/domain/Order.ts'),
    'export class Order {\n  public total = 0;\n  public set amount(v: number) {\n    this.total = v;\n  }\n}\n'
  );
  return root;
}

describe('ark-check --sensors', () => {
  it('names the local rule id, its sensor and its source file when it cannot be promoted', () => {
    const root = seed();
    try {
      const result = run(root, ['--sensors']);
      expect(result.status).toBe(0);
      // The whole point: the author reads their OWN id, not only the
      // vocabulary id the contract rejection used to print alone.
      expect(result.stdout).toContain('types-only');
      expect(result.stdout).toContain('no-anemic-model');
      expect(result.stdout).toContain('arkrules/DomainModel.json');
      expect(result.stdout).toContain('Tier-2');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists every sensor of every plane with its promotability, before any rule is written', () => {
    const root = seed();
    try {
      const payload = JSON.parse(run(root, ['--sensors', '--json']).stdout).sensors;
      const planes = new Set(payload.vocabulary.map((entry: { plane: string }) => entry.plane));
      expect(planes).toEqual(new Set(['arkrules', 'arkrun', 'arkorder']));
      const blocked = payload.vocabulary
        .filter((entry: { promotable: boolean }) => !entry.promotable)
        .map((entry: { sensor: string }) => entry.sensor);
      expect(blocked).toContain('no-anemic-model');
      expect(blocked).toContain('arkrun-skip-resolve');
      expect(payload.notAScore).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports an uncovered invariant as blocked with the coverage reason', () => {
    const root = seed();
    try {
      const payload = JSON.parse(run(root, ['--sensors', '--json']).stdout).sensors;
      const inv = payload.invariants.find(
        (row: { id: string }) => row.id === 'INV-NO-EVIDENCE'
      );
      expect(inv.promotable).toBe(false);
      expect(inv.blocker).toBe('no-coverage-evidence');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ark-check --promote', () => {
  it('prices every declared rule from one run and writes nothing by default', () => {
    const root = seed();
    const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
    try {
      const result = run(root, ['--promote', '--json']);
      expect(result.status).toBe(0);
      const preview = JSON.parse(result.stdout).promote;
      const byId = Object.fromEntries(
        preview.rows.map((row: { id: string }) => [row.id, row])
      );
      expect(byId['private-state'].wouldBlock).toBeGreaterThan(0);
      // Tier-2 is never a promotion cost, however many warnings it produces.
      expect(byId['types-only'].wouldBlock).toBe(0);
      expect(byId['types-only'].promotable).toBe(false);
      // Plan by default: the house convention, no --dry-run flag anywhere.
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 on an id nobody declared and offers the declared ids back', () => {
    const root = seed();
    try {
      const result = run(root, ['--promote', 'thi']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('thin');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--apply writes mode enforced, and the gate then fails on the same finding', () => {
    const root = seed();
    try {
      const applied = run(root, ['--promote', 'private-state', '--apply']);
      expect(applied.status).toBe(0);
      const written = JSON.parse(
        fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')
      );
      expect(
        written.structure.find((row: { id: string }) => row.id === 'private-state').mode
      ).toBe('enforced');
      // Promotion has to mean something. Asserting only that the row now reads
      // `enforced` would pass even if `enforced` never reached `failsStrict`,
      // so run the actual gate and require it to fail on the same rule.
      const gate = run(root, []);
      expect(gate.status).not.toBe(0);
      expect(`${gate.stdout}${gate.stderr}`).toContain('private-state');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--apply refuses a Tier-2 rule, exits 1 and leaves the file untouched', () => {
    const root = seed();
    const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
    try {
      const result = run(root, ['--promote', 'types-only', '--apply']);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('not applied');
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--apply without a rule id refuses rather than promoting everything at once', () => {
    const root = seed();
    const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
    try {
      const result = run(root, ['--promote', '--apply']);
      expect(result.status).toBe(1);
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a bare --apply instead of ignoring it', () => {
    const root = seed();
    try {
      const result = run(root, ['--apply']);
      expect(result.status).toBe(2);
      expect(`${result.stderr}${result.stdout}`).toContain('--apply applies to --promote');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to write through an in-root symlinked ArkRules file', () => {
    const root = seed();
    try {
      const real = path.join(root, 'arkrules/real.json');
      fs.renameSync(path.join(root, 'arkrules/DomainModel.json'), real);
      const before = fs.readFileSync(real, 'utf8');
      fs.symlinkSync('real.json', path.join(root, 'arkrules/DomainModel.json'));
      const result = run(root, ['--promote', 'private-state', '--apply']);
      expect(result.status).toBe(1);
      // O_NOFOLLOW refuses the symlinked LEAF at open time. It does not cover
      // an ancestor component — writeRulePromotion says so rather than implying
      // the whole path is race-free.
      expect(result.stdout).toContain('symlink');
      expect(fs.readFileSync(real, 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('never reaches the write when the contract points outside the root', () => {
    const root = seed();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-sensors-out-'));
    try {
      const target = path.join(outside, 'DomainModel.json');
      fs.copyFileSync(path.join(root, 'arkrules/DomainModel.json'), target);
      const before = fs.readFileSync(target, 'utf8');
      fs.rmSync(path.join(root, 'arkrules/DomainModel.json'));
      fs.symlinkSync(target, path.join(root, 'arkrules/DomainModel.json'));
      const result = run(root, ['--promote', 'private-state', '--apply']);
      // The ArkRules loader fails closed first, so no promotability is
      // reported at all rather than being reported about someone else's tree.
      expect(result.status).toBe(2);
      expect(`${result.stderr}${result.stdout}`).toContain('outside the project root');
      expect(fs.readFileSync(target, 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses a rule id declared in two different ArkRules documents', () => {
    // Ids are unique per document, not across them. Before the fix --apply took
    // the alphabetically-first row, wrote that file, reported plain success,
    // and left the other declaration advisory and unmentioned.
    const root = seed();
    try {
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'src/app/Svc.ts'),
        'export class Svc {\n  public n = 0;\n}\n'
      );
      const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
      config.layers.push({ name: 'App', patterns: ['src/app/**'] });
      config.arkRules.App = 'arkrules/App.json';
      fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
      fs.writeFileSync(
        path.join(root, 'arkrules/App.json'),
        `${JSON.stringify(
          {
            schemaVersion: '1.0',
            layer: 'App',
            structure: [
              { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
            ],
          },
          null,
          2
        )}\n`
      );
      const before = {
        domain: fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8'),
        app: fs.readFileSync(path.join(root, 'arkrules/App.json'), 'utf8'),
      };
      const preview = JSON.parse(run(root, ['--promote', '--json']).stdout).promote;
      const rows = preview.rows.filter((row: { id: string }) => row.id === 'private-state');
      expect(rows).toHaveLength(2);
      // Each row must carry ITS OWN findings. Keyed on the bare id they pooled,
      // and each row reported the other's findings as its own.
      expect(rows.every((row: { currentFindings: number }) => row.currentFindings === 1)).toBe(true);
      expect(rows.every((row: { ambiguousId: boolean }) => row.ambiguousId)).toBe(true);

      const applied = run(root, ['--promote', 'private-state', '--apply']);
      expect(applied.status).toBe(1);
      expect(applied.stdout).toContain('declared 2 times');
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(
        before.domain
      );
      expect(fs.readFileSync(path.join(root, 'arkrules/App.json'), 'utf8')).toBe(before.app);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('will not sell teeth the classification floor takes away', () => {
    // Reproduced end to end before the fix: preview promised "1 advisory
    // finding would start failing the gate", --apply wrote enforced and said
    // "re-run the gate to see the rule bite", and the next run printed the
    // violation followed by "Ark check passed" and exit 0.
    const root = seed();
    try {
      fs.mkdirSync(path.join(root, 'src/other'), { recursive: true });
      for (const n of [1, 2, 3, 4, 5, 6]) {
        fs.writeFileSync(path.join(root, `src/other/f${n}.ts`), `export const x${n} = ${n};\n`);
      }
      const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
      const preview = JSON.parse(run(root, ['--promote', '--json']).stdout).promote;
      expect(preview.analysis.teethDemotedByFloor).toBe(true);
      expect(preview.countsTrustworthy).toBe(false);
      expect(preview.totals.wouldBlock).toBe(0);

      const applied = run(root, ['--promote', 'private-state', '--apply']);
      expect(applied.status).toBe(1);
      expect(applied.stdout).toContain('classification floor');
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a mode flag that would answer first and leave --apply a silent no-op', () => {
    const root = seed();
    const before = fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8');
    try {
      for (const shadow of ['--sensors', '--coverage', '--plan']) {
        const result = run(root, [shadow, '--promote', 'private-state', '--apply']);
        expect(result.status).toBe(2);
        expect(`${result.stderr}${result.stdout}`).toContain('cannot be combined');
      }
      // A narrowed scope cannot price a promotion either.
      const narrowed = run(root, ['--promote', '--changed']);
      expect(narrowed.status).toBe(2);
      expect(`${narrowed.stderr}${narrowed.stdout}`).toContain('whole governed tree');
      expect(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts --promote=<id> so an id starting with a dash is reachable', () => {
    const root = seed();
    try {
      const result = run(root, ['--promote=private-state', '--json']);
      expect(result.status).toBe(0);
      const preview = JSON.parse(result.stdout).promote;
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].id).toBe('private-state');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('writeRulePromotion refusals', () => {
  it('names every refusal and never touches the bytes', async () => {
    const { writeRulePromotion } = await import('../../../bin/lib/sensor-promote-io.mjs');
    const root = seed();
    const rel = 'arkrules/DomainModel.json';
    const target = path.join(root, rel);
    try {
      const before = fs.readFileSync(target, 'utf8');

      // A hard link: lstat reports an ordinary file while the write lands on a
      // shared inode, so nlink is the only thing that catches it.
      const linked = path.join(root, 'arkrules/linked.json');
      fs.linkSync(target, linked);
      expect(writeRulePromotion(root, rel, 'private-state')).toMatchObject({
        ok: false,
        reason: 'hard-link',
      });
      expect(fs.readFileSync(target, 'utf8')).toBe(before);
      fs.rmSync(linked);

      // Not valid UTF-8: reading as utf8 turns the byte into U+FFFD and writing
      // the whole string back would destroy it, anywhere in the file.
      const badRel = 'arkrules/bad.json';
      fs.writeFileSync(
        path.join(root, badRel),
        Buffer.concat([Buffer.from('{"structure":[{"id":"x","sensor":"thin-adapter"}]}'), Buffer.from([0xff])])
      );
      expect(writeRulePromotion(root, badRel, 'x')).toMatchObject({
        ok: false,
        reason: 'not-utf8',
      });

      // Outside the root, lexically.
      expect(writeRulePromotion(root, '../escape.json', 'private-state')).toMatchObject({
        ok: false,
        reason: 'outside-root',
      });
      // No source file recorded at all.
      expect(writeRulePromotion(root, '', 'private-state').ok).toBe(false);
      // A rule this document does not declare.
      expect(writeRulePromotion(root, rel, 'nope').ok).toBe(false);
      expect(fs.readFileSync(target, 'utf8')).toBe(before);

      // And the happy path still lands, with the sensor bound.
      expect(writeRulePromotion(root, rel, 'private-state', 'aggregate-private-state')).toMatchObject(
        { ok: true }
      );
      expect(
        JSON.parse(fs.readFileSync(target, 'utf8')).structure.find(
          (row: { id: string }) => row.id === 'private-state'
        ).mode
      ).toBe('enforced');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ark-check --sensors without ArkRules', () => {
  it('says the plane is opt-in instead of reporting an empty verdict', () => {
    const root = seed();
    try {
      const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
      delete config.arkRules;
      fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
      const result = run(root, ['--sensors', '--json']);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout).sensors;
      expect(payload.arkRulesActive).toBe(false);
      expect(payload.totals.declared).toBe(0);
      // The vocabulary is a constant, so it is answerable with no contract at all.
      expect(payload.vocabulary.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 2 rather than reporting promotability it could not load', () => {
    const root = seed();
    try {
      fs.writeFileSync(path.join(root, 'arkrules/DomainModel.json'), '{ not json');
      const result = run(root, ['--sensors']);
      expect(result.status).toBe(2);
      expect(`${result.stderr}${result.stdout}`).not.toContain('promotable per rule');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
