/** Evidence-backed doctor contract for local write, advisory MCP, and CI merge boundaries. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const UNVERIFIED = 'unverified';

/**
 * Codex project configuration is disk evidence only. Until a live `ark_identity`
 * handshake answers for the expected root, runtime identity and activation remain
 * unverified regardless of how complete the generated files look.
 */
export function codexRuntimeActivation({
  configuredOnDisk = false,
  restartRequired = configuredOnDisk,
} = {}) {
  return {
    configuredOnDisk: Boolean(configuredOnDisk),
    restartRequired: Boolean(restartRequired),
    runtimeObserved: false,
    identityMatch: UNVERIFIED,
    active: false,
  };
}

export function packageInstallation(root) {
  const projectPackage = path.join(root, 'package.json');
  try {
    const own = JSON.parse(fs.readFileSync(projectPackage, 'utf8'));
    if (
      own?.name === 'arkgate' &&
      fs.statSync(path.join(root, 'bin', 'ark-check.mjs'), { throwIfNoEntry: false })?.isFile()
    ) {
      return { installed: true, source: 'package.json + bin/ark-check.mjs (self-host)', selfHost: true };
    }
  } catch {
    // A missing/malformed project manifest is negative installation evidence.
  }
  try {
    const resolved = createRequire(projectPackage).resolve('arkgate/package.json');
    const packageRoot = path.dirname(resolved);
    const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const binary = path.join(packageRoot, 'bin', 'ark-check.mjs');
    if (manifest?.name === 'arkgate' && fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) {
      return {
        installed: true,
        source: 'arkgate/package.json via project resolver',
        selfHost: false,
      };
    }
  } catch {
    // Configuration text alone must never become installed=true.
  }
  return {
    installed: false,
    source: 'arkgate/package.json unresolved from project',
    selfHost: false,
  };
}

function configuredEvidence(paths) {
  return paths.length > 0 ? paths : ['filesystem scan (no matching configuration)'];
}

function boundary({
  supported,
  configuredPaths,
  installed,
  active,
  runtimeObserved,
  operation,
  operationCoverage,
  bypassable,
  required,
  hard,
  sources,
}) {
  const configured = configuredPaths.length > 0;
  // Package install is independent of host support: an unsupported activeHost
  // (or unknown) must not report installed:false when arkgate is resolved.
  // Hardness still requires runtime proof (Z10) — installed alone never implies hard.
  const packageInstalled = Boolean(installed.installed);
  return {
    supported,
    analyzed: true,
    configured,
    installed: packageInstalled,
    active,
    runtimeObserved,
    operation,
    operationCoverage,
    bypassable,
    required,
    hard,
    evidence: [
      ...configuredEvidence(configuredPaths).map((source) => ({
        field: 'configured', source, value: configured,
      })),
      { field: 'installed', source: installed.source, value: packageInstalled },
      { field: 'active', source: sources.active, value: active },
      { field: 'runtimeObserved', source: sources.runtimeObserved, value: runtimeObserved },
      { field: 'operationCoverage', source: sources.operationCoverage, value: operationCoverage },
      { field: 'bypassable', source: sources.bypassable, value: bypassable },
      { field: 'required', source: sources.required, value: required },
      { field: 'hard', source: sources.hard, value: hard },
    ],
  };
}

