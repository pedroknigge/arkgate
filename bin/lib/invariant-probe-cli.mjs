/**
 * `arkgate-check --probe-invariants[=<id>] [--write] [--json] [--runner <id>]`
 * — orchestration and output (ADR 0039).
 *
 * Owner-invoked only. Loaded through a dynamic import from the CLI entry when
 * the flag is set; the write hook, MCP, ESLint, the action and --strict-merge
 * never import this module (a static test pins it).
 *
 * Per target: baseline green → load canary caught → reach canary caught → at
 * most three mutants. Everything runs in a temporary copy; the user's tree is
 * only read, except `.ark/invariant-probe.json` under --write.
 *
 * Exit codes: 0 no survivor and nothing unreached · 1 at least one survived or
 * not-reached · 2 could not run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { testFilesNamingInvariant } from './invariant-coverage.mjs';
import {
  INVARIANT_PROBE_ARTIFACT_PATH,
  INVARIANT_PROBE_MAX_TARGETS,
  INVARIANT_PROBE_MAX_TESTS,
  applyEdit,
  buildInvariantProbeArtifact,
  canaryEdits,
  foldVerdict,
  planMutants,
  probeExitCode,
  probeRowLine,
  readInvariantProbeArtifact,
} from './invariant-probe.mjs';
import { hashProjectFile, invariantIdentityHash, sha256Text } from './invariant-probe-io.mjs';
import {
  PROBE_TIMEOUT_CEILING_MS,
  buildProbeEnv,
  detectRunner,
  probeTimeoutMs,
  runCoveringTests,
} from './invariant-probe-runner.mjs';
import { findProbeSites, parsesCleanly } from './invariant-probe-sites.mjs';
import { createProbeWorkspace, sweepStaleProbeWorkspaces } from './invariant-probe-workspace.mjs';
import { testImportersOf } from './outside-importers.mjs';
import { collectGovernedFiles, normalize } from './scan-files.mjs';
import { evaluateCatalogCoverage } from './sensor-promote-io.mjs';
import { arkPackageVersion } from './skill-install.mjs';
import { loadTypeScript } from './typescript-host.mjs';
import { color } from './violations.mjs';

const DECLARATION_ONLY_SHAPES = new Set(['type', 'interface', 'enum', 'class']);

function unprobeable(root, inv, reason, symbolFile = null) {
  return {
    invariantId: inv.id,
    invariantHash: invariantIdentityHash(inv),
    layer: inv.provenance?.layer ?? null,
    sourceFile: inv.provenance?.sourceFile ?? null,
    mode: inv.mode ?? 'advisory',
    symbol: inv.coverage?.symbol ?? null,
    symbolFile,
    // Bound like any row: when the file changes, the reason may no longer hold.
    symbolFileHash: symbolFile ? hashProjectFile(root, symbolFile) : null,
    tests: [],
    baseline: null,
    wiring: null,
    mutants: [],
    verdict: 'unprobeable',
    reason,
  };
}

/** Resolve what to probe for one invariant, or the unprobeable row that says why not. */
function planTarget({ root, ts, inv, coverageRow, inputs, importers }) {
  const symbol = inv.coverage?.symbol;
  if (!symbol) return { row: unprobeable(root, inv, 'no-symbol') };
  const symbolFile = coverageRow?.symbolEvidenceFile ?? null;
  if (coverageRow?.shape && DECLARATION_ONLY_SHAPES.has(coverageRow.shape)) {
    return { row: unprobeable(root, inv, 'declaration-only', symbolFile) };
  }
  if (!symbolFile) return { row: unprobeable(root, inv, 'symbol-not-found') };
  let text;
  try {
    text = fs.readFileSync(path.join(root, symbolFile), 'utf8');
  } catch {
    return { row: unprobeable(root, inv, 'symbol-not-found', symbolFile) };
  }
  const found = findProbeSites(ts, symbolFile, text, symbol);
  if (!found.ok) return { row: unprobeable(root, inv, found.reason, symbolFile) };
  const named = inputs ? testFilesNamingInvariant(inv, inputs) : [];
  const tests = [...new Set([...named, ...(importers.get(symbolFile) ?? [])])].slice(0, INVARIANT_PROBE_MAX_TESTS);
  if (tests.length === 0) return { row: unprobeable(root, inv, 'no-covering-test', symbolFile) };
  return { target: { inv, symbol, symbolFile, text, found, tests } };
}

function outcomeToRun(outcome) {
  if (outcome === 'failed') return 'killed';
  if (outcome === 'passed') return 'survived';
  return outcome;
}

function outcomeToBaseline(outcome) {
  if (outcome === 'passed') return 'green';
  if (outcome === 'failed') return 'red';
  return outcome;
}

