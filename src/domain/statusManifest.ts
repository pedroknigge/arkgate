/**
 * Public status manifest (ACS03).
 *
 * One machine-readable session/project snapshot for agents: project identity
 * binding, honest write-path activation, last-check summary, ArkRules residual
 * counts, and a primary next action. Binary facts only — never a numeric score,
 * never an LLM verdict, never a prompt.
 *
 * **Canonical** for `ark status --json`, MCP `ark_status`, and schema export.
 * Tooling gathers filesystem evidence; this module only assembles pure facts.
 *
 * @see docs/plans/agent-contract-surface-4.3/README.md
 */

import type { ProjectBinding, ProjectExpectation } from './projectIdentity';

export const ARK_STATUS_MANIFEST_SCHEMA_VERSION = '1.0' as const;
export const ARK_STATUS_MANIFEST_SCHEMA_URL =
  'https://unpkg.com/arkgate@4/schemas/ark.status-manifest.schema.json';

/** Write-path honesty class for agents (not a host capability claim by itself). */
export type StatusWritePathClass = 'hard' | 'advisory' | 'unavailable';

/** Last architecture check verdict when evidence exists. */
export type StatusCheckVerdict = 'pass' | 'fail' | 'incomplete' | null;

export type StatusProjectIdentitySlice = {
  projectId: string | null;
  resolvedRoot: string;
  resolvedConfigPath: string | null;
  /** Binding status: matched | unverified | mismatch (same vocabulary as MCP). */
  binding: ProjectBinding['status'];
  authoritative: boolean;
  code?: ProjectBinding['code'];
  message?: string;
};

export type StatusActivationSlice = {
  writePath: StatusWritePathClass;
  host: string | null;
  honestLabel: string;
};

export type StatusLastCheckSlice = {
  at: string | null;
  verdict: StatusCheckVerdict;
  activeViolations: number | null;
  frozenResidual: number | null;
};

export type StatusRulesSlice = {
  arkRulesLoaded: boolean;
  inventoried: number | null;
  underContract: number | null;
  frozenResidual: number | null;
};

export type StatusNextAction = {
  id: string;
  summary: string;
};

/**
 * Optional thin improvement-compass projection on status (additive).
 * Full lenses live on doctor JSON; status carries residual ids only when supplied.
 * Always notAScore; never a gate input.
 */
export type StatusImprovementCompassSlice = {
  schemaVersion: '1.0';
  notAScore: true;
  topResidual: string[];
};

export type StatusManifest = {
  schemaVersion: typeof ARK_STATUS_MANIFEST_SCHEMA_VERSION;
  arkgateVersion: string;
  projectIdentity: StatusProjectIdentitySlice;
  activation: StatusActivationSlice;
  lastCheck: StatusLastCheckSlice;
  rules: StatusRulesSlice;
  nextAction: StatusNextAction;
  /** Optional; omit when Tooling did not supply a projection. */
  improvementCompass?: StatusImprovementCompassSlice;
};

/**
 * Pure facts supplied by Tooling after path canonicalization and I/O.
 * Domain never opens files or prompts.
 */
export type StatusManifestFacts = {
  arkgateVersion: string;
  resolvedRoot: string;
  resolvedConfigPath?: string | null;
  projectId?: string | null;
  /**
   * Optional agent expectation (same shape as MCP `project`).
   * Omitted → binding reflects local CLI session (matched when a project root resolved).
   */
  expectation?: ProjectExpectation | null;
  /**
   * Precomputed root relation when expectation.expectedRoot is set.
   * Tooling must canonicalize before comparing.
   * - exact: expectedRoot === resolvedRoot
   * - descendant: expected is inside project but not the root
   * - outside: not within this project
   * - unknown: could not evaluate (fail closed → unverified)
   */
  expectedRootRelation?: 'exact' | 'descendant' | 'outside' | 'unknown' | null;
  /** Active agent host id (claude, cursor, codex, …) or null/unknown. */
  activeHost?: string | null;
  /** Evidence-backed hard local write for this invocation. */
  hardWriteActive?: boolean;
  /** Host is soft-write only (Cursor/Codex/OpenCode class). */
  softWriteHost?: boolean;
  /** Package/host write boundary could not be analyzed. */
  writePathUnavailable?: boolean;
  honestLabel?: string | null;
  lastCheckAt?: string | null;
  lastCheckVerdict?: StatusCheckVerdict;
  activeViolations?: number | null;
  frozenResidual?: number | null;
  arkRulesLoaded?: boolean;
  rulesInventoried?: number | null;
  rulesUnderContract?: number | null;
  rulesFrozenResidual?: number | null;
  /** Optional override when Tooling already computed productHonesty next action. */
  nextActionOverride?: StatusNextAction | null;
  /**
   * Optional improvement compass residual ids (notAScore).
   * Tooling may pass a thin slice from a prior doctor/report snapshot.
   */
  improvementCompass?: StatusImprovementCompassSlice | null;
};

