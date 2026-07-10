/**
 * P0–P2 product priorities: empty-scope honesty, TS package include, AGENTS non-clobber,
 * contract adopt, UI preset, suggest-include, recommend thin-TS, codex multi, soft cycles.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectTsPackageRoots,
  resolveIncludeRoots,
  buildArchitectureRecommendation,
} from '../../../bin/ark-shared.mjs';
import {
  isArkAgentsContent,
  isSelfHostedLibraryAgents,
  writeTemplate,
  wireCodexMcp,
} from '../../../bin/lib/agent-gates.mjs';

const CHECK = path.resolve('bin/ark-check.mjs');
const ARK = path.resolve('bin/ark.mjs');
const temps: string[] = [];

function mk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-p0p2-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const t of temps) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  temps.length = 0;
});

function runCheck(root: string, extra: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CHECK, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('P0 empty-scope honesty', () => {
  it('plan JSON has goal.met false and emptyScope when include matches 0 files', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: true }],
        rules: [],
      })
    );
    // no src/ files
    const r = runCheck(root, ['--plan', '--json']);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.plan.goal.met).toBe(false);
    expect(j.plan.goal.emptyScope).toBe(true);
    expect(j.plan.goal.statement).toMatch(/checks nothing|include/i);
  });

  it('doctor --json adoption includes empty-scope gap', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark Enforcement\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: true }],
        rules: [],
      })
    );
    const r = runCheck(root, ['--doctor', '--json']);
    const j = JSON.parse(r.stdout);
    const ids = (j.doctor?.adoption?.gaps || []).map((g: { id: string }) => g.id);
    expect(ids).toContain('empty-scope');
  });
});

describe('P0 auto-include TS packages', () => {
  it('detectTsPackageRoots finds nested package with TS sources', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'video-pkg', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'video-pkg', 'package.json'), '{"name":"video-pkg"}\n');
    fs.writeFileSync(path.join(root, 'video-pkg', 'src', 'Root.tsx'), 'export const R = 1;\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# polyglot\n');
    const roots = detectTsPackageRoots(root);
    expect(roots).toContain('video-pkg');
    const include = resolveIncludeRoots(root);
    expect(include.some((r) => r === 'video-pkg' || r.startsWith('video-pkg'))).toBe(true);
  });

  it('init monorepo on polyglot-like tree includes nested TS package (non-zero coverage)', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'composer', 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'composer', 'package.json'), '{"name":"composer"}\n');
    fs.writeFileSync(
      path.join(root, 'composer', 'src', 'components', 'A.tsx'),
      'export const A = 1;\n'
    );
    const init = runCheck(root, ['--init', '--preset', 'monorepo', '--force']);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(Array.isArray(cfg.include)).toBe(true);
    expect(cfg.include.some((i: string) => i.includes('composer') || i === 'composer')).toBe(true);
    const cov = runCheck(root, ['--coverage', '--json']);
    const j = JSON.parse(cov.stdout);
    expect(j.coverage.totalFiles).toBeGreaterThan(0);
  });
});

describe('P0 AGENTS non-clobber', () => {
  it('isArkAgentsContent detects Ark templates only', () => {
    expect(isArkAgentsContent('# Ark Enforcement\n\nBefore editing')).toBe(true);
    expect(
      isArkAgentsContent(
        '# OpenMontage\n\nMANDATORY: Read AGENT_GUIDE.md before responding.\n'
      )
    ).toBe(false);
  });

  it('isSelfHostedLibraryAgents detects mother-repo Identity block', () => {
    expect(
      isSelfHostedLibraryAgents(
        '# ArkGate Enforcement (self-hosted)\n\n## Identity — read this first\n\nmother / canonical development repository\n'
      )
    ).toBe(true);
    expect(isSelfHostedLibraryAgents('# Ark Enforcement\n\nBefore editing')).toBe(false);
  });

  it('writeTemplate --force never clobbers self-hosted library AGENTS.md', () => {
    const root = mk();
    const identity = `# ArkGate Enforcement (self-hosted)

## Identity — read this first (every agent)

> **Git / clone only.**

**This working tree is the mother / canonical development repository for the ArkGate library.**

## Where new code belongs
DomainModel only.
`;
    fs.writeFileSync(path.join(root, 'AGENTS.md'), identity);
    const consumerTemplate = `# Ark Enforcement

Before editing TypeScript or JavaScript source files:
1. Run ark-check.
`;
    const r = writeTemplate(root, 'AGENTS.md', consumerTemplate, true);
    expect(r.status).toBe('skipped-self-hosted');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(identity);
  });

  it('writeTemplate --force merges or keeps non-Ark AGENTS.md', () => {
    const root = mk();
    const original =
      '# Project Instructions\n\nDo not run build commands automatically.\nVerify manually.\n';
    fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
    const arkBody = `# Ark Enforcement

Before editing TypeScript or JavaScript source files:

1. Keep source files inside the layer boundaries declared in \`ark.config.json\`.
2. After edits, run \`npx ark-check\`.
`;
    const r = writeTemplate(root, 'AGENTS.md', arkBody, true);
    expect(['merged', 'skipped-non-ark']).toContain(r.status);
    const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(after).toContain('Do not run build commands automatically');
    if (r.status === 'merged') {
      expect(after).toMatch(/Ark Enforcement|ark\.config\.json/);
    }
  });

  it('install-agent-gates --force keeps non-Ark AGENTS body', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'AGENTS.md'),
      '# OpenThing\n\n**MANDATORY: Read GUIDE.md**\nThere are no instructions in this file.\n'
    );
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    const r = runCheck(root, ['--install-agent-gates', '--tools', 'claude', '--force']);
    expect(r.status).toBe(0);
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('MANDATORY: Read GUIDE.md');
  });
});

describe('P1 contract-adopt + suggest-include', () => {
  it('--suggest-include lists nested TS packages', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'pkg', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'pkg', 'package.json'), '{"name":"pkg"}\n');
    fs.writeFileSync(path.join(root, 'pkg', 'src', 'a.ts'), 'export const a = 1;\n');
    const r = runCheck(root, ['--suggest-include', '--json']);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.tsPackages).toContain('pkg');
    expect(j.suggestedInclude.length).toBeGreaterThan(0);
  });

  it('--adopt-contract --write expands include and raises totalFiles', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'ui', 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ui', 'package.json'), '{"name":"ui"}\n');
    fs.writeFileSync(path.join(root, 'ui', 'src', 'components', 'B.tsx'), 'export const B = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'PresentationAdapters',
            patterns: ['**/components/**'],
            optional: true,
          },
        ],
        rules: [],
      })
    );
    const before = runCheck(root, ['--coverage', '--json']);
    const b = JSON.parse(before.stdout);
    expect(b.coverage.totalFiles).toBe(0);
    const adopt = runCheck(root, ['--adopt-contract', '--write', '--json']);
    expect(adopt.status).toBe(0);
    const a = JSON.parse(adopt.stdout);
    expect(a.wrote).toBe(true);
    expect(a.after.totalFiles).toBeGreaterThan(0);
    const after = runCheck(root, ['--coverage', '--json']);
    const c = JSON.parse(after.stdout);
    expect(c.coverage.totalFiles).toBeGreaterThan(0);
  });
});

describe('P1 UI preset + recommend thin TS', () => {
  it('ui-surface preset is listed and writes patterns for hooks/routes + data-client lib bags', () => {
    const root = mk();
    const r = runCheck(root, ['--init', '--preset', 'ui-surface', '--force']);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const pres = cfg.layers.find((l: { name: string }) => l.name === 'PresentationAdapters');
    const persistence = cfg.layers.find((l: { name: string }) => l.name === 'PersistenceAdapters');
    expect(pres.patterns.some((p: string) => p.includes('hooks'))).toBe(true);
    expect(pres.patterns.some((p: string) => p.includes('routes') || p.includes('app'))).toBe(true);
    // No whole-src / bare lib presentation bag (false ENFORCE)
    expect(pres.patterns).not.toContain('**/src/**');
    expect(pres.patterns).not.toContain('**/lib/**');
    // Data clients under lib/ are Persistence
    expect(persistence.patterns.some((p: string) => p.includes('supabase'))).toBe(true);
  });

  it('recommend caps confidence on thin/no TS surface', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'README.md'), '# no ts\n');
    const rec = buildArchitectureRecommendation(root);
    expect(rec.confidence).toBeLessThanOrEqual(0.28);
    expect(rec.thinTsSurface === true || rec.confidence <= 0.28).toBe(true);
  });
});

describe('P2 soft cycles + codex multi', () => {
  it('cyclePolicy soft reports cycle as warning not hard violation', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        cyclePolicy: 'soft',
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    fs.writeFileSync(
      path.join(root, 'src/domain/a.ts'),
      "import { b } from './b.js';\nexport const a = () => b;\n"
    );
    fs.writeFileSync(
      path.join(root, 'src/domain/b.ts'),
      "import { a } from './a.js';\nexport const b = () => a;\n"
    );
    const r = runCheck(root, ['--json']);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.violations.filter((v: { ruleId: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY')).toHaveLength(
      0
    );
    expect(
      (j.warnings || []).some((w: { ruleId: string }) => w.ruleId === 'CIRCULAR_DEPENDENCY')
    ).toBe(true);
  });

  it('cyclePolicy soft passes --strict-config (advisory only); default strict still fails', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/a.ts'),
      "import { b } from './b.js';\nexport const a = () => b;\n"
    );
    fs.writeFileSync(
      path.join(root, 'src/domain/b.ts'),
      "import { a } from './a.js';\nexport const b = () => a;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        cyclePolicy: 'soft',
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    const soft = runCheck(root, ['--json', '--strict-config']);
    expect(soft.status).toBe(0);
    const softJ = JSON.parse(soft.stdout);
    expect(softJ.ok).toBe(true);
    expect(
      (softJ.warnings || []).some((w: { ruleId: string }) => w.ruleId === 'CIRCULAR_DEPENDENCY')
    ).toBe(true);
    expect(softJ.violations.filter((v: { ruleId: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY')).toHaveLength(
      0
    );

    // Default strict: same tree without cyclePolicy soft must fail
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    const hard = runCheck(root, ['--json', '--strict-config']);
    expect(hard.status).not.toBe(0);
    const hardJ = JSON.parse(hard.stdout);
    expect(hardJ.ok).toBe(false);
    expect(
      hardJ.violations.filter((v: { ruleId: string }) => v.ruleId === 'CIRCULAR_DEPENDENCY').length
    ).toBeGreaterThan(0);
  });

  it('wireCodexMcp multi-project writes secondary table without force', () => {
    // Use non-temp paths: isTempOrUpgradeRoot treats /var/folders as temp and rewrites primary.
    const base = path.join(process.cwd(), '.tmp-p0p2-codex-multi');
    fs.rmSync(base, { recursive: true, force: true });
    const rootA = path.join(base, 'proj-a');
    const rootB = path.join(base, 'proj-b');
    const codexHome = path.join(base, 'codex-home');
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(rootA, 'ark.config.json'), '{}');
    fs.writeFileSync(path.join(rootB, 'ark.config.json'), '{}');
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const r1 = wireCodexMcp(rootA, true);
      expect(['written', 'updated']).toContain(r1.status);
      const r2 = wireCodexMcp(rootB, false);
      expect(r2.status).toBe('written-multi');
      expect(r2.primaryUnchanged).toBe(true);
      const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
      expect(toml).toContain('[mcp_servers.ark]');
      expect(toml).toMatch(/\[mcp_servers\.ark_proj-b_[a-f0-9]{8}\]/);
      expect(toml).toContain(path.resolve(rootA));
      expect(toml).toContain(path.resolve(rootB));
      // Primary still A (no silent last-wins steal)
      const primaryBlock = toml.match(/\[mcp_servers\.ark\][\s\S]*?(?=\n\[|$)/)?.[0] ?? '';
      expect(primaryBlock).toContain(path.resolve(rootA));
      expect(primaryBlock).not.toContain(path.resolve(rootB));
      // Idempotent secondary re-install (same disambiguated table)
      const r2b = wireCodexMcp(rootB, false);
      expect(r2b.status).toBe('written-multi');
      const toml2 = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
      expect([...toml2.matchAll(/\[mcp_servers\.ark_proj-b_[a-f0-9]{8}\]/g)].length).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('wireCodexMcp --force rebinds primary to B without leaving temp roots', () => {
    const base = path.join(process.cwd(), '.tmp-p0p2-codex-force');
    fs.rmSync(base, { recursive: true, force: true });
    const rootA = path.join(base, 'proj-a');
    const rootB = path.join(base, 'proj-b');
    const codexHome = path.join(base, 'codex-home');
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(rootA, 'ark.config.json'), '{}');
    fs.writeFileSync(path.join(rootB, 'ark.config.json'), '{}');
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      wireCodexMcp(rootA, true);
      wireCodexMcp(rootB, false);
      const forced = wireCodexMcp(rootB, true);
      expect(['updated', 'written']).toContain(forced.status);
      const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
      const primaryBlock = toml.match(/\[mcp_servers\.ark\][\s\S]*?(?=\n\[|$)/)?.[0] ?? '';
      expect(primaryBlock).toContain(path.resolve(rootB));
      expect(primaryBlock).toContain('arkgate-mcp');
      expect(primaryBlock).not.toMatch(/ark-upgrade-tmp|\/var\/folders\//);
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
