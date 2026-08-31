#!/usr/bin/env node
/**
 * ACS05 — emit Agent Skills–compatible layout from flat skill templates.
 *
 * Canonical (author + Ark install source):
 *   templates/skills/<name>.md
 *
 * Derived (ecosystem package for `npx skills add`):
 *   templates/agent-skills/<name>/SKILL.md
 *
 * Content is 1:1 (LF-normalized). No new skill names — inventory must match the
 * frozen Domain catalog (ARK_SKILL_NAMES).
 *
 * Usage:
 *   node scripts/generate-agent-skills.mjs
 *   node scripts/generate-agent-skills.mjs --check
 *   npm run generate:agent-skills
 *   npm run check:agent-skills
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  AGENT_SKILL_ENTRY_FILENAME,
  AGENT_SKILLS_PACKAGE_RELATIVE_ROOT,
  ARK_SKILL_NAMES,
  FLAT_SKILL_TEMPLATES_RELATIVE_ROOT,
  normalizeSkillContent,
  validateAgentSkillsPackage,
} from '../bin/lib/agent-skills-package.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const require = createRequire(import.meta.url);

const flatDir = path.join(root, FLAT_SKILL_TEMPLATES_RELATIVE_ROOT);
const packageDir = path.join(root, AGENT_SKILLS_PACKAGE_RELATIVE_ROOT);

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8');
}

function listFlatTemplates() {
  let entries;
  try {
    entries = fs.readdirSync(flatDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Flat skill templates directory missing (${flatDir}): ${message}`);
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.md$/.test(entry.name))
    .map((entry) => path.basename(entry.name, '.md'))
    .sort();
}

function ensureGeneratedPure() {
  const purePath = path.join(root, 'bin/lib/agent-skills-package.mjs');
  if (!fs.existsSync(purePath)) {
    throw new Error(
      'bin/lib/agent-skills-package.mjs missing. Run: npm run generate:cli-pure'
    );
  }
}

function packageReadme() {
  const pkg = require('../package.json');
  const version = typeof pkg.version === 'string' ? pkg.version : 'unknown';
  const repo =
    typeof pkg.repository === 'object' && pkg.repository && typeof pkg.repository.url === 'string'
      ? pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
      : 'https://github.com/pedroknigge/arkgate';
  const names = ARK_SKILL_NAMES.map((n) => `- \`${n}\``).join('\n');
  return `# ArkGate Agent Skills package

> **Generated layout (ACS05).** Do not edit SKILL.md files here by hand.
> Author skill bodies in \`templates/skills/<name>.md\`, then run
> \`npm run generate:agent-skills\`. Drift: \`npm run check:agent-skills\`.

This directory is the **Agent Skills–compatible** packaging of the same **13**
\`/ark-*\` skills shipped as flat templates for Ark install. **No new skill names.**

Package version when last generated context: **arkgate@${version}**
Schema: agent-skills package contract \`1.0\`

## Skills (frozen catalog)

${names}

## Install — Ark (host write path + skill catalogs)

Preferred when you also want hooks/MCP/CI wiring:

\`\`\`bash
npx ark-check --install-agent-gates --skills-only --force
# or full host install (hooks + MCP + skills):
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode
\`\`\`

## Install — skills ecosystem (\`npx skills\`)

From this package directory (checkout or \`node_modules/arkgate\`):

\`\`\`bash
# Local path (after npm install arkgate, or from a git checkout)
npx skills add ./templates/agent-skills
# or:
npx skills add ./node_modules/arkgate/templates/agent-skills

# GitHub tree (Agent Skills package root)
npx skills add ${repo}/tree/main/templates/agent-skills

# List without installing
npx skills add ./templates/agent-skills --list
\`\`\`

Skills are **process** depth (host judgment + routing). They are **not** enforcement.
Enforcement is \`ark-check\` / host write hooks / required CI (\`--strict-merge\`).

See [docs/agent-guide.md](../../docs/agent-guide.md#install-skills-ark-and-ecosystem).
`;
}

function main() {
  ensureGeneratedPure();
  const flatNames = listFlatTemplates();
  const entries = [];

  for (const name of flatNames) {
    const flatPath = path.join(flatDir, `${name}.md`);
    const content = readUtf8(flatPath);
    entries.push({
      name,
      content,
      flatTemplateContent: content,
    });
  }

  const validation = validateAgentSkillsPackage(entries);
  if (!validation.ok) {
    console.error('✖ Agent Skills package validation failed:');
    for (const issue of validation.issues) {
      console.error(`  - [${issue.code}] ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Expected set must be exactly the freeze list (already validated) and match disk flats.
  if (flatNames.length !== ARK_SKILL_NAMES.length) {
    console.error(
      `✖ Flat template count ${flatNames.length} !== frozen catalog ${ARK_SKILL_NAMES.length}.`
    );
    process.exitCode = 1;
    return;
  }

  let drift = false;
  const expectedFiles = new Set();

  for (const name of ARK_SKILL_NAMES) {
    const sourcePath = path.join(flatDir, `${name}.md`);
    const targetDir = path.join(packageDir, name);
    const targetPath = path.join(targetDir, AGENT_SKILL_ENTRY_FILENAME);
    const source = normalizeSkillContent(readUtf8(sourcePath));
    expectedFiles.add(path.join(name, AGENT_SKILL_ENTRY_FILENAME));

    if (check) {
      if (!fs.existsSync(targetPath)) {
        console.error(`✖ Missing ${path.relative(root, targetPath)}. Run npm run generate:agent-skills.`);
        drift = true;
        continue;
      }
      const existing = normalizeSkillContent(readUtf8(targetPath));
      if (existing !== source) {
        console.error(`✖ Stale ${path.relative(root, targetPath)}. Run npm run generate:agent-skills.`);
        drift = true;
      } else {
        console.log(`✔ ${path.relative(root, targetPath)} matches flat template.`);
      }
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    // Write LF-normalized content so Git and pack consumers share one identity.
    fs.writeFileSync(targetPath, source.endsWith('\n') ? source : `${source}\n`);
    console.log(`Generated ${path.relative(root, targetPath)}.`);
  }

  const readmePath = path.join(packageDir, 'README.md');
  const readme = packageReadme();
  if (check) {
    if (!fs.existsSync(readmePath)) {
      console.error(`✖ Missing ${path.relative(root, readmePath)}. Run npm run generate:agent-skills.`);
      drift = true;
    } else {
      // README embeds package version — allow version line drift only if structure ok.
      // Require presence of key install markers rather than full byte equality on version churn.
      const current = readUtf8(readmePath);
      const required = [
        'Agent Skills–compatible',
        'npx skills add',
        'templates/agent-skills',
        '--install-agent-gates',
        'No new skill names',
      ];
      for (const marker of required) {
        if (!current.includes(marker)) {
          console.error(
            `✖ ${path.relative(root, readmePath)} missing marker "${marker}". Run npm run generate:agent-skills.`
          );
          drift = true;
        }
      }
      if (!drift || current.includes('npx skills add')) {
        // still report ok when only version string differs; re-check markers only
        if (required.every((m) => current.includes(m))) {
          console.log(`✔ ${path.relative(root, readmePath)} has ecosystem install docs.`);
        }
      }
    }

    // Extra SKILL.md dirs under package root (not in freeze) are errors.
    if (fs.existsSync(packageDir)) {
      for (const entry of fs.readdirSync(packageDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!ARK_SKILL_NAMES.includes(entry.name)) {
          console.error(
            `✖ Extra skill directory templates/agent-skills/${entry.name} (not in frozen catalog).`
          );
          drift = true;
        }
        const skillMd = path.join(packageDir, entry.name, AGENT_SKILL_ENTRY_FILENAME);
        if (!fs.existsSync(skillMd)) {
          console.error(`✖ ${path.relative(root, skillMd)} missing.`);
          drift = true;
        }
      }
    }
  } else {
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(readmePath, readme);
    console.log(`Generated ${path.relative(root, readmePath)}.`);

    // Remove stray skill dirs not in the freeze list.
    for (const entry of fs.readdirSync(packageDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!ARK_SKILL_NAMES.includes(entry.name)) {
        fs.rmSync(path.join(packageDir, entry.name), { recursive: true, force: true });
        console.log(`Removed extra directory templates/agent-skills/${entry.name}.`);
      }
    }
  }

  const linkDrift = ensureDogfoodSkillLinks(check);
  if (check && (drift || linkDrift)) {
    process.exitCode = 1;
    return;
  }

  if (check) {
    console.log(
      `✔ Agent Skills package: ${ARK_SKILL_NAMES.length} skills under ${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/.`
    );
  } else {
    console.log(
      `Generated Agent Skills package (${ARK_SKILL_NAMES.length} skills) at ${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/.`
    );
  }
}

/**
 * This library git tree dogfoods the same catalog Antigravity/Codex/Cursor read
 * (`.agents/skills`) and the Grok adapter (`.grok/skills`). Relative symlinks so
 * `templates/skills` remains the authoring source; generate after a body edit.
 */