const PROJECT_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * Evaluate project binding for status without filesystem.
 * Paths must already be canonical absolute strings when compared.
 */
export function evaluateStatusBinding(input: {
  resolvedRoot: string;
  projectId: string | null | undefined;
  expectation?: ProjectExpectation | null;
  expectedRootRelation?: StatusManifestFacts['expectedRootRelation'];
}): ProjectBinding {
  const expectation = input.expectation;
  if (
    expectation == null ||
    (expectation.expectedRoot === undefined && expectation.expectedProjectId === undefined)
  ) {
    // Local CLI / unbound MCP: this process is bound to resolvedRoot when known.
    return {
      status: 'matched',
      authoritative: Boolean(input.resolvedRoot),
    };
  }

  if (expectation && typeof expectation !== 'object') {
    return {
      status: 'mismatch',
      authoritative: false,
      code: 'INVALID_PROJECT_EXPECTATION',
      message: 'project must be an object containing expectedRoot and/or expectedProjectId.',
    };
  }

  const rawRoot = expectation.expectedRoot;
  const rawId = expectation.expectedProjectId;

  if (
    rawRoot !== undefined &&
    (typeof rawRoot !== 'string' || rawRoot.trim() === '')
  ) {
    return {
      status: 'mismatch',
      authoritative: false,
      code: 'INVALID_PROJECT_EXPECTATION',
      message: 'project.expectedRoot must be a non-empty absolute path.',
    };
  }
  if (rawId !== undefined && (typeof rawId !== 'string' || !PROJECT_ID_PATTERN.test(rawId))) {
    return {
      status: 'mismatch',
      authoritative: false,
      code: 'INVALID_PROJECT_EXPECTATION',
      message: 'project.expectedProjectId must be a sha256:<64 lowercase hex> identity.',
    };
  }

  if (rawRoot === undefined && rawId !== undefined) {
    if (input.projectId && rawId !== input.projectId) {
      return {
        status: 'mismatch',
        authoritative: false,
        expectedProjectId: rawId,
        code: 'PROJECT_ID_MISMATCH',
        message: `Expected project id ${rawId}, but this process is bound to ${input.projectId}.`,
      };
    }
    return {
      status: 'unverified',
      authoritative: false,
      expectedProjectId: rawId,
      message:
        'project.expectedProjectId matched or could not be compared, but expectedRoot is required for an authoritative workspace binding.',
    };
  }

  const relation = input.expectedRootRelation ?? 'unknown';
  if (relation === 'outside') {
    return {
      status: 'mismatch',
      authoritative: false,
      expectedRoot: rawRoot,
      expectedProjectId: rawId,
      code: 'PROJECT_ROOT_MISMATCH',
      message: `Expected workspace ${rawRoot}, but this process is bound to ${input.resolvedRoot}.`,
    };
  }
  if (relation === 'unknown') {
    return {
      status: 'unverified',
      authoritative: false,
      expectedRoot: rawRoot,
      expectedProjectId: rawId,
      message:
        'Could not prove expectedRoot against the resolved project root (stale or incomplete path evidence).',
    };
  }
  if (relation === 'descendant' && rawId === undefined) {
    return {
      status: 'unverified',
      authoritative: false,
      expectedRoot: rawRoot,
      message:
        `Expected workspace ${rawRoot} is inside this project, but an exact project root is required for the initial authoritative handshake.`,
    };
  }
  if (rawId !== undefined && input.projectId && rawId !== input.projectId) {
    return {
      status: 'mismatch',
      authoritative: false,
      expectedRoot: rawRoot,
      expectedProjectId: rawId,
      code: 'PROJECT_ID_MISMATCH',
      message: `Expected project id ${rawId}, but this process is bound to ${input.projectId}.`,
    };
  }
  if (relation === 'exact' || (relation === 'descendant' && rawId && rawId === input.projectId)) {
    return {
      status: 'matched',
      authoritative: true,
      ...(rawRoot ? { expectedRoot: rawRoot } : {}),
      ...(rawId ? { expectedProjectId: rawId } : {}),
    };
  }

  return {
    status: 'unverified',
    authoritative: false,
    expectedRoot: rawRoot,
    expectedProjectId: rawId,
    message: 'Project expectation could not be fully verified.',
  };
}

