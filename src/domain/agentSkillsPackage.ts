/**
 * Agent Skills packaging contract (ACS05, opened by issue #216 / ADR 0036).
 *
 * Closed catalog of shipped `/ark-*` skill names and pure validation for Agent
 * Skills–compatible layout (`<name>/SKILL.md` with YAML frontmatter).
 *
 * The set must exercise 100% of product capacity (Layers + ArkRules + ArkRun +
 * ArkOrder + north star Contener · Guiar · Ordenar). First-class doors do the
 * work; leftover names stay as one-release redirect stubs. Add a name only with
 * a live ROADMAP item. Packaging is distribution only; enforcement remains
 * ark-check / hooks / CI, never skills alone.
 *
 * Canonical authoring source remains flat `templates/skills/<name>.md`. The
 * Agent Skills layout is the generated twin at `templates/agent-skills/<name>/SKILL.md`.
 *
 * Zero Node I/O. Optional CLI surface: generated `bin/lib/agent-skills-package.mjs`.
 *
 * @see docs/adr/0036-skill-catalog-product-capacity.md
 * @see docs/plans/agent-contract-surface-4.3/README.md
 * @see https://agentskills.io/specification
 */

export const ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION = '1.0' as const;

/**
 * Relative package-root path of the Agent Skills–compatible skill package.
 * Install via skills ecosystem: `npx skills add <path-to-this-dir>`.
 */
export const AGENT_SKILLS_PACKAGE_RELATIVE_ROOT = 'templates/agent-skills' as const;

/** Relative package-root path of flat skill templates (Ark install source). */
export const FLAT_SKILL_TEMPLATES_RELATIVE_ROOT = 'templates/skills' as const;

/** Required entry filename inside each skill directory (Agent Skills standard). */
export const AGENT_SKILL_ENTRY_FILENAME = 'SKILL.md' as const;

/**
 * North-star filter for first-class doors. Not a score. Not enforcement.
 * Skills speak these so an agent picks the right sibling.
 */
export const ARK_SKILL_NORTH_STAR = Object.freeze(['Contener', 'Guiar', 'Ordenar'] as const);

export type ArkSkillNorthStar = (typeof ARK_SKILL_NORTH_STAR)[number];

/**
 * First-class doors. Each must have crisp when / not when / handoff.
 * Sorted alphabetically.
 */
export const ARK_FIRST_CLASS_SKILL_NAMES = Object.freeze([
  'ark-adopt',
  'ark-autopilot',
  'ark-coverage',
  'ark-explain',
  'ark-explore',
  'ark-order',
  'ark-place',
  'ark-runtime',
  'ark-upgrade',
] as const);

export type ArkFirstClassSkillName = (typeof ARK_FIRST_CLASS_SKILL_NAMES)[number];

/**
 * One-release redirect stubs. Muscle memory / old docs still resolve.
 * Values are first-class doors. Capability surface must stay zero-loss.
 */
export const ARK_SKILL_STUB_REDIRECTS = Object.freeze({
  'ark-architect': 'ark-adopt',
  'ark-contract': 'ark-adopt',
  'ark-fix': 'ark-autopilot',
  'ark-loop': 'ark-autopilot',
  'ark-think': 'ark-explore',
} as const);

export type ArkSkillStubName = keyof typeof ARK_SKILL_STUB_REDIRECTS;

/**
 * Product surface → first-class doors that exercise it.
 * Standing check: every surface has at least one first-class door whose
 * body mentions that surface. Table keys must match
 * {@link ARK_SKILL_REQUIRED_SURFACES}.
 */
export const ARK_SKILL_CAPACITY = Object.freeze({
  Layers: ['ark-adopt', 'ark-place', 'ark-explore', 'ark-autopilot', 'ark-coverage', 'ark-explain'],
  ArkRules: ['ark-adopt', 'ark-explore', 'ark-autopilot'],
  ArkRun: ['ark-adopt', 'ark-runtime', 'ark-place', 'ark-autopilot'],
  ArkOrder: ['ark-adopt', 'ark-order', 'ark-place', 'ark-autopilot'],
  Contener: ['ark-adopt', 'ark-place', 'ark-upgrade'],
  Guiar: ['ark-explore', 'ark-autopilot', 'ark-explain', 'ark-coverage', 'ark-runtime'],
  Ordenar: ['ark-order'],
} as const);

export type ArkSkillCapacitySurface = keyof typeof ARK_SKILL_CAPACITY;

