/**
 * ACS03 — gather session/project evidence for `ark status` / MCP `ark_status`.
 *
 * Fail-closed and CI-safe: never prompts (no readline), never invents hard write,
 * never invents a numeric score. Pure assembly lives in Domain statusManifest.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStatusManifest } from './status-manifest.mjs';
import { createProjectId } from './project-identity.mjs';
import { resolveEffectiveProjectRoot } from './project-root.mjs';
import { detectWritePathCapabilities } from './write-path-detect.mjs';
import { buildWritePathHonesty } from './enforcement-honesty.mjs';
import { HOST_SUPPORT_MATRIX } from './host-support-matrix.mjs';
import { detectActiveAgentHost } from './skill-install.mjs';
import { readBaseline } from './violations.mjs';
import { reportsDir, readJsonSafe } from './html-report.mjs';
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';

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
 * Collect status facts from disk (no prompts).
 * @param {{
 *   root?: string,
 *   config?: string,
 *   expectedRoot?: string,
 *   expectedProjectId?: string,
 *   host?: string,
 *   arkgateVersion?: string,
 *   env?: NodeJS.ProcessEnv,
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
  // Soft only when the host is known and matrix hard-write is false (Cursor/Codex/OpenCode).
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
