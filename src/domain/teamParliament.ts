/**
 * Team parliament — law vs feature (pure).
 *
 * The architecture file is a constitution. Product diffs must not amend it.
 * Stewards own loosen and baseline-grow. Ratchet identity is vs the branch
 * you merge to. Zero Node I/O.
 *
 * Canonical → bin/lib/team-parliament.mjs (generate:cli-pure).
 */

export const TEAM_PERSONAS = ['touch', 'contributor', 'agent', 'steward'] as const;
export type TeamPersona = (typeof TEAM_PERSONAS)[number];

export const CONTRACT_DIFF_KINDS = [
  'unchanged',
  'tighten',
  'loosen',
  'reclassify',
  'baseline-grow',
  'baseline-shrink',
] as const;
export type ContractDiffKind = (typeof CONTRACT_DIFF_KINDS)[number];

export type PolicyDeltaClass =
  | 'strengthening'
  | 'neutral'
  | 'judgment-required'
  | 'weakening';

export type ChangeSetClass = {
  lawPaths: string[];
  productPaths: string[];
  otherPaths: string[];
  mixed: boolean;
  hasLaw: boolean;
  hasProduct: boolean;
};

export type TeamGateReasonId =
  | 'ok'
  | 'mixed-law-and-product'
  | 'law-in-feature'
  | 'steward-only-loosen'
  | 'steward-only-baseline-grow';

export type TeamGateVerdict = {
  deny: boolean;
  reasonId: TeamGateReasonId;
  message: string;
  kinds: ContractDiffKind[];
};

export type TeamPersonaBudget = {
  persona: TeamPersona;
  scan: 'none' | 'changed' | 'changed+ungoverned' | 'full';
  contractDiff: boolean;
  denyContractEdit: boolean;
  denyLoosenUnlessSteward: boolean;
};

export type VsBaseFacts = {
  baseRef: string;
  pinLocal: string | null;
  pinBase: string | null;
  contractEqual: boolean;
  baselineGrew: boolean;
};

function posixRel(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

/** True for constitution files: ark.config.json, .ark-baseline.json, arkrules/*.json */
export function isLawRelativePath(relPath: string): boolean {
  const n = posixRel(relPath);
  if (n === 'ark.config.json' || n.endsWith('/ark.config.json')) return true;
  if (n === '.ark-baseline.json' || n.endsWith('/.ark-baseline.json')) return true;
  const base = n.split('/').pop() ?? n;
  if (base === 'ark.config.json' || base === '.ark-baseline.json') return true;
  if ((n.startsWith('arkrules/') || n.includes('/arkrules/')) && n.endsWith('.json')) {
    return true;
  }
  return false;
}

const PRODUCT_SOURCE = /\.(tsx?|jsx?|mjs|cjs)$/i;

/** Governable product source (not law, not tests-only heuristic — basename extension). */
export function isProductSourceRelativePath(relPath: string): boolean {
  const n = posixRel(relPath);
  if (!n || isLawRelativePath(n)) return false;
  const base = n.split('/').pop() ?? n;
  if (base.endsWith('.d.ts')) return false;
  return PRODUCT_SOURCE.test(base);
}

export function classifyChangeSet(paths: readonly string[]): ChangeSetClass {
  const lawPaths: string[] = [];
  const productPaths: string[] = [];
  const otherPaths: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const n = posixRel(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (isLawRelativePath(n)) lawPaths.push(n);
    else if (isProductSourceRelativePath(n)) productPaths.push(n);
    else otherPaths.push(n);
  }
  lawPaths.sort();
  productPaths.sort();
  otherPaths.sort();
  return {
    lawPaths,
    productPaths,
    otherPaths,
    mixed: lawPaths.length > 0 && productPaths.length > 0,
    hasLaw: lawPaths.length > 0,
    hasProduct: productPaths.length > 0,
  };
}

export function mapPolicyClassToKind(
  classification: PolicyDeltaClass | null | undefined
): ContractDiffKind | null {
  if (classification == null) return null;
  if (classification === 'strengthening') return 'tighten';
  if (classification === 'weakening') return 'loosen';
  if (classification === 'judgment-required') return 'reclassify';
  return 'unchanged';
}

export function classifyBaselineKeyDelta(
  baseKeys: readonly string[],
  candidateKeys: readonly string[]
): { grow: string[]; shrink: string[]; kinds: ContractDiffKind[] } {
  const base = new Set(baseKeys.filter(Boolean));
  const candidate = new Set(candidateKeys.filter(Boolean));
  const grow = [...candidate].filter((key) => !base.has(key)).sort();
  const shrink = [...base].filter((key) => !candidate.has(key)).sort();
  const kinds: ContractDiffKind[] = [];
  if (grow.length > 0) kinds.push('baseline-grow');
  if (shrink.length > 0) kinds.push('baseline-shrink');
  return { grow, shrink, kinds };
}

export function normalizeStewardId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^@/, '').toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** GitHub handle (login), not a display name. Spaces and emails are not handles. */
export function isGitHubHandle(value: string | null | undefined): boolean {
  const id = normalizeStewardId(value);
  if (!id || isAutomationAuthor(id) || id.includes(' ') || id.includes('@')) return false;
  return /^(?!-)[a-z0-9-]{1,39}(?<!-)$/.test(id);
}

