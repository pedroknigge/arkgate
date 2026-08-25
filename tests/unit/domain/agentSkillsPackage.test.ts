/**
 * ACS05 — Agent Skills packaging (Domain pure + on-disk layout parity).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  AGENT_SKILL_ENTRY_FILENAME,
  AGENT_SKILLS_PACKAGE_RELATIVE_ROOT,
  ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION,
  ARK_SKILL_NAMES,
  ARK_SKILL_NAME_COUNT,
  FLAT_SKILL_TEMPLATES_RELATIVE_ROOT,
  agentSkillEntryRelativePath,
  agentSkillPackageFileRelativePath,
  flatSkillTemplateFileRelativePath,
  isArkSkillName,
  isValidAgentSkillName,
  normalizeSkillContent,
  parseSkillDescriptionVersion,
  parseSkillDocument,
  stampSkillDescription,
  stripSkillDescriptionVersion,
  skillDescriptionVersionPrefix,
  validateAgentSkillDocument,
  validateAgentSkillsPackage,
} from '../../../src/domain/agentSkillsPackage';
import {
  ARK_SKILL_NAMES as CLI_NAMES,
  ARK_SKILL_NAME_COUNT as CLI_COUNT,
  ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION as CLI_SCHEMA,
  isValidAgentSkillName as cliIsValidName,
  parseSkillDocument as cliParse,
  validateAgentSkillsPackage as cliValidatePackage,
} from '../../../bin/lib/agent-skills-package.mjs';
import {
  ARK_SKILL_NAMES as GATE_NAMES,
  validateAgentSkillsPackage as gateValidatePackage,
} from '../../../src/gate';

const require = createRequire(import.meta.url);
/** Vitest runs with cwd = package root. */
const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function listFlatSkillNames(): string[] {
  const dir = path.join(ROOT, FLAT_SKILL_TEMPLATES_RELATIVE_ROOT);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /^[a-z0-9-]+\.md$/.test(e.name))
    .map((e) => path.basename(e.name, '.md'))
    .sort();
}

function loadPackageEntries() {
  return ARK_SKILL_NAMES.map((name) => {
    const flat = read(flatSkillTemplateFileRelativePath(name));
    const skill = read(agentSkillPackageFileRelativePath(name));
    return { name, content: skill, flatTemplateContent: flat };
  });
}

