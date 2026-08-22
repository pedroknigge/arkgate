/**
 * ACS03 + DF02 — gather session/project evidence for `ark status` / MCP `ark_status`.
 *
 * Fail-closed and CI-safe: never prompts (no readline), never invents hard write,
 * never invents a numeric score. Pure assembly lives in Domain statusManifest.
 * Improvement compass carries explicit honesty mode (full|subset|unavailable).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildStatusManifest,
  normalizeStatusImprovementCompass,
  projectStatusImprovementCompass,
  unavailableStatusImprovementCompass,
} from './status-manifest.mjs';
import { createProjectId } from './project-identity.mjs';
import { resolveEffectiveProjectRoot } from './project-root.mjs';
import { detectWritePathCapabilities } from './write-path-detect.mjs';
import { buildWritePathHonesty } from './enforcement-honesty.mjs';
import { HOST_SUPPORT_MATRIX } from './host-support-matrix.mjs';
import { detectActiveAgentHost } from './skill-install.mjs';
import { readBaseline } from './violations.mjs';
import { reportsDir, readJsonSafe } from './html-report.mjs';
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';
import { collectVsBaseFacts, discoverTeamBaseRef } from './team-parliament-io.mjs';
import { classifyAdopted, readAdoptionStance } from './adoption-stance.mjs';

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function packageVersion() {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function realpathOrResolve(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Classify expectedRoot against resolvedRoot after canonicalization.
 * @param {string} resolvedRoot
 * @param {string|undefined} expectedRoot
 * @returns {'exact'|'descendant'|'outside'|'unknown'}
 */
export function classifyExpectedRootRelation(resolvedRoot, expectedRoot) {
  if (expectedRoot == null || expectedRoot === '') return 'unknown';
  if (typeof expectedRoot !== 'string' || !path.isAbsolute(expectedRoot)) return 'unknown';
  let expected;
  let resolved;
  try {
    expected = realpathOrResolve(expectedRoot);
    resolved = realpathOrResolve(resolvedRoot);
  } catch {
    return 'unknown';
  }
  if (expected === resolved) return 'exact';
  const rel = path.relative(resolved, expected);
  if (rel === '') return 'exact';
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return 'descendant';
  return 'outside';
}

/**
 * Count baseline keys that belong to the ArkRules plane only.
 * Full baseline size is used for lastCheck.frozenResidual (all frozen debt);
 * rules.frozenResidual must not over-count layer/capability freezes as ArkRules residual.
 * @param {{ exists?: boolean, keys?: Set<string>|Iterable<string> }|null|undefined} baseline
 * @returns {number|null}
 */
export function countArkruleFrozenKeys(baseline) {
  if (!baseline?.exists || !baseline.keys) return baseline?.exists ? 0 : null;
  let n = 0;
  for (const key of baseline.keys) {
    if (typeof key !== 'string' || key.length === 0) continue;
    // baselineKey format: ruleId|file|fromLayer|toLayer|target
    if (
      key.startsWith('ARKRULE_') ||
      key.startsWith('INVARIANT_UNCOVERED|')
    ) {
      n += 1;
    }
  }
  return n;
}

/**
 * Map latest report snapshot + baseline into last-check facts.
 * @param {object|null} latest
 * @param {{ exists: boolean, keys: Set<string> }} baseline
 */
export function lastCheckFactsFromSnapshot(latest, baseline) {
  const frozenResidual = baseline?.exists ? baseline.keys.size : null;
  if (!latest || typeof latest !== 'object') {
    return {
      lastCheckAt: null,
      lastCheckVerdict: null,
      activeViolations: null,
      frozenResidual,
    };
  }
  const at =
    typeof latest.generatedAt === 'string'
      ? latest.generatedAt
      : typeof latest.at === 'string'
        ? latest.at
        : null;
  const active =
    typeof latest.activeViolations === 'number'
      ? latest.activeViolations
      : typeof latest.violations?.active === 'number'
        ? latest.violations.active
        : null;
  let verdict = null;
  if (latest.ok === true && (active == null || active === 0)) verdict = 'pass';
  else if (latest.ok === false || (typeof active === 'number' && active > 0)) verdict = 'fail';
  else if (latest.completeness === 'partial' || latest.completeness === 'unavailable') {
    verdict = 'incomplete';
  } else if (latest.ok === true) verdict = 'pass';
  return {
    lastCheckAt: at,
    lastCheckVerdict: verdict,
    activeViolations: active,
    frozenResidual,
  };
}

/**
 * Project status improvementCompass honesty from a report/session snapshot (DF02).
 * Prefer stored thin slice; never invent green residual when facts are missing.
 *
 * @param {object|null|undefined} latest
 * @param {{ contractHash?: string|null }} [opts]
 * @returns {import('./status-manifest.mjs').StatusImprovementCompassSlice}
 */