export function isGitHubEmail(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (!email.includes('@') || email.includes(' ') || isAutomationAuthor(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** `123+login@users.noreply.github.com` or `login@users.noreply.github.com` → login. */
export function githubHandleFromEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const match = email.trim().match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
  if (!match) return null;
  return isGitHubHandle(match[1]) ? normalizeStewardId(match[1]) : null;
}

/**
 * Handle, GitHub noreply mail, or any email — same person when handle ↔ noreply.
 * Display names (`Pedro Knigge`) are not identity.
 */
export function canonicalStewardId(value: string | null | undefined): string | null {
  const fromNoreply = githubHandleFromEmail(value);
  if (fromNoreply) return fromNoreply;
  const id = normalizeStewardId(value);
  if (!id || isAutomationAuthor(id)) return null;
  if (isGitHubHandle(id) || isGitHubEmail(id)) return id;
  return null;
}

export function formatStewardMention(id: string): string {
  return id.includes('@') ? id : `@${id}`;
}

/**
 * Who is acting: GitHub handle or email.
 * Prefer explicit / GITHUB_ACTOR / ARK_STEWARD / email; git display names never win.
 */
export function resolveStewardHandle(input: {
  explicit?: string | null;
  githubActor?: string | null;
  arkSteward?: string | null;
  authorEmail?: string | null;
  gitName?: string | null;
}): string | null {
  for (const candidate of [
    input.explicit,
    input.githubActor,
    input.arkSteward,
    input.authorEmail,
    input.gitName,
  ]) {
    const id = canonicalStewardId(candidate);
    if (id) return id;
  }
  return null;
}

export function isSteward(
  author: string | null | undefined,
  stewards: readonly string[] | null | undefined
): boolean {
  const who = canonicalStewardId(author);
  if (!who || !Array.isArray(stewards) || stewards.length === 0) return false;
  return stewards.some((entry) => canonicalStewardId(entry) === who);
}

const BOT_STEWARD = /bot\b|\[bot\]|dependabot|renovate|github-actions|imgbot|codecov/i;

export function isAutomationAuthor(value: string | null | undefined): boolean {
  const id = normalizeStewardId(value);
  return !id || BOT_STEWARD.test(id);
}

/** @handles from a CODEOWNERS file body (comments and bare paths ignored). */
export function parseCodeownersHandles(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const found: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    for (const token of line.split(/\s+/)) {
      if (!token.startsWith('@')) continue;
      const id = normalizeStewardId(token);
      if (id && !isAutomationAuthor(id)) found.push(id);
    }
  }
  return [...new Set(found)];
}

export type StewardNudge = {
  advisory: true;
  notAScore: true;
  multiHand: boolean;
  needsStewards: boolean;
  /** Empty list past 30-day grace, or adopt age unknown — never Healthy ENFORCE. */
  emptyStewardsPastGrace: boolean;
  /** Existing list is behind CODEOWNERS or the author set grew. */
  drift: boolean;
  authorCount: number;
  stewardCount: number;
  proposed: string[];
  missingFromList: string[];
  source: 'codeowners' | 'git-authors' | 'none';
  ask: string;
  nextAction: string;
  /** Days since contract first-add, or null when the caller could not date it. Never clocked here. */
  adoptAgeDays: number | null;
};

/**
 * Empty list + several hands → propose owners.
 * Empty list + grace elapsed or unknown age → unfinished residual (not a new operating mode).
 * Existing list + CODEOWNERS ahead or author count grew → show the gap.
 * Never a layer / `valid` / `goal.met` input. Propose GitHub handles or emails — never git display names.
 */
export function suggestStewards(input: {
  existingStewards?: readonly string[] | null;
  gitAuthors?: readonly string[] | null;
  codeowners?: readonly string[] | null;
  /** Injected by Tooling. `null` = unknown; omit to keep legacy solo-empty quiet. */
  adoptAgeDays?: number | null;
}): StewardNudge {
  const existing = [
    ...new Set(
      (input.existingStewards ?? [])
        .map((id) => canonicalStewardId(id) ?? normalizeStewardId(id))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const fromOwners = [
    ...new Set(
      (input.codeowners ?? [])
        .map((id) => canonicalStewardId(id))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const uniqueGit = [
    ...new Set(
      (input.gitAuthors ?? [])
        .map((id) => normalizeStewardId(id))
        .filter((id): id is string => Boolean(id) && !isAutomationAuthor(id))
    ),
  ];
  const gitIds = [
    ...new Set(
      (input.gitAuthors ?? [])
        .map((id) => canonicalStewardId(id))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const authorCount = Math.max(uniqueGit.length, fromOwners.length);
  const multiHand = uniqueGit.length >= 2 || fromOwners.length >= 1;
  const age = input.adoptAgeDays;
  const emptyStewardsPastGrace =
    existing.length === 0 && (age === null || (typeof age === 'number' && age >= 30));
  const needsStewards = existing.length === 0 && (multiHand || emptyStewardsPastGrace);
  const missingFromList = fromOwners.filter((id) => !existing.includes(id));
  const teamGrew =
    existing.length > 0 &&
    fromOwners.length === 0 &&
    uniqueGit.length >= 2 &&
    uniqueGit.length > existing.length;
  const drift = existing.length > 0 && (missingFromList.length > 0 || teamGrew);
  const source: StewardNudge['source'] =
    fromOwners.length > 0 ? 'codeowners' : gitIds.length > 0 ? 'git-authors' : 'none';
  const proposed = needsStewards
    ? (fromOwners.length > 0 ? fromOwners : gitIds).slice(0, 6)
    : missingFromList.slice(0, 6);
  const named = proposed.map((id) => formatStewardMention(id)).join(', ');
  const listed = existing.map((id) => formatStewardMention(id)).join(', ');

  let ask = '';
  if (needsStewards && multiHand) {
    ask =
      proposed.length > 0
        ? `This repo has several people and no stewards. Add ${named} as stewards so only they can loosen the law or grow the baseline? Say yes, or name the GitHub handles or emails.`
        : 'This repo has several people and no stewards. Who owns ark.config.json? Name GitHub handles or emails for the stewards[] list.';
  } else if (needsStewards) {
    ask =
      'No stewards listed. Name GitHub handles or emails for `stewards[]`, or this stays Adapt-or-nudge — not a finished Enforce. `/ark-adopt` asks; it does not invent names.';
  } else if (missingFromList.length > 0) {
    ask = `CODEOWNERS is ahead of stewards[]: add ${missingFromList.map((id) => formatStewardMention(id)).join(', ')}? The current list stays unless you say yes or name the GitHub handles or emails.`;
  } else if (teamGrew) {
    ask = `This repo started with ${existing.length} steward(s) (${listed}) and now has ${uniqueGit.length} recent git authors. Who else owns the law? Name GitHub handles or emails, or say the list is still right.`;
  }

  const shouldAct = needsStewards || drift || emptyStewardsPastGrace;
  return {
    advisory: true,
    notAScore: true,
    multiHand,
    needsStewards,
    emptyStewardsPastGrace,
    drift,
    authorCount,
    stewardCount: existing.length,
    proposed,
    missingFromList,
    source,
    ask,
    nextAction: shouldAct
      ? '/ark-adopt (ask, then update stewards[] — do not invent names)'
      : '',
    adoptAgeDays: typeof age === 'number' ? age : null,
  };
}

export function personaCheckBudget(persona: TeamPersona): TeamPersonaBudget {
  if (persona === 'touch') {
    return {
      persona,
      scan: 'none',
      contractDiff: false,
      denyContractEdit: true,
      denyLoosenUnlessSteward: true,
    };
  }
  if (persona === 'contributor') {
    return {
      persona,
      scan: 'changed',
      contractDiff: false,
      denyContractEdit: true,
      denyLoosenUnlessSteward: true,
    };
  }
  if (persona === 'agent') {
    return {
      persona,
      scan: 'changed+ungoverned',
      contractDiff: false,
      denyContractEdit: true,
      denyLoosenUnlessSteward: true,
    };
  }
  return {
    persona: 'steward',
    scan: 'full',
    contractDiff: true,
    denyContractEdit: false,
    denyLoosenUnlessSteward: true,
  };
}

export function isTeamPersona(value: string | null | undefined): value is TeamPersona {
  return TEAM_PERSONAS.includes(value as TeamPersona);
}

/**
 * Gate for a diff vs the merge base.
 * Contract session still forbids mixing law with product source.
 * Loosen / baseline-grow require --contract-session even when stewards is empty.
 * A non-empty list additionally requires a matching listed author.
 */
export function evaluateTeamGate(input: {
  changeSet: ChangeSetClass;
  contractSession: boolean;
  policyKind?: ContractDiffKind | null;
  baselineGrowCount?: number;
  stewards?: readonly string[] | null;
  author?: string | null;
}): TeamGateVerdict {
  const kinds: ContractDiffKind[] = [];
  if (input.policyKind && input.policyKind !== 'unchanged') kinds.push(input.policyKind);
  if ((input.baselineGrowCount ?? 0) > 0) kinds.push('baseline-grow');

  const { changeSet } = input;
  if (changeSet.mixed) {
    return {
      deny: true,
      reasonId: 'mixed-law-and-product',
      message:
        'This change mixes the constitution with product files. Split the PR, or run a steward --contract-session that touches only ark.config / arkrules / .ark-baseline.json.',
      kinds,
    };
  }
  if (changeSet.hasLaw && !input.contractSession) {
    return {
      deny: true,
      reasonId: 'law-in-feature',
      message:
        'This feature change edits the constitution. Move ark.config / arkrules / .ark-baseline.json to a steward --contract-session PR.',
      kinds,
    };
  }

  const stewards = input.stewards ?? [];
  const grow = (input.baselineGrowCount ?? 0) > 0;
  const loosen = input.policyKind === 'loosen';
  if ((loosen || grow) && !input.contractSession) {
    return {
      deny: true,
      reasonId: loosen ? 'steward-only-loosen' : 'steward-only-baseline-grow',
      message: loosen
        ? 'Weakening the contract requires --contract-session (and --policy-ack bound to both hashes).'
        : 'Growing the baseline requires --contract-session. Freeze in a law-only PR.',
      kinds,
    };
  }
  if (stewards.length > 0 && (loosen || grow) && !isSteward(input.author, stewards)) {
    return {
      deny: true,
      reasonId: loosen ? 'steward-only-loosen' : 'steward-only-baseline-grow',
      message: loosen
        ? 'Loosening the contract is steward-only. Listed stewards may pass --contract-session with --author matching stewards[].'
        : 'Growing the baseline is steward-only. Freeze new debt in a contract-session PR owned by a steward.',
      kinds,
    };
  }

  return { deny: false, reasonId: 'ok', message: '', kinds };
}

export function formatVsBaseLine(facts: VsBaseFacts): string {
  const pinEqual =
    facts.pinLocal != null && facts.pinBase != null && facts.pinLocal === facts.pinBase;
  const pinBit =
    facts.pinLocal == null && facts.pinBase == null
      ? 'pin unknown'
      : pinEqual
        ? 'pin equal'
        : `pin local ${facts.pinLocal ?? '?'} ≠ pin of base ${facts.pinBase ?? '?'}`;
  const contractBit = facts.contractEqual ? 'contract equal' : 'contract local ≠ contract of base';
  const baselineBit = facts.baselineGrew ? 'baseline local grew' : 'baseline did not grow';
  return `vs ${facts.baseRef}: ${pinBit} · ${contractBit} · ${baselineBit}`;
}

/** Parse v1 `violations[]` or v2 `records` object into a sorted unique key list. */
export function baselineKeysFromDocument(raw: unknown): string[] {
  if (raw == null || typeof raw !== 'object') return [];
  const doc = raw as { violations?: unknown; records?: unknown };
  const fromArray = Array.isArray(doc.violations)
    ? doc.violations.filter((key): key is string => typeof key === 'string' && key.length > 0)
    : [];
  const fromRecords =
    doc.records && typeof doc.records === 'object' && !Array.isArray(doc.records)
      ? Object.keys(doc.records).filter((key) => key.length > 0)
      : [];
  return [...new Set([...fromArray, ...fromRecords])].sort();
}

export function baselineRecordsDocument(keys: readonly string[], note: string): {
  version: 2;
  note: string;
  violations: string[];
  records: Record<string, { id: string }>;
} {
  const violations = [...new Set(keys.filter(Boolean))].sort();
  const records: Record<string, { id: string }> = {};
  for (const key of violations) records[key] = { id: key };
  return { version: 2, note, violations, records };
}