/**
 * Map write-path evidence to the closed activation writePath vocabulary.
 * Soft hosts never become hard; missing analysis → unavailable.
 */
export function classifyStatusWritePath(input: {
  hardWriteActive?: boolean;
  softWriteHost?: boolean;
  writePathUnavailable?: boolean;
  activeHost?: string | null;
}): StatusWritePathClass {
  if (input.writePathUnavailable === true) return 'unavailable';
  if (input.softWriteHost === true) return 'advisory';
  if (input.hardWriteActive === true) return 'hard';
  // Hard-capable host without proven hard → advisory (honest, not hard).
  const host =
    typeof input.activeHost === 'string' ? input.activeHost.trim().toLowerCase() : '';
  if (!host || host === 'unknown') return 'unavailable';
  return 'advisory';
}

export function defaultHonestLabel(
  writePath: StatusWritePathClass,
  host: string | null
): string {
  const hostLabel = host && host !== 'unknown' ? host : 'unknown-host';
  if (writePath === 'hard') {
    return `Local write is hard for ${hostLabel} when the covered PreToolUse path is active; CI --strict-merge remains the merge backstop.`;
  }
  if (writePath === 'advisory') {
    return `Local write is advisory for ${hostLabel}; hard merge boundary is a required status running arkgate-check --strict-merge (alias ark-check).`;
  }
  return 'Write-path activation is unavailable or unverified for this invocation (no active host / incomplete evidence).';
}

/**
 * Deterministic next action from residual facts (no LLM).
 * Prefer explicit override from productHonesty when provided.
 */
export function resolveStatusNextAction(
  facts: StatusManifestFacts,
  binding: ProjectBinding,
  activation: StatusActivationSlice,
  lastCheck: StatusLastCheckSlice,
  rules: StatusRulesSlice
): StatusNextAction {
  if (facts.nextActionOverride?.id && facts.nextActionOverride.summary) {
    return {
      id: facts.nextActionOverride.id,
      summary: facts.nextActionOverride.summary,
    };
  }

  if (binding.status === 'mismatch') {
    return {
      id: 'rebind-project-identity',
      summary:
        binding.message ||
        'Project expectation does not match this process — call ark_identity / ark status with the correct expectedRoot (and projectId for descendants).',
    };
  }
  if (binding.status === 'unverified' && facts.expectation) {
    return {
      id: 'complete-identity-handshake',
      summary:
        binding.message ||
        'Supply project.expectedRoot at the exact project root (and expectedProjectId for descendants) for authoritative status.',
    };
  }
  if (!facts.resolvedConfigPath) {
    return {
      id: 'run-ark-start',
      summary: 'No ark.config.json found — run ark start (preview) then ark start --apply.',
    };
  }
  if (lastCheck.verdict === 'fail' || (lastCheck.activeViolations ?? 0) > 0) {
    return {
      id: 'fix-active-violations',
      summary: `Clear ${lastCheck.activeViolations ?? 'active'} blocking architecture finding(s), then re-run ark-check (or ark-check --doctor).`,
    };
  }
  if (lastCheck.verdict === 'incomplete') {
    return {
      id: 'restore-complete-analysis',
      summary: 'Last check was incomplete — restore TypeScript/analysis inputs and re-run ark-check.',
    };
  }
  if (lastCheck.verdict == null && lastCheck.at == null) {
    return {
      id: 'run-ark-check',
      summary: 'No last-check snapshot yet — run ark-check --report (or --doctor) to freeze session evidence.',
    };
  }
  if (activation.writePath === 'unavailable') {
    return {
      id: 'install-write-path',
      summary:
        'Write path is unavailable — install agent gates for your host (ark start / --install-agent-gates) and keep required CI --strict-merge.',
    };
  }
  if (activation.writePath === 'advisory') {
    return {
      id: 'keep-ci-merge-hard',
      summary:
        'Local write is advisory for this host — keep a required GitHub status on arkgate-check --strict-merge as the hard merge boundary.',
    };
  }
  if (rules.arkRulesLoaded && (rules.frozenResidual ?? 0) > 0) {
    return {
      id: 'review-arkrules-residual',
      summary: 'ArkRules residual remains frozen — review inventory debt without claiming a score.',
    };
  }
  return {
    id: 'stay-enforced',
    summary: 'Contract looks enforceable for this session — keep writing through the gate and re-check after structural edits.',
  };
}

