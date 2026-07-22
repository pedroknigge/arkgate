/**
 * Field-adopter DX contracts (PREDIAL evidence backlog):
 * 1) skill stale = content behind template (not version stamp alone)
 * 4) Y06 pure-layer opt-in nudge
 * 5) Codex legacy prompts advisory (catalog complete; multi-host with other missing)
 *
 * Item 2 (wouldWrite / nothing-to-apply) lives in z06ManagedUpgrade.test.ts.
 * Item 3 (writePath inventory vs invocation) lives in writePathDetect / z06EnforcementState.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assessSkillCatalogParity,
  detectSkillGaps,
  printSkillAndCodexGapHints,
  skillContentIdentity,
  skillContentMatchesTemplate,
  skillTemplateBodies,
  skillTemplateNames,
  stampSkill,
} from '../../../bin/lib/skill-install.mjs';
import { classifyManagedAsset, managedContentIdentity } from '../../../bin/lib/managed-upgrade.mjs';
import { computePureLayerOptInNudge } from '../../../bin/lib/golden-pattern.mjs';
import { renderHtmlReport } from '../../../bin/lib/html-report.mjs';

function mk(prefix = 'ark-field-dx-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('skill stale unifies with managed content identity', () => {
  it('content identity ignores arkVersion lag (doctor + upgrade agree)', () => {
    const bodies = skillTemplateBodies();
    const name = skillTemplateNames()[0];
    expect(name).toBeTruthy();
    const template = bodies[name];
    const lagging = stampSkill(template, '0.0.1');
    const target = stampSkill(template, '9.9.9');
    expect(skillContentMatchesTemplate(lagging, template)).toBe(true);
    // Single hasher: skillContentIdentity is the skill path for managedContentIdentity.
    expect(managedContentIdentity(lagging, 'skill')).toBe(skillContentIdentity(lagging));
    expect(managedContentIdentity(lagging, 'skill')).toBe(managedContentIdentity(target, 'skill'));
    expect(
      classifyManagedAsset({
        recorded: null,
        currentContent: lagging,
        targetContent: target,
        kind: 'skill',
      }).state
    ).toBe('current');

    const root = mk();
    const file = path.join(root, 'SKILL.md');
    fs.writeFileSync(file, lagging);
    const parity = assessSkillCatalogParity([name], () => file, '9.9.9', {
      templateBodies: { [name]: template },
    });
    expect(parity.stale).toBe(0);
    expect(parity.presentCount).toBe(1);
  });

  it('content divergence with old stamp is still stale', () => {
    const bodies = skillTemplateBodies();
    const name = skillTemplateNames()[0];
    const template = bodies[name];
    const diverged = `${stampSkill(template, '0.0.1')}\n# user drift\n`;
    expect(skillContentMatchesTemplate(diverged, template)).toBe(false);
    const root = mk();
    const file = path.join(root, 'SKILL.md');
    fs.writeFileSync(file, diverged);
    const parity = assessSkillCatalogParity([name], () => file, '9.9.9', {
      templateBodies: { [name]: template },
    });
    expect(parity.stale).toBe(1);
  });
});

describe('Y06 pure-layer opt-in nudge', () => {
  const baseConfig = {
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
  };

  it('emits nudge when golden names pure modules and no pure layer', () => {
    const nudge = computePureLayerOptInNudge(baseConfig, {
      ok: true,
      present: true,
      path: '.ark/golden-pattern.json',
      golden: {
        name: 'pure-domain',
        norm: 'Put pure domain rules under src/domain/',
        newCodeHome: 'src/domain/',
      },
    });
    expect(nudge).toMatchObject({ id: 'pure-layer-opt-in', advisory: true });
    expect(nudge?.message).toMatch(/pure: true/i);
  });

  it('stays silent when a pure layer already exists', () => {
    expect(
      computePureLayerOptInNudge(
        { layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], pure: true }] },
        {
          ok: true,
          present: true,
          path: '.ark/golden-pattern.json',
          golden: { name: 'pure-domain', norm: 'pure domain modules only' },
        }
      )
    ).toBeNull();
  });

  it('stays silent without a golden pattern', () => {
    expect(
      computePureLayerOptInNudge(baseConfig, {
        ok: true,
        present: false,
        path: '.ark/golden-pattern.json',
      })
    ).toBeNull();
  });

  it('stays silent when golden does not mention purity', () => {
    expect(
      computePureLayerOptInNudge(baseConfig, {
        ok: true,
        present: true,
        path: '.ark/golden-pattern.json',
        golden: {
          name: 'feature-slices',
          norm: 'One vertical slice per feature under src/features/',
        },
      })
    ).toBeNull();
  });
});

describe('Codex legacy prompts advisory when catalog is complete', () => {
  function seedCompleteCodexCatalog(root: string) {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark\nUse /ark-explore.\n');
    fs.mkdirSync(path.join(root, '.codex', 'prompts'), { recursive: true });
    const names = skillTemplateNames();
    const bodies = skillTemplateBodies();
    for (const name of names) {
      const skillDir = path.join(root, '.agents', 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), stampSkill(bodies[name], '3.8.1'));
      fs.writeFileSync(path.join(root, '.codex', 'prompts', `${name}.md`), 'legacy\n');
    }
    return names;
  }

  it('surfaces legacyAdvisory without missing/stale gap when SKILL catalog is full', () => {
    const root = mk('ark-codex-legacy-ok-');
    seedCompleteCodexCatalog(root);
    const gaps = detectSkillGaps(root);
    const codex = gaps.find((g) => g.tool === 'codex');
    expect(codex).toMatchObject({
      missing: 0,
      stale: 0,
      hasLegacyPrompts: true,
      catalogComplete: true,
      legacyAdvisory: true,
    });
    expect(codex?.legacyPromptsOnly).toBeUndefined();

    const lines: string[] = [];
    const prev = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printSkillAndCodexGapHints(root, {
        skillGaps: gaps,
        codexHomeGap: null,
        codexRepoSkillGap: null,
        codexSessionActive: false,
        color: { dim: (s: string) => s, yellow: (s: string) => s },
      });
    } finally {
      console.log = prev;
    }
    expect(lines.join('\n')).toMatch(/safe to delete/i);
    expect(lines.join('\n')).not.toMatch(/not installed for codex/i);
  });

  it('coexists with other-host missing: Claude missing + Codex legacyAdvisory', () => {
    const root = mk('ark-codex-legacy-multi-');
    seedCompleteCodexCatalog(root);
    // Claude host present without skills → real missing debt alongside Codex advisory.
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const gaps = detectSkillGaps(root);
    const claude = gaps.find((g) => g.tool === 'claude');
    const codex = gaps.find((g) => g.tool === 'codex');
    expect(claude?.missing).toBeGreaterThan(0);
    expect(codex).toMatchObject({
      missing: 0,
      stale: 0,
      legacyAdvisory: true,
      catalogComplete: true,
    });

    const lines: string[] = [];
    const prev = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printSkillAndCodexGapHints(root, {
        skillGaps: gaps,
        codexHomeGap: null,
        codexRepoSkillGap: null,
        codexSessionActive: false,
        color: { dim: (s: string) => s, yellow: (s: string) => s },
      });
    } finally {
      console.log = prev;
    }
    const joined = lines.join('\n');
    expect(joined).toMatch(/not installed for claude/i);
    expect(joined).toMatch(/safe to delete/i);
    expect(joined).not.toMatch(/skills current/i);
  });

  it('HTML report does not urge install for legacyAdvisory-only skillGaps', () => {
    const root = mk('ark-html-legacy-');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"field-dx-html"}\n');
    const html = renderHtmlReport({
      root,
      config: {
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      },
      coverage: {
        governed: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
        layers: [{ name: 'DomainModel', files: 1 }],
      },
      violations: [],
      ok: true,
      version: '0.0.0-test',
      skillGaps: [
        {
          tool: 'codex',
          missing: 0,
          stale: 0,
          hasLegacyPrompts: true,
          legacyAdvisory: true,
          catalogComplete: true,
        },
      ],
    });
    expect(html).toMatch(/Agent skills current for detected tools/);
    expect(html).toMatch(/safe to delete/i);
    expect(html).not.toMatch(/skill gap\(s\) — run ark upgrade/);
  });
});