export function statusCompassFromSnapshot(latest, opts = {}) {
  const contractHash =
    typeof opts.contractHash === 'string' && opts.contractHash.length > 0
      ? opts.contractHash
      : null;

  if (!latest || typeof latest !== 'object') {
    return unavailableStatusImprovementCompass({
      reasonCode: 'NO_SESSION_SNAPSHOT',
      reason:
        'No session report snapshot yet — run ark-check --doctor or --report for residual lenses. Status never invents green.',
      contractHash,
    });
  }

  // Prefer explicit thin status slice on the snapshot (report path stores mode+residual).
  if (latest.improvementCompass && typeof latest.improvementCompass === 'object') {
    const normalized = normalizeStatusImprovementCompass({
      ...latest.improvementCompass,
      ...(contractHash && !latest.improvementCompass.contractHash
        ? { contractHash }
        : {}),
      factsSource: latest.improvementCompass.factsSource || 'report-snapshot',
    });
    if (normalized) return normalized;
  }

  // Doctor-equivalent residual ids stored without honesty wrapper → full if complete flag set.
  if (
    latest.doctorImprovementCompass &&
    typeof latest.doctorImprovementCompass === 'object' &&
    latest.doctorImprovementCompass.notAScore === true &&
    Array.isArray(latest.doctorImprovementCompass.topResidual)
  ) {
    const complete = latest.compassFactsComplete === true || latest.completeness === 'complete';
    return projectStatusImprovementCompass({
      mode: complete ? 'full' : 'subset',
      topResidual: latest.doctorImprovementCompass.topResidual,
      reasonCode: complete ? undefined : 'FACTS_PARTIAL',
      reason: complete
        ? undefined
        : 'Session snapshot residual is partial — re-run doctor/report for full compass.',
      factsSource: 'report-snapshot',
      contractHash,
    });
  }

  return unavailableStatusImprovementCompass({
    reasonCode: 'NO_SESSION_SNAPSHOT',
    reason:
      'Session snapshot has no improvement compass facts — run ark-check --doctor or --report. Status never invents green.',
    contractHash,
  });
}

/**
 * Build a storeable thin status compass from a full doctor ImprovementCompass (DF02).
 * Used by report snapshot so status residual ⊆ doctor residual for the same tree.
 *
 * @param {{ notAScore?: boolean, topResidual?: string[] }|null|undefined} doctorCompass
 * @param {{ mode?: 'full'|'subset', contractHash?: string|null, reasonCode?: string, reason?: string }} [opts]
 */
export function thinStatusCompassFromDoctor(doctorCompass, opts = {}) {
  if (!doctorCompass || doctorCompass.notAScore !== true) {
    return unavailableStatusImprovementCompass({
      reasonCode: 'FACTS_UNAVAILABLE',
      contractHash: opts.contractHash,
    });
  }
  const mode = opts.mode === 'subset' ? 'subset' : 'full';
  return projectStatusImprovementCompass({
    mode,
    topResidual: Array.isArray(doctorCompass.topResidual) ? doctorCompass.topResidual : [],
    reasonCode: opts.reasonCode,
    reason: opts.reason,
    factsSource: 'report-snapshot',
    contractHash: opts.contractHash,
  });
}

/**
 * Collect status facts from disk (no prompts).
 * @param {{
 *   root?: string,
 *   config?: string,
 *   expectedRoot?: string,
 *   expectedProjectId?: string,
 *   host?: string,
 *   arkgateVersion?: string,
 *   env?: NodeJS.ProcessEnv,
 *   improvementCompass?: object | null,
 *   contractHash?: string | null,
 * }} [options]
 */