export function buildStatusManifest(facts: StatusManifestFacts): StatusManifest {
  const resolvedRoot =
    typeof facts.resolvedRoot === 'string' && facts.resolvedRoot.length > 0
      ? facts.resolvedRoot
      : '.';
  const projectId =
    typeof facts.projectId === 'string' && PROJECT_ID_PATTERN.test(facts.projectId)
      ? facts.projectId
      : null;
  const binding = evaluateStatusBinding({
    resolvedRoot,
    projectId,
    expectation: facts.expectation,
    expectedRootRelation: facts.expectedRootRelation,
  });

  const hostRaw =
    typeof facts.activeHost === 'string' ? facts.activeHost.trim().toLowerCase() : '';
  const host = hostRaw && hostRaw !== 'unknown' ? hostRaw : hostRaw === 'unknown' ? 'unknown' : null;
  const writePath = classifyStatusWritePath({
    hardWriteActive: facts.hardWriteActive,
    softWriteHost: facts.softWriteHost,
    writePathUnavailable: facts.writePathUnavailable,
    activeHost: host,
  });
  const honestLabel =
    typeof facts.honestLabel === 'string' && facts.honestLabel.trim().length > 0
      ? facts.honestLabel.trim()
      : defaultHonestLabel(writePath, host);

  const lastCheck: StatusLastCheckSlice = {
    at: typeof facts.lastCheckAt === 'string' ? facts.lastCheckAt : null,
    verdict:
      facts.lastCheckVerdict === 'pass' ||
      facts.lastCheckVerdict === 'fail' ||
      facts.lastCheckVerdict === 'incomplete'
        ? facts.lastCheckVerdict
        : null,
    activeViolations: numberOrNull(facts.activeViolations),
    frozenResidual: numberOrNull(facts.frozenResidual),
  };

  const rules: StatusRulesSlice = {
    arkRulesLoaded: facts.arkRulesLoaded === true,
    inventoried: numberOrNull(facts.rulesInventoried),
    underContract: numberOrNull(facts.rulesUnderContract),
    frozenResidual: numberOrNull(facts.rulesFrozenResidual),
  };

  const activation: StatusActivationSlice = {
    writePath,
    host,
    honestLabel,
  };

  const projectIdentity: StatusProjectIdentitySlice = {
    projectId,
    resolvedRoot,
    resolvedConfigPath:
      typeof facts.resolvedConfigPath === 'string' && facts.resolvedConfigPath.length > 0
        ? facts.resolvedConfigPath
        : null,
    binding: binding.status,
    authoritative: binding.authoritative,
    ...(binding.code ? { code: binding.code } : {}),
    ...(binding.message ? { message: binding.message } : {}),
  };

  const status: StatusManifest = {
    schemaVersion: ARK_STATUS_MANIFEST_SCHEMA_VERSION,
    arkgateVersion:
      typeof facts.arkgateVersion === 'string' && facts.arkgateVersion.length > 0
        ? facts.arkgateVersion
        : 'unknown',
    projectIdentity,
    activation,
    lastCheck,
    rules,
    nextAction: resolveStatusNextAction(facts, binding, activation, lastCheck, rules),
  };

  const compass = normalizeStatusImprovementCompass(facts.improvementCompass);
  if (compass) status.improvementCompass = compass;

  return status;
}