/** Run one target in the workspace. The copy's symbol file is restored after every edit. */
async function probeTarget(root, workspace, runner, target) {
  const cwd = path.join(workspace.project, path.relative(root, runner.pkgRoot));
  const files = target.tests.map((test) => normalize(path.relative(runner.pkgRoot, path.join(root, test))));
  const copyFile = path.join(workspace.project, target.symbolFile);
  const env = buildProbeEnv({ home: workspace.home, tmp: workspace.tmp });
  const run = (timeoutMs) => runCoveringTests({ runner, cwd, files, timeoutMs, env, scratch: workspace.tmp });
  const withText = async (text, timeoutMs) => {
    fs.writeFileSync(copyFile, text);
    try {
      return await run(timeoutMs);
    } finally {
      fs.writeFileSync(copyFile, target.text);
    }
  };
  const baseline = await run(PROBE_TIMEOUT_CEILING_MS);
  const wiring = { baseline: outcomeToBaseline(baseline.outcome) };
  const mutants = [];
  if (wiring.baseline === 'green') {
    const timeout = probeTimeoutMs(baseline.durationMs);
    const canary = canaryEdits(target.text, target.found.body);
    wiring.load = outcomeToRun((await withText(applyEdit(target.text, canary.load), timeout)).outcome);
    if (wiring.load === 'killed' || wiring.load === 'timeout') {
      wiring.reach = outcomeToRun((await withText(applyEdit(target.text, canary.reach), timeout)).outcome);
    }
    if (wiring.reach === 'killed' || wiring.reach === 'timeout') {
      for (const mutant of planMutants(target.found.sites)) {
        const mutated = applyEdit(target.text, mutant);
        const record = {
          id: mutant.id,
          operator: mutant.operator,
          line: mutant.line,
          column: mutant.column,
          original: mutant.original,
          replacement: mutant.replacement,
        };
        if (!parsesCleanly(workspace.ts, target.symbolFile, mutated)) {
          mutants.push({ ...record, status: 'invalid', durationMs: 0 });
          continue;
        }
        const result = await withText(mutated, timeout);
        mutants.push({ ...record, status: outcomeToRun(result.outcome), durationMs: result.durationMs });
      }
    }
  }
  const { verdict, reason } = foldVerdict(wiring, mutants);
  return {
    invariantId: target.inv.id,
    invariantHash: invariantIdentityHash(target.inv),
    layer: target.inv.provenance?.layer ?? null,
    sourceFile: target.inv.provenance?.sourceFile ?? null,
    mode: target.inv.mode ?? 'advisory',
    symbol: target.symbol,
    symbolFile: target.symbolFile,
    symbolFileHash: sha256Text(target.text),
    tests: target.tests.map((test) => ({ path: test, contentHash: hashProjectFile(root, test) ?? 'sha256:missing' })),
    baseline: { status: wiring.baseline, durationMs: baseline.durationMs },
    wiring: { load: wiring.load ?? null, reach: wiring.reach ?? null },
    mutants,
    verdict,
    reason,
  };
}

/** Persist under `.ark/`, merging rows for invariants this run did not touch. */
function writeArtifact(root, artifact, focus) {
  const absolute = path.join(root, INVARIANT_PROBE_ARTIFACT_PATH);
  const dir = path.dirname(absolute);
  fs.mkdirSync(dir, { recursive: true });
  const rootReal = fs.realpathSync(root);
  const dirReal = fs.realpathSync(dir);
  if (dirReal !== rootReal && !dirReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error(`${path.dirname(INVARIANT_PROBE_ARTIFACT_PATH)} resolves outside the project; refusing to write.`);
  }
  let rows = artifact.invariants;
  if (focus) {
    try {
      const previous = readInvariantProbeArtifact(JSON.parse(fs.readFileSync(absolute, 'utf8')));
      if (previous.ok) {
        const ids = new Set(rows.map((row) => row.invariantId));
        rows = [...previous.artifact.invariants.filter((row) => !ids.has(row.invariantId)), ...rows];
      }
    } catch {
      /* no previous artifact, or unreadable: this run's rows only */
    }
  }
  const merged = buildInvariantProbeArtifact({
    arkgateVersion: artifact.arkgateVersion,
    runner: artifact.runner,
    probedOn: artifact.probedOn,
    rows,
  });
  const temp = path.join(dir, `.invariant-probe.${process.pid}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(merged, null, 2)}\n`);
  fs.renameSync(temp, absolute);
  return INVARIANT_PROBE_ARTIFACT_PATH;
}

function refuse(args, reasonCode, reason) {
  if (args.json) {
    console.log(JSON.stringify({ probeInvariants: { notAScore: true, status: 'refused', reasonCode, reason } }, null, 2));
  } else {
    console.error(`${reason}`);
  }
  process.exitCode = 2;
}