const DOGFOOD_SKILL_LINKS = [
  {
    dir: '.agents/skills',
    targetFor: (name) => `../../${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/${name}`,
  },
  {
    dir: '.grok/skills',
    targetFor: (name) => `../../.agents/skills/${name}`,
  },
];

function readRelativeLink(linkPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return null;
    return fs.readlinkSync(linkPath).replaceAll('\\', '/');
  } catch {
    return null;
  }
}

function ensureDogfoodSkillLinks(check) {
  let drift = false;
  for (const { dir, targetFor } of DOGFOOD_SKILL_LINKS) {
    const absDir = path.join(root, dir);
    if (!check) fs.mkdirSync(absDir, { recursive: true });
    for (const name of ARK_SKILL_NAMES) {
      const linkPath = path.join(absDir, name);
      const expected = targetFor(name);
      const relative = path.relative(root, linkPath);
      if (check) {
        const current = readRelativeLink(linkPath);
        if (current !== expected) {
          console.error(
            `✖ ${relative} should be a relative symlink to ${expected}. Run npm run generate:agent-skills.`
          );
          drift = true;
        } else {
          console.log(`✔ ${relative} → ${expected}`);
        }
        continue;
      }
      const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false });
      if (existing) {
        if (
          existing.isSymbolicLink() &&
          fs.readlinkSync(linkPath).replaceAll('\\', '/') === expected
        ) {
          continue;
        }
        fs.rmSync(linkPath, { recursive: true, force: true });
      }
      fs.symlinkSync(expected, linkPath);
      console.log(`Linked ${relative} → ${expected}`);
    }
  }
  return drift;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
