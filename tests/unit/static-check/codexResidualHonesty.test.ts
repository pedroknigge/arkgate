/**
 * Residual Codex honesty: skill parity, legacy prompts, CI fail-closed, write-path copy.
 * Drives shipped bin/lib helpers — no reimplementation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessCodexSkillParity,
  assessSkillCatalogParity,
  classifyArkCheckFlags,
  detectCiEnforcement,
  collectWeakestLinkGaps,
  detectCodexHomeGap,
  detectCodexRepoSkillGap,
  detectSkillGaps,
  detectWritePathCapabilities,
  installedSkillVersion,
  printSkillAndCodexGapHints,
  skillTemplateNames,
  SKILL_TOOL_TARGETS,
} from '../../../bin/lib/agent-gates.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

function mk(prefix = 'ark-residual-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

function writeAgents(root: string) {
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark\n\nUse `/ark-explore`.\n');
}

describe('classifyArkCheckFlags (fail-closed vs weak)', () => {
  it('treats --strict and --strict-merge and --require-gates as fail-closed', () => {
    expect(classifyArkCheckFlags('npx ark-check --strict --baseline x').hasFailClosedFlag).toBe(
      true
    );
    expect(classifyArkCheckFlags('arkgate-check --strict-merge').hasFailClosedFlag).toBe(true);
    expect(classifyArkCheckFlags('ark-check --require-gates').hasFailClosedFlag).toBe(true);
  });

  it('treats --strict-config alone as not fail-closed', () => {
    const f = classifyArkCheckFlags('npx ark-check --strict-config');
    expect(f.hasFailClosedFlag).toBe(false);
    expect(f.hasStrictConfigOnly).toBe(true);
  });

  it('treats bare ark-check as weak', () => {
    const f = classifyArkCheckFlags('npx ark-check --root . --config ark.config.json');
    expect(f.hasFailClosedFlag).toBe(false);
    expect(f.hasStrictConfigOnly).toBe(false);
  });
});

describe('detectCiEnforcement fail-closed', () => {
  it('workflow with --strict is failClosed', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: ark\non: push\njobs:\n  a:\n    steps:\n      - run: npx ark-check --strict\n'
    );
    const ci = detectCiEnforcement(root);
    expect(ci.hasArkCheckWorkflow).toBe(true);
    expect(ci.failClosed).toBe(true);
    expect(ci.hasFailClosedFlag).toBe(true);
  });

  it('workflow with only --strict-config is not failClosed and emits gap', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: ark\non: push\njobs:\n  a:\n    steps:\n      - run: npx ark-check --strict-config\n'
    );
    const ci = detectCiEnforcement(root);
    expect(ci.failClosed).toBe(false);
    expect(ci.hasStrictConfigOnly).toBe(true);
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: false });
    const gap = gaps.find((g) => g.id === 'enforcement-ci-not-fail-closed');
    expect(gap).toBeTruthy();
    expect(gap?.severity).toBe('warn');
    expect(gap?.fix).toMatch(/--strict-merge/);
  });

  it('workflow with bare ark-check is not failClosed', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark.yml'),
      'name: ark\non: push\njobs:\n  a:\n    steps:\n      - run: npx ark-check --root .\n'
    );
    const ci = detectCiEnforcement(root);
    expect(ci.failClosed).toBe(false);
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: false });
    expect(gaps.some((g) => g.id === 'enforcement-ci-not-fail-closed')).toBe(true);
  });

  it('workflow with --strict-merge has no fail-closed gap', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: ark\non: push\njobs:\n  a:\n    steps:\n      - run: npx ark-check --strict-merge\n'
    );
    const ci = detectCiEnforcement(root);
    expect(ci.failClosed).toBe(true);
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: false });
    expect(gaps.some((g) => g.id === 'enforcement-ci-not-fail-closed')).toBe(false);
  });
});

describe('Codex skill parity + legacy prompts', () => {
  it('maps Codex to .agents/skills SKILL.md catalog', () => {
    expect(SKILL_TOOL_TARGETS.codex('ark-explore')).toBe('.agents/skills/ark-explore/SKILL.md');
  });

  it('detects legacy-prompts-only home catalog via detectCodexHomeGap', () => {
    const root = mk();
    writeAgents(root);
    const codexHome = mk('ark-cxhome-');
    fs.mkdirSync(path.join(codexHome, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'prompts', 'ark-fix.md'), '---\nname: ark-fix\n---\n');
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const gap = detectCodexHomeGap(root);
      expect(gap).toBeTruthy();
      expect(gap?.legacyPromptsOnly).toBe(true);
      expect(gap?.missing).toBe(skillTemplateNames().length);
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
    }
  });

  it('detects stale home skill stamp', () => {
    const root = mk();
    writeAgents(root);
    const codexHome = mk('ark-cxstale-');
    const skillDir = path.join(codexHome, 'skills', 'ark-fix');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: ark-fix\narkVersion: 1.0.0\n---\nbody\n'
    );
    // install one skill only → missing rest + stale present
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const gap = detectCodexHomeGap(root);
      expect(gap).toBeTruthy();
      expect(gap?.stale).toBeGreaterThanOrEqual(1);
      expect(gap?.missing).toBeGreaterThanOrEqual(1);
      expect(installedSkillVersion(path.join(skillDir, 'SKILL.md'))).toBe('1.0.0');
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
    }
  });

  it('detects repo legacy prompts only for codex skill gaps', () => {
    const root = mk();
    writeAgents(root);
    fs.mkdirSync(path.join(root, '.codex', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(root, '.codex', 'prompts', 'ark-explore.md'), 'legacy\n');
    const gaps = detectSkillGaps(root);
    const codex = gaps.find((g) => g.tool === 'codex');
    expect(codex).toBeTruthy();
    expect(codex?.legacyPromptsOnly).toBe(true);
    expect(codex?.missing).toBe(skillTemplateNames().length);
  });

  it('assessCodexSkillParity separates repo and home', () => {
    const root = mk();
    writeAgents(root);
    fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
    // empty codex dir → repo in play, full missing
    const codexHome = mk('ark-cxpar-');
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const parity = assessCodexSkillParity(root);
      expect(parity).toBeTruthy();
      expect(parity?.repo.inPlay).toBe(true);
      expect(parity?.repoNeedsAttention).toBe(true);
      expect(parity?.home.inPlay).toBe(false);
      expect(parity?.homeNeedsAttention).toBe(false);
      const repoGap = detectCodexRepoSkillGap(root);
      expect(repoGap?.missing).toBe(skillTemplateNames().length);
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
    }
  });

  it('assessSkillCatalogParity counts present and stale', () => {
    const root = mk();
    const names = ['ark-a', 'ark-b'];
    fs.mkdirSync(path.join(root, 'ark-a'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark-a', 'SKILL.md'),
      '---\nname: ark-a\narkVersion: 1.0.0\n---\n'
    );
    const result = assessSkillCatalogParity(
      names,
      (n) => path.join(root, n, 'SKILL.md'),
      '3.0.4'
    );
    expect(result.presentCount).toBe(1);
    expect(result.missing).toBe(1);
    expect(result.stale).toBe(1);
    expect(result.ok).toBe(false);
  });
});

describe('multi-host skill hints (no exclusive Codex legacy)', () => {
  it('printSkillAndCodexGapHints reports Codex legacy AND other-host missing', () => {
    const root = mk();
    writeAgents(root);
    const lines: string[] = [];
    const color = {
      dim: (s: string) => `DIM:${s}`,
      yellow: (s: string) => `YEL:${s}`,
    };
    const skillCount = skillTemplateNames().length;
    const skillGaps = [
      { tool: 'codex', missing: skillCount, stale: 0, legacyPromptsOnly: true, hasLegacyPrompts: true },
      { tool: 'claude', missing: skillCount, stale: 0 },
    ];
    const prevLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printSkillAndCodexGapHints(root, {
        skillGaps,
        codexHomeGap: null,
        codexRepoSkillGap: null,
        codexSessionActive: false,
        color,
      });
    } finally {
      console.log = prevLog;
    }
    const joined = lines.join('\n');
    expect(joined).toMatch(/legacy flat \.codex\/prompts/i);
    expect(joined).toMatch(new RegExp(`${skillCount} /ark-\\* skill\\(s\\) not installed for claude`));
    expect(joined).not.toMatch(/not installed for codex, claude/);
  });

  it('runDoctor human: Codex legacy + Claude missing + deferred home (dim, not warn action)', () => {
    const root = mk('ark-doc-multi-');
    writeAgents(root);
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      })
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(root, '.codex', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(root, '.codex', 'prompts', 'ark-explore.md'), 'legacy\n');
    const codexHome = mk('ark-doc-home-');
    fs.mkdirSync(path.join(codexHome, 'skills', 'ark-fix'), { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'skills', 'ark-fix', 'SKILL.md'),
      '---\nname: ark-fix\narkVersion: 1.0.0\n---\n'
    );
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [path.join(root, 'src', 'a.ts')];
    const lines: string[] = [];
    const prevLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const prevHost = process.env.ARK_ACTIVE_HOST;
    const prevHome = process.env.CODEX_HOME;
    // Non-Codex session → home debt deferred
    process.env.ARK_ACTIVE_HOST = 'claude';
    process.env.CODEX_HOME = codexHome;
    try {
      runDoctor(root, config, files, [], [], false, {});
    } finally {
      console.log = prevLog;
      if (prevHost === undefined) delete process.env.ARK_ACTIVE_HOST;
      else process.env.ARK_ACTIVE_HOST = prevHost;
      if (prevHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prevHome;
    }
    const joined = lines.join('\n');
    expect(joined).toMatch(/legacy flat \.codex\/prompts only/i);
    expect(joined).toMatch(/missing \/ .* content-behind-package \/ark-\* skill\(s\) for claude/i);
    expect(joined).toMatch(/Codex home skills.*deferred/i);
    // Deferred line should not look like a yellow "!" warn mark path that adds Top action.
    // Top actions should not list codex-home when deferred (home refresh only when on Codex).
    const topIdx = joined.indexOf('Top actions');
    if (topIdx >= 0) {
      expect(joined.slice(topIdx)).not.toMatch(/--codex-home --force/);
    }
  });

  it('printSkillAndCodexGapHints dims deferred home gap (not yellow)', () => {
    const root = mk();
    const lines: string[] = [];
    const color = {
      dim: (s: string) => `DIM:${s}`,
      yellow: (s: string) => `YEL:${s}`,
    };
    const prevLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printSkillAndCodexGapHints(root, {
        skillGaps: [],
        codexHomeGap: {
          missing: 12,
          stale: 1,
          legacyPromptsOnly: false,
          presentCount: 1,
          expectedCount: 13,
          packageVersion: '3.0.4',
          skillsDir: '/tmp/skills',
        },
        codexRepoSkillGap: null,
        codexSessionActive: false,
        color,
      });
    } finally {
      console.log = prevLog;
    }
    expect(lines.some((l) => l.startsWith('DIM:') && /Codex home skill catalog/i.test(l))).toBe(
      true
    );
    expect(lines.some((l) => l.startsWith('YEL:') && /Codex home skill catalog/i.test(l))).toBe(
      false
    );
  });
});

describe('Codex write-path honesty', () => {
  it('mcp-only on codex mentions advisory and CI backstop', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    const codexHome = mk('ark-cxwp-home-');
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "${root}", "--config", "ark.config.json"]\n`
    );
    const prevHost = process.env.ARK_ACTIVE_HOST;
    const prevHome = process.env.CODEX_HOME;
    process.env.ARK_ACTIVE_HOST = 'codex';
    process.env.CODEX_HOME = codexHome;
    try {
      const wp = detectWritePathCapabilities(root);
      expect(wp.mode).toBe('mcp-only');
      expect(wp.gap?.message).toMatch(/not a hard boundary|not equivalent to Claude/i);
      expect(wp.gap?.message).toMatch(/strict-merge|CI/i);
      expect(wp.gap?.fix).toMatch(/strict-merge|status/i);
      expect(wp.capabilities['hard-write']).toBe(false);
    } finally {
      if (prevHost === undefined) delete process.env.ARK_ACTIVE_HOST;
      else process.env.ARK_ACTIVE_HOST = prevHost;
      if (prevHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prevHome;
    }
  });
});

describe('install --tools codex honesty + SKILL.md catalog', () => {
  it('temp project roots are classified so default-home MCP wire can be skipped', async () => {
    // Guard for install-migrate skipHomeWire: isTempOrUpgradeRoot(root) && usesDefaultCodexHome().
    // --codex-home must NOT force MCP rebind of a temp --root into real ~/.codex.
    const { isTempOrUpgradeRoot } = await import('../../../bin/lib/codex-home.mjs');
    const root = mk('ark-cx-temp-mcp-');
    expect(isTempOrUpgradeRoot(root)).toBe(true);
    expect(isTempOrUpgradeRoot('/Users/someone/real-project')).toBe(false);
  });

  it('writes .agents/skills and honesty copy; no flat prompts', () => {
    const root = mk('ark-cxinst-');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","private":true}\n');
    const codexHome = mk('ark-cxinst-home-');
    const out = execFileSync(
      process.execPath,
      [ARK_CHECK, '--install-agent-gates', '--root', root, '--tools', 'codex'],
      {
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOME: codexHome },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    expect(out).toMatch(/Codex write path \(honest\)/i);
    expect(out).toMatch(/not a hard boundary/i);
    expect(out).toMatch(/Not equivalent to Claude\/Grok/i);
    expect(out).toMatch(/strict-merge/i);
    expect(fs.existsSync(path.join(root, '.agents/skills/ark-explore/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.codex/prompts/ark-explore.md'))).toBe(false);
    expect(out).toMatch(/Skill catalog verified/i);
  });

  it('--codex-home writes $CODEX_HOME/skills/<name>/SKILL.md', () => {
    const root = mk('ark-cxhome-inst-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","private":true}\n');
    const codexHome = mk('ark-cxhome-dest-');
    execFileSync(
      process.execPath,
      [
        ARK_CHECK,
        '--install-agent-gates',
        '--root',
        root,
        '--tools',
        'claude',
        '--codex-home',
        '--skills-only',
        '--force',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOME: codexHome },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    expect(fs.existsSync(path.join(codexHome, 'skills', 'ark-explore', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(codexHome, 'prompts', 'ark-explore.md'))).toBe(false);
  });
});