function printReport(root, payload) {
  console.log(color.bold('Invariant probe (not a score)'));
  console.log(color.dim('  Ran the covering tests in a temporary copy. Your files were not changed.'));
  for (const row of payload.rows) {
    const mark =
      row.verdict === 'killed'
        ? color.green('caught')
        : row.verdict === 'survived' || row.verdict === 'not-reached'
          ? color.red(row.verdict)
          : color.dim(row.verdict);
    console.log(`  ${mark}  ${row.line}`);
  }
  if (payload.truncated > 0) {
    console.log(color.dim(`  ${payload.truncated} more invariant(s) past the ${INVARIANT_PROBE_MAX_TARGETS}-target cap were not probed. Probe them one at a time with --probe-invariants=<id>.`));
  }
  if (payload.written) {
    console.log(color.green(`  wrote ${payload.written}. Commit it so CI sees the same evidence.`));
  } else {
    console.log(color.dim(`  Report only. ${arkCommand(root, 'ark-check', '--probe-invariants --write')} saves ${INVARIANT_PROBE_ARTIFACT_PATH}; a fresh survived or not-reached row refuses promotion.`));
  }
}

export async function runProbeInvariants(args, readConfig) {
  const root = args.root;
  let config;
  try {
    config = readConfig(root, args.config);
  } catch (error) {
    refuse(args, 'PROBE_CONFIG_INVALID', error instanceof Error ? error.message : String(error));
    return;
  }
  const loaded = loadEffectiveArkRulesFromDisk(root, config);
  if (loaded.errors?.length) {
    refuse(args, 'PROBE_CONFIG_INVALID', 'ArkRules references failed to load, so no invariant can be probed.');
    return;
  }
  const focus = typeof args.probeInvariants === 'string' ? args.probeInvariants : null;
  const catalog = (loaded.arkRules.invariants ?? []).filter((inv) => !focus || inv.id === focus);
  if (catalog.length === 0) {
    refuse(
      args,
      'PROBE_NO_TARGETS',
      focus
        ? `No declared invariant with id ${JSON.stringify(focus)}.`
        : 'No ArkRules invariants are declared, so there is nothing to probe.'
    );
    return;
  }
  const loadedTs = await loadTypeScript(root);
  const ts = loadedTs?.ts;
  if (!ts || typeof ts.createSourceFile !== 'function') {
    refuse(args, 'PROBE_RUNNER_UNSUPPORTED', 'TypeScript could not be loaded, so the symbol cannot be located.');
    return;
  }
  const governedRel = collectGovernedFiles(root, config).map((file) => normalize(path.relative(root, file)));
  const evaluated = evaluateCatalogCoverage(root, config, { files: governedRel.map((p) => ({ path: p })) }, {
    ...loaded.arkRules,
    invariants: catalog,
  });
  const coverageById = new Map(evaluated.rows.map((row) => [row.invariantId, row]));
  const selected = catalog.slice(0, INVARIANT_PROBE_MAX_TARGETS);
  const truncated = catalog.length - selected.length;
  const symbolFiles = [...new Set(selected.map((inv) => coverageById.get(inv.id)?.symbolEvidenceFile).filter(Boolean))];
  const importers = testImportersOf({ root, ts, config, governed: new Set(governedRel), targets: symbolFiles }).byTarget;

  const rows = [];
  const targets = [];
  for (const inv of selected) {
    const planned = planTarget({ root, ts, inv, coverageRow: coverageById.get(inv.id), inputs: evaluated.inputs, importers });
    if (planned.row) rows.push(planned.row);
    else targets.push(planned.target);
  }

  let runnerInfo = null;
  if (targets.length > 0) {
    const runners = [];
    for (const target of targets) {
      const runner = detectRunner({ root, tests: target.tests, override: args.runner });
      if (!runner.ok) {
        refuse(args, runner.reasonCode, `${target.inv.id}: ${runner.reason}`);
        return;
      }
      runners.push(runner);
    }
    sweepStaleProbeWorkspaces();
    const workspace = createProbeWorkspace(root);
    if (!workspace.ok) {
      refuse(
        args,
        workspace.reasonCode,
        `The project is too large to copy for the probe (${workspace.files} files, ${Math.round(workspace.bytes / 1048576)} MiB; the limits are 20000 files and 256 MiB).`
      );
      return;
    }
    workspace.ts = ts;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        rows.push(await probeTarget(root, workspace, runners[index], targets[index]));
      }
    } finally {
      workspace.cleanup();
    }
    runnerInfo = { id: runners[0].id, version: runners[0].version ?? null };
  }

  const artifact = buildInvariantProbeArtifact({
    arkgateVersion: arkPackageVersion() ?? 'unknown',
    runner: runnerInfo,
    probedOn: new Date().toISOString().slice(0, 10),
    rows,
  });
  let written = null;
  if (args.write) {
    try {
      written = writeArtifact(root, artifact, focus);
    } catch (error) {
      refuse(args, 'PROBE_WRITE_FAILED', error instanceof Error ? error.message : String(error));
      return;
    }
  }
  const payload = {
    notAScore: true,
    status: 'complete',
    runner: artifact.runner,
    rows: artifact.invariants.map((row) => ({ ...row, line: probeRowLine(row) })),
    totals: artifact.totals,
    truncated,
    ...(written ? { written } : {}),
  };
  if (args.json) console.log(JSON.stringify({ probeInvariants: payload }, null, 2));
  else printReport(root, payload);
  process.exitCode = probeExitCode(artifact.invariants);
}
