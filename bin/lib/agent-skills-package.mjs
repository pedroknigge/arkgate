/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/agentSkillsPackage.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/agent-skills-package.mjs). Zero Node I/O.
 */

export const ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION = '1.0';
/**
 * Relative package-root path of the Agent Skills–compatible skill package.
 * Install via skills ecosystem: `npx skills add <path-to-this-dir>`.
 */
export const AGENT_SKILLS_PACKAGE_RELATIVE_ROOT = 'templates/agent-skills';
/** Relative package-root path of flat skill templates (Ark install source). */
export const FLAT_SKILL_TEMPLATES_RELATIVE_ROOT = 'templates/skills';
/** Required entry filename inside each skill directory (Agent Skills standard). */
export const AGENT_SKILL_ENTRY_FILENAME = 'SKILL.md';
/**
 * Closed skill-name freeze (ACS / ADR skill freeze). Exactly these 13 names ship.
 * Sorted alphabetically for deterministic inventory diffs.
 */
export const ARK_SKILL_NAMES = Object.freeze([
    'ark-adopt',
    'ark-architect',
    'ark-autopilot',
    'ark-contract',
    'ark-coverage',
    'ark-explain',
    'ark-explore',
    'ark-fix',
    'ark-loop',
    'ark-place',
    'ark-runtime',
    'ark-think',
    'ark-upgrade',
]);
/** Count of frozen skill names (must stay 13 until a ROADMAP item lifts the freeze). */
export const ARK_SKILL_NAME_COUNT = ARK_SKILL_NAMES.length;
const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Agent Skills `name` field rules (agentskills.io):
 * - 1–64 characters
 * - lowercase a–z, digits, hyphens only
 * - no leading/trailing hyphen; no consecutive hyphens
 */
export function isValidAgentSkillName(name) {
    if (typeof name !== 'string' || name.length < 1 || name.length > 64)
        return false;
    return AGENT_SKILL_NAME_PATTERN.test(name);
}
/** True when `name` is one of the frozen 13 Ark skill names. */
export function isArkSkillName(name) {
    return ARK_SKILL_NAMES.includes(name);
}
/**
 * Parse a skill markdown document with optional YAML frontmatter.
 * Supports the simple `key: value` / `key: "quoted"` form used by Ark templates
 * (no nested maps, no multi-line YAML).
 */
export function parseSkillDocument(content) {
    const text = String(content ?? '').replace(/^\uFEFF/, '');
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    if (lines[0] !== '---') {
        return { hasFrontmatter: false, frontmatter: null, body: text };
    }
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx === -1) {
        return { hasFrontmatter: false, frontmatter: null, body: text };
    }
    const fields = {};
    for (let i = 1; i < closeIdx; i += 1) {
        const line = lines[i] ?? '';
        if (line.trim() === '' || line.trimStart().startsWith('#'))
            continue;
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!match)
            continue;
        const key = match[1];
        let value = match[2] ?? '';
        if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
            (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
            value = value.slice(1, -1);
        }
        fields[key] = value;
    }
    const body = lines.slice(closeIdx + 1).join(newline);
    const name = typeof fields.name === 'string' && fields.name.length > 0 ? fields.name : null;
    const description = typeof fields.description === 'string' && fields.description.length > 0
        ? fields.description
        : null;
    const license = typeof fields.license === 'string' && fields.license.length > 0 ? fields.license : null;
    return {
        hasFrontmatter: true,
        frontmatter: { fields, name, description, license },
        body,
    };
}
/**
 * Validate one skill document against the Agent Skills spec (+ optional Ark freeze).
 */
export function validateAgentSkillDocument(input) {
    const requireArk = input.requireArkSkillName !== false;
    const requireBody = input.requireBody !== false;
    const issues = [];
    const directoryName = String(input.directoryName ?? '');
    const parsed = parseSkillDocument(input.content);
    if (!parsed.hasFrontmatter || !parsed.frontmatter) {
        issues.push({
            code: 'MISSING_FRONTMATTER',
            message: `Skill "${directoryName}" is missing YAML frontmatter fences.`,
            skillName: directoryName || undefined,
        });
        return issues;
    }
    const { name, description } = parsed.frontmatter;
    const skillRef = name ?? (directoryName || undefined);
    if (!name || !isValidAgentSkillName(name)) {
        issues.push({
            code: 'INVALID_NAME',
            message: `Skill name "${name ?? ''}" is invalid (Agent Skills: 1–64 chars, [a-z0-9-], no leading/trailing/consecutive hyphens).`,
            skillName: skillRef,
        });
    }
    else if (name !== directoryName) {
        issues.push({
            code: 'NAME_DIRECTORY_MISMATCH',
            message: `Frontmatter name "${name}" must match directory name "${directoryName}".`,
            skillName: name,
        });
    }
    else if (requireArk && !isArkSkillName(name)) {
        issues.push({
            code: 'UNKNOWN_SKILL_NAME',
            message: `Skill name "${name}" is not in the frozen Ark 13-skill catalog (no new skill names).`,
            skillName: name,
        });
    }
    if (!description) {
        issues.push({
            code: 'MISSING_DESCRIPTION',
            message: `Skill "${directoryName}" is missing a non-empty description.`,
            skillName: skillRef,
        });
    }
    else if (description.length > 1024) {
        issues.push({
            code: 'DESCRIPTION_TOO_LONG',
            message: `Skill "${directoryName}" description exceeds 1024 characters (${description.length}).`,
            skillName: skillRef,
        });
    }
    if (requireBody && parsed.body.trim().length === 0) {
        issues.push({
            code: 'EMPTY_BODY',
            message: `Skill "${directoryName}" has an empty instruction body.`,
            skillName: skillRef,
        });
    }
    return issues;
}
/**
 * Validate a full Agent Skills package inventory against the frozen 13-name catalog.
 * Detects missing, extra, duplicate, invalid, and (when supplied) flat-template drift.
 */