function normalizeStatusImprovementCompass(
  value: StatusImprovementCompassSlice | null | undefined
): StatusImprovementCompassSlice | null {
  if (value == null || typeof value !== 'object') return null;
  if (value.notAScore !== true) return null;
  if (value.schemaVersion !== '1.0') return null;
  if (!Array.isArray(value.topResidual)) return null;
  const topResidual = value.topResidual
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 15);
  return {
    schemaVersion: '1.0',
    notAScore: true,
    topResidual,
  };
}

function numberOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** JSON Schema for the public status manifest (package export + agents). */
export const ARK_STATUS_MANIFEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ARK_STATUS_MANIFEST_SCHEMA_URL,
  title: 'ArkGate status manifest',
  description:
    'Unified session/project status snapshot for agents (identity, activation honesty, last check, rules counts, next action). Not a score.',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'arkgateVersion',
    'projectIdentity',
    'activation',
    'lastCheck',
    'rules',
    'nextAction',
  ],
  properties: {
    schemaVersion: { const: ARK_STATUS_MANIFEST_SCHEMA_VERSION },
    arkgateVersion: { type: 'string', minLength: 1 },
    projectIdentity: {
      type: 'object',
      additionalProperties: false,
      required: [
        'projectId',
        'resolvedRoot',
        'resolvedConfigPath',
        'binding',
        'authoritative',
      ],
      properties: {
        projectId: {
          anyOf: [
            { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
            { type: 'null' },
          ],
        },
        resolvedRoot: { type: 'string', minLength: 1 },
        resolvedConfigPath: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
        binding: { enum: ['matched', 'unverified', 'mismatch'] },
        authoritative: { type: 'boolean' },
        code: {
          enum: [
            'PROJECT_ROOT_MISMATCH',
            'PROJECT_ID_MISMATCH',
            'INVALID_PROJECT_EXPECTATION',
          ],
        },
        message: { type: 'string', minLength: 1 },
      },
    },
    activation: {
      type: 'object',
      additionalProperties: false,
      required: ['writePath', 'host', 'honestLabel'],
      properties: {
        writePath: { enum: ['hard', 'advisory', 'unavailable'] },
        host: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
        honestLabel: { type: 'string', minLength: 1 },
      },
    },
    lastCheck: {
      type: 'object',
      additionalProperties: false,
      required: ['at', 'verdict', 'activeViolations', 'frozenResidual'],
      properties: {
        at: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
        verdict: { anyOf: [{ enum: ['pass', 'fail', 'incomplete'] }, { type: 'null' }] },
        activeViolations: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        frozenResidual: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      },
    },
    rules: {
      type: 'object',
      additionalProperties: false,
      required: ['arkRulesLoaded', 'inventoried', 'underContract', 'frozenResidual'],
      properties: {
        arkRulesLoaded: { type: 'boolean' },
        inventoried: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        underContract: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        frozenResidual: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      },
    },
    nextAction: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'summary'],
      properties: {
        id: { type: 'string', minLength: 1 },
        summary: { type: 'string', minLength: 1 },
      },
    },
    improvementCompass: {
      type: 'object',
      description:
        'Optional thin improvement-compass residual ids (notAScore). Never a gate input; full lenses on doctor JSON.',
      additionalProperties: false,
      required: ['schemaVersion', 'notAScore', 'topResidual'],
      properties: {
        schemaVersion: { const: '1.0' },
        notAScore: { const: true },
        topResidual: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          maxItems: 15,
        },
      },
    },
  },
} as const;