export function buildEnforcementState(root, model) {
  const installed = packageInstallation(root);
  const hardSupported = Boolean(model.support?.capabilities?.['hard-write']);
  const advisorySupported = Boolean(model.support?.capabilities?.['advisory-write']);
  const hardPaths = model.capabilityEvidence['hard-write'];
  const advisoryPaths = model.capabilityEvidence['advisory-write'];
  const ciPaths = model.capabilityEvidence['merge-gate'];
  const localLadder = model.enforcementLadder.localWrite;
  const runtimeObserved = typeof localLadder.operationCovered === 'boolean';
  const operationCoverage = runtimeObserved ? localLadder.operationCovered : UNVERIFIED;
  const observedActive = runtimeObserved && operationCoverage === true;
  // FG-WRITEPATH / P0B-PIN-ABSENT: never hard:true without package resolve (pin + node_modules / self-host).
  const hard = Boolean(
    hardSupported &&
      installed.installed &&
      observedActive &&
      localLadder.hard === true
  );
  const localActive = runtimeObserved
    ? observedActive && installed.installed
    : hardSupported && hardPaths.length > 0 && installed.installed
      ? UNVERIFIED
      : false;
  const advisoryActive = advisorySupported && advisoryPaths.length > 0 && installed.installed
    ? UNVERIFIED
    : false;
  const ciConfigured = Boolean(model.ci?.failClosed && ciPaths.length > 0);
  const ciActive = ciConfigured && installed.installed ? UNVERIFIED : false;

  return {
    schemaVersion: '1.1',
    activeHost: model.activeHost,
    localWrite: boundary({
      supported: hardSupported,
      configuredPaths: hardPaths,
      installed,
      active: localActive,
      runtimeObserved,
      operation: runtimeObserved ? localLadder.operation ?? null : null,
      operationCoverage,
      bypassable: hard ? false : hardSupported && !runtimeObserved ? UNVERIFIED : true,
      required: UNVERIFIED,
      hard,
      sources: {
        active: runtimeObserved ? 'observed PreToolUse attempt' : 'runtime observation unavailable',
        runtimeObserved: runtimeObserved ? 'fresh PreToolUse invocation' : 'runtime observation unavailable',
        operationCoverage: runtimeObserved ? 'active-host operation matcher' : 'operation not observed',
        bypassable: hard ? 'observed hard write boundary' : 'host runtime bypass evidence unavailable',
        required: 'local host policy unavailable',
        hard: hard ? 'fresh covered active-host invocation' : 'hardness not proven for this invocation',
      },
    }),
    advisoryMcp: boundary({
      supported: advisorySupported,
      configuredPaths: advisoryPaths,
      installed,
      active: advisoryActive,
      runtimeObserved: false,
      operation: null,
      operationCoverage: UNVERIFIED,
      bypassable: true,
      required: UNVERIFIED,
      hard: false,
      sources: {
        active: 'MCP runtime observation unavailable',
        runtimeObserved: 'doctor did not observe an MCP tool invocation',
        operationCoverage: 'advisory MCP is caller-invoked',
        bypassable: 'advisory MCP does not intercept every write',
        required: 'local host policy unavailable',
        hard: 'MCP presence is advisory and never proves a hard boundary',
      },
    }),
    ciMerge: boundary({
      supported: true,
      configuredPaths: ciConfigured ? ciPaths : [],
      installed,
      active: ciActive,
      runtimeObserved: false,
      operation: 'merge',
      operationCoverage: ciConfigured ? UNVERIFIED : false,
      bypassable: ciConfigured ? UNVERIFIED : true,
      required: UNVERIFIED,
      hard: false,
      sources: {
        active: 'CI run and provider enforcement not observed',
        runtimeObserved: 'provider evidence unavailable',
        operationCoverage: 'required-status operation coverage unavailable',
        bypassable: 'branch-protection evidence unavailable',
        required: 'branch-protection evidence unavailable',
        hard: 'merge hardness requires fresh provider evidence',
      },
    }),
  };
}

function replaceEvidence(boundaryState, fields, source, values) {
  return {
    ...boundaryState,
    ...values,
    evidence: [
      ...boundaryState.evidence.filter((item) => !fields.includes(item.field)),
      ...fields.map((field) => ({ field, source, value: values[field] })),
    ],
  };
}

/**
 * Attach CI provider + runtime evidence (EH06).
 * - Branch-protection policy (required status) is independent of CI run observation.
 * - Successful CI runs can set runtimeObserved:true even when policy API is plan-restricted (403).
 * - hard stays false when status is not proven required.
 *
 * @param {object} writePath
 * @param {object|null|undefined} github reportGithubBranchProtection (+ optional runtime fields)
 */