export function collectStatusFacts(options = {}) {
  const startRoot = path.resolve(options.root || process.cwd());
  const configName = options.config || 'ark.config.json';
  const resolved = resolveEffectiveProjectRoot(startRoot, {
    configName,
    writeMode: false,
  });
  const resolvedRoot = path.resolve(resolved.root || startRoot);
  const configPath = resolved.configFound
    ? path.resolve(resolved.configPath)
    : path.join(resolvedRoot, typeof configName === 'string' ? path.basename(configName) : 'ark.config.json');
  const configExists = fs.existsSync(configPath);

  let config = null;
  if (configExists) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = null;
    }
  }

  const projectId = configExists
    ? createProjectId(realpathOrResolve(resolvedRoot), realpathOrResolve(configPath), sha256Hex)
    : null;

  const expectation =
    options.expectedRoot != null || options.expectedProjectId != null
      ? {
          ...(options.expectedRoot != null ? { expectedRoot: options.expectedRoot } : {}),
          ...(options.expectedProjectId != null
            ? { expectedProjectId: options.expectedProjectId }
            : {}),
        }
      : null;

  const expectedRootRelation = expectation?.expectedRoot
    ? classifyExpectedRootRelation(resolvedRoot, expectation.expectedRoot)
    : null;

  const env = options.env || process.env;
  const activeHost =
    (typeof options.host === 'string' && options.host.trim()) ||
    detectActiveAgentHost(env) ||
    'unknown';

  let writePath = null;
  let writePathUnavailable = false;
  try {
    writePath = detectWritePathCapabilities(resolvedRoot, activeHost === 'unknown' ? undefined : activeHost);
  } catch {
    writePathUnavailable = true;
  }

  const hardWriteActive = writePath?.enforcementState?.localWrite?.hard === true;
  const hostKey =
    typeof writePath?.activeHost === 'string'
      ? writePath.activeHost.trim().toLowerCase()
      : String(activeHost).trim().toLowerCase();
  const matrix = HOST_SUPPORT_MATRIX[hostKey] ?? null;
  // Soft only when the host is known and matrix hard-write is false (currently OpenCode).
  const softWriteHost = Boolean(matrix && matrix.capabilities?.['hard-write'] !== true);
  const writePathHonesty = buildWritePathHonesty(hostKey, hardWriteActive, {
    packageInstalled: writePath?.enforcementState?.localWrite?.installed !== false,
  });

  const latestPath = path.join(reportsDir(resolvedRoot), 'latest.json');
  const latest = readJsonSafe(latestPath);
  const baseline = readBaseline(resolvedRoot, '.ark-baseline.json');
  const lastCheck = lastCheckFactsFromSnapshot(latest, baseline);

  const arkRulesLoaded = Boolean(
    config?.arkRules && typeof config.arkRules === 'object' && Object.keys(config.arkRules).length > 0
  );

  let rulesInventoried = null;
  let rulesUnderContract = null;
  let rulesFrozenResidual = null;
  if (configExists && config) {
    try {
      const summary = summarizeRulesUnderContract(resolvedRoot, config);
      if (summary?.active === false) {
        rulesInventoried = 0;
        rulesUnderContract = 0;
        rulesFrozenResidual = 0;
      } else if (summary && summary.active !== false) {
        const structure = Number(summary.structureRules) || 0;
        const invariants = Number(summary.invariants) || 0;
        const covered = Number(summary.coveredInvariants) || 0;
        rulesInventoried = structure + invariants;
        rulesUnderContract = structure + covered;
        rulesFrozenResidual = baseline.exists ? countArkruleFrozenKeys(baseline) : 0;
      }
    } catch {
      // Counts stay null when inventory cannot be loaded — honest absence, not zero score.
    }
  }

  const arkruleFrozenFallback = countArkruleFrozenKeys(baseline);

  // DF02 — always project compass with honesty mode (never invent green residual).
  // Prefer explicit override (tests/MCP inject doctor-facts); else report snapshot.
  let improvementCompass = null;
  if (options.improvementCompass != null) {
    improvementCompass = normalizeStatusImprovementCompass(options.improvementCompass);
  }
  if (!improvementCompass) {
    const contractHash =
      typeof options.contractHash === 'string' && options.contractHash.length > 0
        ? options.contractHash
        : configExists && config
          ? sha256Hex(JSON.stringify(config))
          : null;
    improvementCompass = statusCompassFromSnapshot(latest, { contractHash });
  }

  return {
    arkgateVersion: options.arkgateVersion || packageVersion(),
    resolvedRoot: realpathOrResolve(resolvedRoot),
    resolvedConfigPath: configExists ? realpathOrResolve(configPath) : null,
    projectId,
    expectation,
    expectedRootRelation,
    activeHost: hostKey || null,
    hardWriteActive,
    softWriteHost: softWriteHost || writePathHonesty.softWriteHost === true,
    writePathUnavailable,
    honestLabel: writePathHonesty.message || null,
    lastCheckAt: lastCheck.lastCheckAt,
    lastCheckVerdict: lastCheck.lastCheckVerdict,
    activeViolations: lastCheck.activeViolations,
    frozenResidual: lastCheck.frozenResidual,
    arkRulesLoaded,
    rulesInventoried,
    rulesUnderContract,
    rulesFrozenResidual:
      rulesFrozenResidual != null
        ? rulesFrozenResidual
        : arkRulesLoaded && arkruleFrozenFallback != null
          ? arkruleFrozenFallback
          : arkRulesLoaded
            ? 0
            : null,
    leftoverDesignWork:
      options.leftoverDesignWork === true ||
      latest?.leftoverDesignWork === true ||
      latest?.designFitness?.designWeak === true ||
      latest?.doctor?.designFitness?.designWeak === true,
    adopted:
      options.adopted ??
      classifyAdopted({
        stance: readAdoptionStance(resolvedRoot),
        github: {
          requiredStatusConfigured: writePath?.enforcementState?.ciMerge?.required === true,
          arkCheckRequired: writePath?.enforcementState?.ciMerge?.required === true,
        },
        ci: {
          state:
            writePath?.enforcementState?.ciMerge?.required === true
              ? 'required'
              : undefined,
        },
      }),
    improvementCompass,
    vsBase: (() => {
      const vsRef = typeof options.vs === 'string' ? options.vs.trim() : '';
      if (!vsRef) return null;
      const baseRef = discoverTeamBaseRef(resolvedRoot, vsRef);
      if (!baseRef) return null;
      return collectVsBaseFacts({
        root: resolvedRoot,
        baseRef,
        configRel: path.basename(configPath),
      });
    })(),
  };
}