describe('agentSkillsPackage (Domain — ACS05)', () => {
  it('exposes schema 1.0 and a frozen catalog of exactly 13 skill names', () => {
    expect(ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION).toBe('1.0');
    expect(ARK_SKILL_NAME_COUNT).toBe(13);
    expect(ARK_SKILL_NAMES).toHaveLength(13);
    expect([...ARK_SKILL_NAMES]).toEqual([...ARK_SKILL_NAMES].sort());
    for (const name of ARK_SKILL_NAMES) {
      expect(isValidAgentSkillName(name)).toBe(true);
      expect(isArkSkillName(name)).toBe(true);
    }
  });

  it('rejects invalid Agent Skills names', () => {
    expect(isValidAgentSkillName('')).toBe(false);
    expect(isValidAgentSkillName('Ark-Place')).toBe(false);
    expect(isValidAgentSkillName('-ark')).toBe(false);
    expect(isValidAgentSkillName('ark-')).toBe(false);
    expect(isValidAgentSkillName('ark--place')).toBe(false);
    expect(isValidAgentSkillName('a'.repeat(65))).toBe(false);
    expect(isValidAgentSkillName('ark_place')).toBe(false);
    expect(isArkSkillName('ark-new-skill')).toBe(false);
  });

  it('parses YAML frontmatter name/description from skill documents', () => {
    const sample = `---
name: ark-place
description: "Where does new code go?"
---

# body
`;
    const parsed = parseSkillDocument(sample);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter?.name).toBe('ark-place');
    expect(parsed.frontmatter?.description).toBe('Where does new code go?');
    expect(parsed.body.trim().startsWith('# body')).toBe(true);
  });

  it('stamps a visible arkgate@version prefix on skill descriptions (picker, not YAML-only)', () => {
    expect(skillDescriptionVersionPrefix('4.7.1')).toBe('arkgate@4.7.1. ');
    expect(parseSkillDescriptionVersion('arkgate@4.7.1. Session 0 — mark the path.')).toBe(
      '4.7.1'
    );
    expect(parseSkillDescriptionVersion('Session 0 — mark the path.')).toBeNull();
    const stamped = stampSkillDescription('Session 0 — mark the path.', '4.7.1');
    expect(stamped).toBe('arkgate@4.7.1. Session 0 — mark the path.');
    expect(stampSkillDescription(stamped, '4.7.1')).toBe(stamped);
    expect(stampSkillDescription(stamped, '4.8.0')).toBe(
      'arkgate@4.8.0. Session 0 — mark the path.'
    );
    expect(stripSkillDescriptionVersion(stamped)).toBe('Session 0 — mark the path.');
    expect(stampSkillDescription(stamped, '')).toBe('Session 0 — mark the path.');
  });

  it('validates a single skill document (name matches directory, description required)', () => {
    const ok = validateAgentSkillDocument({
      directoryName: 'ark-place',
      content: `---
name: ark-place
description: Place new code under the contract.
---

# /ark-place
`,
    });
    expect(ok).toEqual([]);

    const mismatch = validateAgentSkillDocument({
      directoryName: 'ark-place',
      content: `---
name: ark-fix
description: Wrong name for directory.
---

# body
`,
    });
    expect(mismatch.some((i) => i.code === 'NAME_DIRECTORY_MISMATCH')).toBe(true);

    const unknown = validateAgentSkillDocument({
      directoryName: 'ark-novel',
      content: `---
name: ark-novel
description: Not in the freeze list.
---

# body
`,
    });
    expect(unknown.some((i) => i.code === 'UNKNOWN_SKILL_NAME')).toBe(true);
  });

  it('package validator accepts full frozen inventory and rejects extras/missing', () => {
    const entries = ARK_SKILL_NAMES.map((name) => ({
      name,
      content: `---
name: ${name}
description: Skill ${name} for ArkGate architecture co-pilot. Use when the user invokes /${name}.
---

# /${name}
`,
    }));
    const ok = validateAgentSkillsPackage(entries);
    expect(ok.ok).toBe(true);
    expect(ok.presentCount).toBe(13);

    const missing = validateAgentSkillsPackage(entries.slice(0, 12));
    expect(missing.ok).toBe(false);
    expect(missing.issues.some((i) => i.code === 'MISSING_SKILL')).toBe(true);

    const extra = validateAgentSkillsPackage([
      ...entries,
      {
        name: 'ark-extra',
        content: `---
name: ark-extra
description: Extra skill that must not ship.
---

# body
`,
      },
    ]);
    expect(extra.ok).toBe(false);
    expect(
      extra.issues.some((i) => i.code === 'EXTRA_SKILL' || i.code === 'UNKNOWN_SKILL_NAME')
    ).toBe(true);
  });

  it('flat templates and Agent Skills layout are 1:1 for all 13 skills', () => {
    const flatNames = listFlatSkillNames();
    expect(flatNames).toEqual([...ARK_SKILL_NAMES]);

    const entries = loadPackageEntries();
    const result = validateAgentSkillsPackage(entries);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);

    for (const name of ARK_SKILL_NAMES) {
      const flat = normalizeSkillContent(read(flatSkillTemplateFileRelativePath(name)));
      const skill = normalizeSkillContent(read(agentSkillPackageFileRelativePath(name)));
      expect(skill).toBe(flat);
      expect(agentSkillEntryRelativePath(name)).toBe(`${name}/${AGENT_SKILL_ENTRY_FILENAME}`);
      expect(agentSkillPackageFileRelativePath(name)).toBe(
        `${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/${name}/${AGENT_SKILL_ENTRY_FILENAME}`
      );
    }
  });

  it('agent-skills package README documents both Ark install and npx skills ecosystem install', () => {
    const readme = read(`${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/README.md`);
    expect(readme).toContain('npx skills add');
    expect(readme).toContain('templates/agent-skills');
    expect(readme).toContain('--install-agent-gates');
    expect(readme).toContain('No new skill names');
    for (const name of ARK_SKILL_NAMES) {
      expect(readme).toContain(name);
    }
  });

  it('CLI pure mirror and root gate exports stay in parity with Domain', () => {
    expect(CLI_SCHEMA).toBe(ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION);
    expect(CLI_COUNT).toBe(ARK_SKILL_NAME_COUNT);
    expect([...CLI_NAMES]).toEqual([...ARK_SKILL_NAMES]);
    expect([...GATE_NAMES]).toEqual([...ARK_SKILL_NAMES]);
    expect(cliIsValidName('ark-place')).toBe(true);
    expect(cliIsValidName('Bad')).toBe(false);

    const sample = `---
name: ark-loop
description: Drive plan to zero.
---

# loop
`;
    expect(cliParse(sample).frontmatter?.name).toBe('ark-loop');
    expect(parseSkillDocument(sample).frontmatter?.name).toBe('ark-loop');

    const entries = ARK_SKILL_NAMES.map((name) => ({
      name,
      content: `---
name: ${name}
description: Skill ${name}.
---

# /${name}
`,
    }));
    expect(cliValidatePackage(entries).ok).toBe(true);
    expect(gateValidatePackage(entries).ok).toBe(true);
  });

  it('npm package files array ships templates/ (includes agent-skills layout)', () => {
    const pkg = require('../../../package.json') as { files: string[] };
    expect(pkg.files).toContain('templates');
    // Layout must exist on disk so packed tarball includes it under templates/.
    expect(fs.existsSync(path.join(ROOT, AGENT_SKILLS_PACKAGE_RELATIVE_ROOT))).toBe(true);
    expect(
      fs.existsSync(
        path.join(ROOT, agentSkillPackageFileRelativePath('ark-autopilot'))
      )
    ).toBe(true);
  });
});