export function withCiProviderEvidence(writePath, github) {
  if (!github) return writePath;

  const planUnavailable =
    github.reason === 'provider-policy-unavailable-plan' ||
    github.policyReason === 'unavailable-plan';
  const policyAvailable = github.available === true;
  // Generic 403 / token / SSO failures are unverified — never "proven not required".
  const policyUnverified =
    !policyAvailable &&
    !planUnavailable &&
    (github.reason === 'provider-enforcement-unverified' ||
      github.reason === 'gh-cli-unavailable' ||
      github.reason === 'gh-repo-unavailable' ||
      Boolean(github.reason));

  // No policy query and no runtime signal → leave writePath unchanged.
  if (!policyAvailable && github.runtimeObserved !== true && !planUnavailable && !policyUnverified) {
    return writePath;
  }

  // required: false only when plan language explicitly proves policy unavailable,
  // or when provider proved absence (available + arkCheckRequired === false).
  // Generic 403 / incomplete query → UNVERIFIED (hard stays false).
  const required = policyAvailable
    ? typeof github.arkCheckRequired === 'boolean'
      ? github.arkCheckRequired
      : UNVERIFIED
    : planUnavailable
      ? false
      : UNVERIFIED;

  const runnable = Boolean(
    writePath.enforcementState.ciMerge.configured &&
    writePath.enforcementState.ciMerge.installed
  );
  const active = required === true
    ? runnable
    : required === false
      ? false
      : runnable
        ? UNVERIFIED
        : false;
  const bypassable = active === true
    ? github.arkCheckSourceBound === false
      ? true
      : UNVERIFIED
    : required === false
      ? true
      : runnable
        ? UNVERIFIED
        : true;

  // Runtime observation is only true when a CI run was actually observed.
  // Do not invent true from branch-protection availability alone (legacy conflation).
  const runtimeObserved = github.runtimeObserved === true;

  const source = policyAvailable
    ? `GitHub branch protection (${github.repo ?? 'repository'}:${github.branch ?? 'default'})`
    : planUnavailable
      ? `GitHub provider policy unavailable (plan) (${github.repo ?? 'repository'}:${github.branch ?? 'default'})`
      : `GitHub CI runtime (${github.repo ?? 'repository'})`;

  const operationCoverage = required;
  // hard: false remains correct when status is not proven required
  const hard = active === true && bypassable === false && operationCoverage === true;
  const ciMerge = replaceEvidence(
    writePath.enforcementState.ciMerge,
    ['active', 'runtimeObserved', 'operationCoverage', 'bypassable', 'required', 'hard'],
    source,
    { active, runtimeObserved, operationCoverage, bypassable, required, hard }
  );

  const next = {
    ...writePath,
    enforcementState: { ...writePath.enforcementState, ciMerge },
    enforcementLadder: {
      ...writePath.enforcementLadder,
      ciMerge: {
        ...writePath.enforcementLadder.ciMerge,
        requiredStatus: required,
        ...(github.latestCiRun ? { latestCiRun: github.latestCiRun } : {}),
        ...(planUnavailable ? { providerPolicy: 'unavailable-plan' } : {}),
      },
    },
  };
  if (planUnavailable || github.reason) {
    next.providerEnforcement = {
      available: policyAvailable,
      reason: github.reason || (planUnavailable ? 'provider-policy-unavailable-plan' : 'provider-enforcement-unverified'),
      policyReason: github.policyReason || (planUnavailable ? 'unavailable-plan' : null),
      runtimeObserved,
      latestCiRun: github.latestCiRun ?? null,
      hard: hard === true,
    };
  }
  return next;
}

function formatEnforcementBoundary(label, value) {
  const state = (item) => item === true ? 'yes' : item === false ? 'no' : String(item);
  return `${label} — supported: ${state(value.supported)} · analyzed: ${state(value.analyzed)} · configured: ${state(value.configured)} · installed: ${state(value.installed)} · runtime observed: ${state(value.runtimeObserved)} · operation: ${value.operation ?? 'none'} · operation covered: ${state(value.operationCoverage)} · active: ${state(value.active)} · bypassable: ${state(value.bypassable)} · required: ${state(value.required)} · hard: ${state(value.hard)}`;
}

export function enforcementDoctorLines(enforcement) {
  const rows = [
    { level: enforcement.localWrite.active === true ? 'ok' : 'warn', text: formatEnforcementBoundary('Local write', enforcement.localWrite) },
    { level: 'warn', text: formatEnforcementBoundary('Advisory MCP', enforcement.advisoryMcp) },
    { level: enforcement.ciMerge.required === true ? 'ok' : 'warn', text: formatEnforcementBoundary('CI merge', enforcement.ciMerge) },
  ];
  if (enforcement.localWrite.active === UNVERIFIED && enforcement.localWrite.hard === false)
    rows.push({ level: 'bad', text: 'RED FLAG: local hook assets exist, but this active-host operation was not observed at runtime; hard blocking is unverified.' });
  if (enforcement.activeHost === 'unknown') {
    rows.push({
      level: 'warn',
      text:
        'Active host unknown for this invocation — enforcementState is session projection only. ' +
        'See writePath.inventory for on-disk host hooks; hard write is never claimed without runtime proof.',
    });
  }
  return rows;
}