/**
 * Build the public status manifest for a project root.
 * @param {Parameters<typeof collectStatusFacts>[0]} [options]
 */
export function buildProjectStatusManifest(options = {}) {
  return buildStatusManifest(collectStatusFacts(options));
}

/**
 * CLI entry: always non-interactive. Prefer JSON for agents; human lines without --json.
 * Exit 0 when identity is not mismatch; exit 1 on mismatch (stale / wrong project).
 * @param {{
 *   root?: string,
 *   config?: string,
 *   json?: boolean,
 *   expectedRoot?: string,
 *   expectedProjectId?: string,
 *   host?: string,
 *   arkgateVersion?: string,
 *   write?: (line: string) => void,
 *   writeErr?: (line: string) => void,
 * }} args
 */
export function runStatusCommand(args = {}) {
  const write = args.write ?? ((line) => console.log(line));
  const writeErr = args.writeErr ?? ((line) => console.error(line));

  // CI / non-TTY: never hang. Status never uses readline.
  const asJson = args.json === true || process.env.CI === '1' || process.env.CI === 'true';

  try {
    const manifest = buildProjectStatusManifest({
      root: args.root,
      config: args.config,
      expectedRoot: args.expectedRoot,
      expectedProjectId: args.expectedProjectId,
      host: args.host,
      arkgateVersion: args.arkgateVersion,
      vs: args.vs,
    });

    if (asJson || args.json) {
      write(JSON.stringify(manifest, null, 2));
    } else {
      write(`ArkGate status ${manifest.arkgateVersion} — schema ${manifest.schemaVersion}`);
      write(
        `  identity: ${manifest.projectIdentity.binding}` +
          (manifest.projectIdentity.authoritative ? ' (authoritative)' : '') +
          (manifest.projectIdentity.projectId
            ? ` · ${manifest.projectIdentity.projectId.slice(0, 18)}…`
            : ' · (no project id)')
      );
      write(`  root: ${manifest.projectIdentity.resolvedRoot}`);
      write(
        `  activation: ${manifest.activation.writePath}` +
          (manifest.activation.host ? ` · host=${manifest.activation.host}` : '')
      );
      write(`  ${manifest.activation.honestLabel}`);
      const lc = manifest.lastCheck;
      write(
        `  lastCheck: ${lc.verdict ?? 'none'}` +
          (lc.at ? ` @ ${lc.at}` : '') +
          (lc.activeViolations != null ? ` · active=${lc.activeViolations}` : '') +
          (lc.frozenResidual != null ? ` · frozen=${lc.frozenResidual}` : '')
      );
      write(
        `  rules: loaded=${manifest.rules.arkRulesLoaded}` +
          (manifest.rules.inventoried != null ? ` · inventoried=${manifest.rules.inventoried}` : '') +
          (manifest.rules.underContract != null
            ? ` · underContract=${manifest.rules.underContract}`
            : '') +
          (manifest.rules.frozenResidual != null
            ? ` · frozen=${manifest.rules.frozenResidual}`
            : '')
      );
      const ic = manifest.improvementCompass;
      if (ic) {
        const residual =
          Array.isArray(ic.topResidual) && ic.topResidual.length > 0
            ? ic.topResidual.join(', ')
            : '(none)';
        write(
          `  compass: mode=${ic.mode}` +
            (ic.mode === 'unavailable' ? '' : ` · residual=${residual}`) +
            ' · not a score'
        );
      }
      if (manifest.vsBase?.line) write(`  ${manifest.vsBase.line}`);
      write(`  next: [${manifest.nextAction.id}] ${manifest.nextAction.summary}`);
    }

    if (manifest.projectIdentity.binding === 'mismatch') return 1;
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (asJson || args.json) {
      write(
        JSON.stringify({
          schemaVersion: '1.0',
          error: message,
          ok: false,
        })
      );
    } else {
      writeErr(message);
    }
    return 2;
  }
}
