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

function boundary({ supported, configuredPaths, installed, active, bypassable, required, sources }) {
  const configured = configuredPaths.length > 0;
  return {
    supported,
    analyzed: true,
    configured,
    installed: supported && installed.installed,
    active,
    bypassable,
    required,
    evidence: [
      ...configuredEvidence(configuredPaths).map((source) => ({
        field: 'configured', source, value: configured,
      })),
      { field: 'installed', source: installed.source, value: supported && installed.installed },
      { field: 'active', source: sources.active, value: active },
      { field: 'bypassable', source: sources.bypassable, value: bypassable },
      { field: 'required', source: sources.required, value: required },
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
  const observedHard = model.enforcementLadder.localWrite.active === true;
  const localActive = observedHard
    ? true
    : hardSupported && hardPaths.length > 0 && installed.installed
      ? UNVERIFIED
      : false;
  const advisoryActive = advisorySupported && advisoryPaths.length > 0 && installed.installed
    ? UNVERIFIED
    : false;
  const ciConfigured = Boolean(model.ci?.failClosed && ciPaths.length > 0);
  const ciActive = ciConfigured && installed.installed ? UNVERIFIED : false;

  return {
    schemaVersion: '1.0',
    activeHost: model.activeHost,
    localWrite: boundary({
      supported: hardSupported,
      configuredPaths: hardPaths,
      installed,
      active: localActive,
      bypassable: observedHard ? false : hardSupported ? UNVERIFIED : true,
      required: UNVERIFIED,
      sources: {
        active: observedHard ? 'observed covered PreToolUse attempt' : 'runtime observation unavailable',
        bypassable: observedHard ? 'observed hard write boundary' : 'host runtime bypass evidence unavailable',
        required: 'local host policy unavailable',
      },
    }),
    advisoryMcp: boundary({
      supported: advisorySupported,
      configuredPaths: advisoryPaths,
      installed,
      active: advisoryActive,
      bypassable: true,
      required: UNVERIFIED,
      sources: {
        active: 'MCP runtime observation unavailable',
        bypassable: 'advisory MCP does not intercept every write',
        required: 'local host policy unavailable',
      },
    }),
    ciMerge: boundary({
      supported: true,
      configuredPaths: ciConfigured ? ciPaths : [],
      installed,
      active: ciActive,
      bypassable: ciConfigured ? UNVERIFIED : true,
      required: UNVERIFIED,
      sources: {
        active: 'CI run and provider enforcement not observed',
        bypassable: 'branch-protection evidence unavailable',
        required: 'branch-protection evidence unavailable',
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
  const ciMerge = replaceEvidence(
    writePath.enforcementState.ciMerge,
    ['active', 'bypassable', 'required'],
    source,
    { active, bypassable, required }
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