/**
 * Closed product + north-star surfaces the skill *set* must exercise.
 * Independent of {@link ARK_SKILL_CAPACITY} so deleting a table key fails closed.
 */
export const ARK_SKILL_REQUIRED_SURFACES = Object.freeze([
  'Layers',
  'ArkRules',
  'ArkRun',
  'ArkOrder',
  'Contener',
  'Guiar',
  'Ordenar',
] as const);

export type ArkSkillRequiredSurface = (typeof ARK_SKILL_REQUIRED_SURFACES)[number];

/** Named first-class door that must stay on these surfaces (no leftover substitute). */
export const ARK_SKILL_CAPACITY_DEDICATED_DOORS = Object.freeze({
  ArkRun: 'ark-runtime',
  ArkOrder: 'ark-order',
  Ordenar: 'ark-order',
} as const);

export type ArkSkillCapacityDedicatedSurface = keyof typeof ARK_SKILL_CAPACITY_DEDICATED_DOORS;

const NORTH_STAR_PHRASE = 'Contener · Guiar · Ordenar';
const FORBIDDEN_ORDER_FREEZE = 'Do not invent `/ark-order`';

/**
 * Closed shipped catalog (first-class + one-release stubs).
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
  'ark-order',
  'ark-place',
  'ark-runtime',
  'ark-think',
  'ark-upgrade',
] as const);

export type ArkSkillName = (typeof ARK_SKILL_NAMES)[number];

/** Count of shipped skill names (first-class + stubs). */
export const ARK_SKILL_NAME_COUNT = ARK_SKILL_NAMES.length;

const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Agent Skills `name` field rules (agentskills.io):
 * - 1–64 characters
 * - lowercase a–z, digits, hyphens only
 * - no leading/trailing hyphen; no consecutive hyphens
 */
export function isValidAgentSkillName(name: string): boolean {
  if (typeof name !== 'string' || name.length < 1 || name.length > 64) return false;
  return AGENT_SKILL_NAME_PATTERN.test(name);
}

/** True when `name` is in the closed shipped catalog. */
export function isArkSkillName(name: string): name is ArkSkillName {
  return (ARK_SKILL_NAMES as readonly string[]).includes(name);
}

/** True when `name` is a first-class door (not a redirect stub). */
export function isFirstClassArkSkillName(name: string): name is ArkFirstClassSkillName {
  return (ARK_FIRST_CLASS_SKILL_NAMES as readonly string[]).includes(name);
}

/** First-class door a leftover name redirects to, or null. */
export function arkSkillStubRedirect(name: string): ArkFirstClassSkillName | null {
  if (!(name in ARK_SKILL_STUB_REDIRECTS)) return null;
  return ARK_SKILL_STUB_REDIRECTS[name as ArkSkillStubName];
}

export type ParsedSkillFrontmatter = {
  /** Raw frontmatter keys (string values; nested YAML not supported). */
  fields: Readonly<Record<string, string>>;
  name: string | null;
  description: string | null;
  license: string | null;
};

export type ParseSkillDocumentResult = {
  /** True when opening `---` / closing `---` frontmatter fences were found. */
  hasFrontmatter: boolean;
  frontmatter: ParsedSkillFrontmatter | null;
  /** Markdown body after the frontmatter block (may be empty). */
  body: string;
};

/**
 * Parse a skill markdown document with optional YAML frontmatter.
 * Supports the simple `key: value` / `key: "quoted"` form used by Ark templates
 * (no nested maps, no multi-line YAML).
 */
