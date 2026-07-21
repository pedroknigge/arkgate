/** Evidence-backed doctor contract for local write, advisory MCP, and CI merge boundaries. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const UNVERIFIED = 'unverified';

function packageInstallation(root) {
  const projectPackage = path.join(root, 'package.json');
  try {
    const own = JSON.parse(fs.readFileSync(projectPackage, 'utf8'));
    if (
      own?.name === 'arkgate' &&
      fs.statSync(path.join(root, 'bin', 'ark-check.mjs'), { throwIfNoEntry: false })?.isFile()
    ) {
      return { installed: true, source: 'package.json + bin/ark-check.mjs (self-host)' };
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
      return { installed: true, source: 'arkgate/package.json via project resolver' };
    }
  } catch {
    // Configuration text alone must never become installed=true.
  }
  return { installed: false, source: 'arkgate/package.json unresolved from project' };
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
  return {
    supported,
    analyzed: true,
    configured,
    installed: supported && installed.installed,
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
      { field: 'installed', source: installed.source, value: supported && installed.installed },
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
  const hard = Boolean(hardSupported && observedActive && localLadder.hard === true);
  const localActive = runtimeObserved
    ? observedActive
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

export function withCiProviderEvidence(writePath, github) {
  if (!github?.available) return writePath;
  const required = typeof github.arkCheckRequired === 'boolean'
    ? github.arkCheckRequired
    : UNVERIFIED;
  const runnable = Boolean(
    writePath.enforcementState.ciMerge.configured &&
    writePath.enforcementState.ciMerge.installed
  );
  const active = required === true ? runnable : required === false ? false : runnable ? UNVERIFIED : false;
  const bypassable = active === true
    ? github.arkCheckSourceBound === false
      ? true
      : UNVERIFIED
    : required === false
      ? true
      : runnable
        ? UNVERIFIED
        : true;
  const source = `GitHub branch protection (${github.repo ?? 'repository'}:${github.branch ?? 'default'})`;
  const runtimeObserved = true;
  const operationCoverage = required;
  const hard = active === true && bypassable === false && operationCoverage === true;
  const ciMerge = replaceEvidence(
    writePath.enforcementState.ciMerge,
    ['active', 'runtimeObserved', 'operationCoverage', 'bypassable', 'required', 'hard'],
    source,
    { active, runtimeObserved, operationCoverage, bypassable, required, hard }
  );
  return {
    ...writePath,
    enforcementState: { ...writePath.enforcementState, ciMerge },
    enforcementLadder: {
      ...writePath.enforcementLadder,
      ciMerge: { ...writePath.enforcementLadder.ciMerge, requiredStatus: required },
    },
  };
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
  return rows;
}