export function validateAgentSkillsPackage(entries) {
    const issues = [];
    const seen = new Set();
    const names = [];
    for (const entry of entries) {
        const name = String(entry.name ?? '');
        if (seen.has(name)) {
            issues.push({
                code: 'DUPLICATE_SKILL',
                message: `Duplicate skill entry "${name}".`,
                skillName: name,
            });
            continue;
        }
        seen.add(name);
        names.push(name);
        issues.push(...validateAgentSkillDocument({
            directoryName: name,
            content: entry.content,
            requireArkSkillName: true,
            requireBody: true,
        }));
        if (entry.flatTemplateContent != null &&
            normalizeSkillContent(entry.content) !== normalizeSkillContent(entry.flatTemplateContent)) {
            issues.push({
                code: 'CONTENT_MISMATCH',
                message: `Agent Skills SKILL.md for "${name}" does not match flat template templates/skills/${name}.md.`,
                skillName: name,
            });
        }
    }
    for (const expected of ARK_SKILL_NAMES) {
        if (!seen.has(expected)) {
            issues.push({
                code: 'MISSING_SKILL',
                message: `Missing frozen skill "${expected}" from Agent Skills package.`,
                skillName: expected,
            });
        }
    }
    for (const name of names) {
        if (!isArkSkillName(name)) {
            // UNKNOWN_SKILL_NAME may already be reported per-document; still mark package-level extra.
            if (!issues.some((i) => i.code === 'UNKNOWN_SKILL_NAME' && i.skillName === name)) {
                issues.push({
                    code: 'EXTRA_SKILL',
                    message: `Extra skill "${name}" is not in the frozen Ark 13-skill catalog.`,
                    skillName: name,
                });
            }
            else {
                issues.push({
                    code: 'EXTRA_SKILL',
                    message: `Extra skill "${name}" is not in the frozen Ark 13-skill catalog.`,
                    skillName: name,
                });
            }
        }
    }
    names.sort();
    return {
        ok: issues.length === 0,
        issues,
        names,
        expectedCount: ARK_SKILL_NAME_COUNT,
        presentCount: names.length,
    };
}
/**
 * Visible package stamp at the start of Agent Skills `description`.
 * Hosts show `description` in the picker; `arkVersion:` in YAML is invisible there.
 * Example: `arkgate@4.7.1. Session 0 — mark the Ark path.`
 */
export const ARK_SKILL_DESCRIPTION_VERSION_PATTERN = /^arkgate@(\S+)\.\s/;
/** Prefix written at install time (`arkgate@<version>. `). */
export function skillDescriptionVersionPrefix(version) {
    const v = String(version ?? '').trim();
    return v ? `arkgate@${v}. ` : '';
}
/** Drop a leading `arkgate@<version>. ` stamp; other text is unchanged. */
export function stripSkillDescriptionVersion(description) {
    return String(description ?? '').replace(ARK_SKILL_DESCRIPTION_VERSION_PATTERN, '');
}
/** Version inside a stamped description, or null when the prefix is absent. */
export function parseSkillDescriptionVersion(description) {
    const match = String(description ?? '').match(ARK_SKILL_DESCRIPTION_VERSION_PATTERN);
    return match?.[1] ?? null;
}
/**
 * Idempotent: replace an existing `arkgate@…` prefix or add one.
 * Empty `version` strips the prefix (authoring templates stay unversioned).
 */
export function stampSkillDescription(description, version) {
    const rest = stripSkillDescriptionVersion(description);
    const v = typeof version === 'string' ? version.trim() : '';
    return v ? `${skillDescriptionVersionPrefix(v)}${rest}` : rest;
}
/**
 * Normalize skill file content for identity compare (LF newlines, strip BOM).
 * Does not strip or rewrite frontmatter — Agent Skills export is 1:1 with flat templates.
 */
export function normalizeSkillContent(content) {
    return String(content ?? '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n');
}
/**
 * Relative path of one skill entry inside the Agent Skills package root.
 * Example: `ark-place/SKILL.md`
 */
export function agentSkillEntryRelativePath(skillName) {
    return `${skillName}/${AGENT_SKILL_ENTRY_FILENAME}`;
}
/**
 * Relative path from package root for one Agent Skills entry.
 * Example: `templates/agent-skills/ark-place/SKILL.md`
 */
export function agentSkillPackageFileRelativePath(skillName) {
    return `${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/${agentSkillEntryRelativePath(skillName)}`;
}
/**
 * Relative path from package root for one flat template.
 * Example: `templates/skills/ark-place.md`
 */
export function flatSkillTemplateFileRelativePath(skillName) {
    return `${FLAT_SKILL_TEMPLATES_RELATIVE_ROOT}/${skillName}.md`;
}