export function parseSkillDocument(content: string): ParseSkillDocumentResult {
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
  const fields: Record<string, string> = {};
  for (let i = 1; i < closeIdx; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  const body = lines.slice(closeIdx + 1).join(newline);
  const name = typeof fields.name === 'string' && fields.name.length > 0 ? fields.name : null;
  const description =
    typeof fields.description === 'string' && fields.description.length > 0
      ? fields.description
      : null;
  const license =
    typeof fields.license === 'string' && fields.license.length > 0 ? fields.license : null;
  return {
    hasFrontmatter: true,
    frontmatter: { fields, name, description, license },
    body,
  };
}

export type AgentSkillValidationIssue = {
  code:
    | 'MISSING_FRONTMATTER'
    | 'INVALID_NAME'
    | 'NAME_DIRECTORY_MISMATCH'
    | 'MISSING_DESCRIPTION'
    | 'DESCRIPTION_TOO_LONG'
    | 'EMPTY_BODY'
    | 'UNKNOWN_SKILL_NAME'
    | 'DUPLICATE_SKILL'
    | 'MISSING_SKILL'
    | 'EXTRA_SKILL'
    | 'CONTENT_MISMATCH';
  message: string;
  skillName?: string;
};

export type ValidateAgentSkillDocumentInput = {
  /** Parent directory name (must match frontmatter `name`). */
  directoryName: string;
  /** Full SKILL.md / template content. */
  content: string;
  /**
   * When true (default), require `directoryName` / frontmatter name to be in
   * {@link ARK_SKILL_NAMES}. Set false only for generic Agent Skills checks.
   */
  requireArkSkillName?: boolean;
  /** When true (default), require a non-empty markdown body after frontmatter. */
  requireBody?: boolean;
};

/**
 * Validate one skill document against the Agent Skills spec (+ optional Ark freeze).
 */
export function validateAgentSkillDocument(
  input: ValidateAgentSkillDocumentInput
): AgentSkillValidationIssue[] {
  const requireArk = input.requireArkSkillName !== false;
  const requireBody = input.requireBody !== false;
  const issues: AgentSkillValidationIssue[] = [];
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
  } else if (name !== directoryName) {
    issues.push({
      code: 'NAME_DIRECTORY_MISMATCH',
      message: `Frontmatter name "${name}" must match directory name "${directoryName}".`,
      skillName: name,
    });
  } else if (requireArk && !isArkSkillName(name)) {
    issues.push({
      code: 'UNKNOWN_SKILL_NAME',
      message: `Skill name "${name}" is not in the closed Ark skill catalog (ARK_SKILL_NAMES).`,
      skillName: name,
    });
  }

  if (!description) {
    issues.push({
      code: 'MISSING_DESCRIPTION',
      message: `Skill "${directoryName}" is missing a non-empty description.`,
      skillName: skillRef,
    });
  } else if (description.length > 1024) {
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

export type AgentSkillPackageEntry = {
  /** Skill directory / frozen name. */
  name: string;
  /** Full SKILL.md content for the Agent Skills layout. */
  content: string;
  /** Optional flat-template content for byte-identity parity checks. */
  flatTemplateContent?: string | null;
};

export type ValidateAgentSkillsPackageResult = {
  ok: boolean;
  issues: AgentSkillValidationIssue[];
  /** Sorted names present in the package input. */
  names: string[];
  expectedCount: number;
  presentCount: number;
};

/**
 * Validate a full Agent Skills package inventory against the closed catalog.
 * Detects missing, extra, duplicate, invalid, and (when supplied) flat-template drift.
 */
export function validateAgentSkillsPackage(
  entries: readonly AgentSkillPackageEntry[]
): ValidateAgentSkillsPackageResult {
  const issues: AgentSkillValidationIssue[] = [];
  const seen = new Set<string>();
  const names: string[] = [];

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

    issues.push(
      ...validateAgentSkillDocument({
        directoryName: name,
        content: entry.content,
        requireArkSkillName: true,
        requireBody: true,
      })
    );

    if (
      entry.flatTemplateContent != null &&
      normalizeSkillContent(entry.content) !== normalizeSkillContent(entry.flatTemplateContent)
    ) {
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
        message: `Missing catalog skill "${expected}" from Agent Skills package.`,
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
          message: `Extra skill "${name}" is not in the closed Ark skill catalog.`,
          skillName: name,
        });
      } else {
        issues.push({
          code: 'EXTRA_SKILL',
          message: `Extra skill "${name}" is not in the closed Ark skill catalog.`,
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

export type SkillProductCapacityIssueCode =
  | 'CAPACITY_SURFACE_MISSING'
  | 'CAPACITY_SURFACE_UNMAPPED'
  | 'CAPACITY_DOOR_NOT_FIRST_CLASS'
  | 'CAPACITY_BODY_GAP'
  | 'CAPACITY_DEDICATED_DOOR'
  | 'CAPACITY_ROUTING_GAP'
  | 'CAPACITY_HUB_GAP';

export type SkillProductCapacityIssue = {
  code: SkillProductCapacityIssueCode;
  message: string;
  surface?: string;
  skillName?: string;
  hub?: string;
};

export type ValidateSkillProductCapacityInput = {
  /** Skill name → full markdown (flat template or Agent Skills SKILL.md). */
  skills: Readonly<Record<string, string>>;
  /** Optional living hubs (AGENTS.md, product-voice, agent-guide, …). */
  hubs?: Readonly<Record<string, string>>;
};

export type ValidateSkillProductCapacityResult = {
  ok: boolean;
  issues: SkillProductCapacityIssue[];
};

function pushCapacityIssue(
  issues: SkillProductCapacityIssue[],
  issue: SkillProductCapacityIssue
): void {
  issues.push(issue);
}

function skillMentionsSurface(body: string, surface: string): boolean {
  return body.includes(surface);
}

/**
 * Observe skill bodies (and optional hubs) against the closed product surfaces.
 * Inventory/layout stay on {@link validateAgentSkillsPackage}. This is the
 * fail-closed tooth so a plane cannot silently drop out of the skill set.
 */
export function validateSkillProductCapacity(
  input: ValidateSkillProductCapacityInput
): ValidateSkillProductCapacityResult {
  const issues: SkillProductCapacityIssue[] = [];
  const skills = input.skills ?? {};
  const tableKeys = Object.keys(ARK_SKILL_CAPACITY);

  for (const surface of ARK_SKILL_REQUIRED_SURFACES) {
    if (!tableKeys.includes(surface)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_SURFACE_MISSING',
        surface,
        message:
          `The capacity table dropped ${surface}. Skills must keep covering ` +
          `Layers, ArkRules, ArkRun, ArkOrder plus Contener · Guiar · Ordenar. ` +
          `Put ${surface} back on ARK_SKILL_CAPACITY.`,
      });
    }
  }

  for (const key of tableKeys) {
    if (!(ARK_SKILL_REQUIRED_SURFACES as readonly string[]).includes(key)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_SURFACE_UNMAPPED',
        surface: key,
        message:
          `The capacity table lists ${key}, which is not a product surface. ` +
          `Keep the table to Layers, ArkRules, ArkRun, ArkOrder and Contener · Guiar · Ordenar.`,
      });
    }
  }

  for (const surface of ARK_SKILL_REQUIRED_SURFACES) {
    const doors = ARK_SKILL_CAPACITY[surface as ArkSkillCapacitySurface] as
      | readonly string[]
      | undefined;
    if (!doors || doors.length === 0) continue;

    for (const door of doors) {
      if (!isFirstClassArkSkillName(door)) {
        pushCapacityIssue(issues, {
          code: 'CAPACITY_DOOR_NOT_FIRST_CLASS',
          surface,
          skillName: door,
          message:
            `/${door} is listed for ${surface} but is not a first-class door. ` +
            `Leftover names are shortcuts. Point ${surface} at a first-class skill.`,
        });
      }
    }

    const covering = doors.filter((door) => {
      const body = skills[door];
      return typeof body === 'string' && skillMentionsSurface(body, surface);
    });
    if (covering.length === 0) {
      const hint =
        surface === 'ArkOrder' || surface === 'Ordenar'
          ? ' — usually /ark-order'
          : surface === 'ArkRun'
            ? ' — usually /ark-runtime'
            : '';
      pushCapacityIssue(issues, {
        code: 'CAPACITY_BODY_GAP',
        surface,
        message:
          `Skills no longer cover ${surface}. The product has four parts ` +
          `(Layers, ArkRules, ArkRun, ArkOrder) plus Contener · Guiar · Ordenar. ` +
          `Put ${surface} back in a first-class skill${hint} so agents still know when to use it.`,
      });
    }
  }

  for (const [surface, door] of Object.entries(ARK_SKILL_CAPACITY_DEDICATED_DOORS)) {
    const doors = ARK_SKILL_CAPACITY[surface as ArkSkillCapacitySurface] as
      | readonly string[]
      | undefined;
    if (!doors?.includes(door) || !isFirstClassArkSkillName(door)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_DEDICATED_DOOR',
        surface,
        skillName: door,
        message:
          `/${door} is the first-class door for ${surface}. Keep it on that surface. ` +
          `Leftover names like /ark-think are shortcuts, not a replacement.`,
      });
      continue;
    }
    const body = skills[door];
    if (typeof body !== 'string' || !skillMentionsSurface(body, surface)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_DEDICATED_DOOR',
        surface,
        skillName: door,
        message:
          `/${door} no longer talks about ${surface}. That door is how agents reach ` +
          `this part of the product. Put ${surface} back in the skill body.`,
      });
    }
  }

  for (const name of ARK_FIRST_CLASS_SKILL_NAMES) {
    const body = skills[name];
    if (typeof body !== 'string') {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_ROUTING_GAP',
        skillName: name,
        message:
          `/${name} is a first-class door but has no skill body in this check. ` +
          `Ship the template so agents know when to use it.`,
      });
      continue;
    }
    const hasNorthStar = body.includes(NORTH_STAR_PHRASE);
    const hasWhen = /When \/ not when|\*\*When:\*\*/.test(body);
    const hasNotWhen = /Not when|Do \*\*not\*\* use|Prefer instead/.test(body);
    const hasHandoff = /Handoff|hand off|`\/ark-/i.test(body);
    if (!hasNorthStar || !hasWhen || !hasNotWhen || !hasHandoff) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_ROUTING_GAP',
        skillName: name,
        message:
          `/${name} is missing when / not when / handoff or Contener · Guiar · Ordenar. ` +
          `First-class skills must say when to use them and which sibling to call next.`,
      });
    }
    if (body.includes(FORBIDDEN_ORDER_FREEZE)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_ROUTING_GAP',
        skillName: name,
        message:
          `/${name} still says not to invent /ark-order. That freeze is outdated — ` +
          `/ark-order is a first-class door.`,
      });
    }
  }

  const hubs = input.hubs ?? {};
  for (const [hub, text] of Object.entries(hubs)) {
    const body = String(text ?? '');
    if (!body.includes('/ark-order')) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_HUB_GAP',
        hub,
        message:
          `${hub} no longer names /ark-order. Host instructions must stay at 100% of ` +
          `the product. Add /ark-order back, or you left the order plane behind.`,
      });
    }
    if (!body.includes(NORTH_STAR_PHRASE)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_HUB_GAP',
        hub,
        message:
          `${hub} no longer says Contener · Guiar · Ordenar. Keep that filter in the ` +
          `living docs so agents pick the right sibling.`,
      });
    }
    if (body.includes(FORBIDDEN_ORDER_FREEZE)) {
      pushCapacityIssue(issues, {
        code: 'CAPACITY_HUB_GAP',
        hub,
        message:
          `${hub} still says not to invent /ark-order. That freeze is outdated — ` +
          `/ark-order is a first-class door.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Visible package stamp at the start of Agent Skills `description`.
 * Hosts show `description` in the picker; `arkVersion:` in YAML is invisible there.
 * Example: `arkgate@4.7.1. Session 0 — mark the Ark path.`
 */
export const ARK_SKILL_DESCRIPTION_VERSION_PATTERN = /^arkgate@(\S+)\.\s/;

/** Prefix written at install time (`arkgate@<version>. `). */
export function skillDescriptionVersionPrefix(version: string): string {
  const v = String(version ?? '').trim();
  return v ? `arkgate@${v}. ` : '';
}

/** Drop a leading `arkgate@<version>. ` stamp; other text is unchanged. */
export function stripSkillDescriptionVersion(description: string): string {
  return String(description ?? '').replace(ARK_SKILL_DESCRIPTION_VERSION_PATTERN, '');
}

/** Version inside a stamped description, or null when the prefix is absent. */
export function parseSkillDescriptionVersion(description: string): string | null {
  const match = String(description ?? '').match(ARK_SKILL_DESCRIPTION_VERSION_PATTERN);
  return match?.[1] ?? null;
}

/**
 * Idempotent: replace an existing `arkgate@…` prefix or add one.
 * Empty `version` strips the prefix (authoring templates stay unversioned).
 */
export function stampSkillDescription(description: string, version: string | null | undefined): string {
  const rest = stripSkillDescriptionVersion(description);
  const v = typeof version === 'string' ? version.trim() : '';
  return v ? `${skillDescriptionVersionPrefix(v)}${rest}` : rest;
}

/**
 * Normalize skill file content for identity compare (LF newlines, strip BOM).
 * Does not strip or rewrite frontmatter — Agent Skills export is 1:1 with flat templates.
 */
export function normalizeSkillContent(content: string): string {
  return String(content ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
}

/**
 * Relative path of one skill entry inside the Agent Skills package root.
 * Example: `ark-place/SKILL.md`
 */
export function agentSkillEntryRelativePath(skillName: string): string {
  return `${skillName}/${AGENT_SKILL_ENTRY_FILENAME}`;
}

/**
 * Relative path from package root for one Agent Skills entry.
 * Example: `templates/agent-skills/ark-place/SKILL.md`
 */
export function agentSkillPackageFileRelativePath(skillName: string): string {
  return `${AGENT_SKILLS_PACKAGE_RELATIVE_ROOT}/${agentSkillEntryRelativePath(skillName)}`;
}

/**
 * Relative path from package root for one flat template.
 * Example: `templates/skills/ark-place.md`
 */
export function flatSkillTemplateFileRelativePath(skillName: string): string {
  return `${FLAT_SKILL_TEMPLATES_RELATIVE_ROOT}/${skillName}.md`;
}
