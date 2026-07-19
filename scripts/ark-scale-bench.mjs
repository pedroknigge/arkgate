#!/usr/bin/env node
/** Reproducible cold, one-shot-warm, and canonical resolved-analysis benchmark. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const __dirname = path.dirname(SCRIPT);
const REPO = path.resolve(__dirname, '..');
const CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const WORKER = path.join(REPO, 'scripts', 'ark-scale-worker.mjs');
const BUDGETS = path.join(REPO, 'eval', 'performance', 'budgets.v2.json');

function parseArgs(argv) {
  const out = {
    sizes: [1000, 10000, 50000],
    runs: 5,
    json: false,
    keep: false,
    failBudget: false,
    outDir: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--fail-budget') out.failBudget = true;
    else if (a === '--sizes') out.sizes = String(argv[++i] || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    else if (a === '--runs') out.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  if (out.sizes.length === 0) out.sizes = [1000];
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFixture(root, n) {
  for (const directory of [
    'src/domain',
    'src/services',
    'src/adapters',
    'src/components',
    'packages/core/src/domain',
    'packages/api/src/services',
    'packages/web/src/components',
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify(
      {
        include: ['src', 'packages'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**', 'packages/*/src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/services/**', 'packages/*/src/services/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
          { name: 'PresentationAdapters', patterns: ['src/components/**', 'packages/*/src/components/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      },
      null,
      2
    )
  );
  writeJson(path.join(root, 'package.json'), {
    name: 'ark-scale-fixture',
    private: true,
    type: 'module',
    workspaces: ['packages/*'],
  });
  writeJson(path.join(root, 'packages/core/package.json'), { name: '@ark-scale/core', private: true, type: 'module' });
  writeJson(path.join(root, 'packages/api/package.json'), {
    name: '@ark-scale/api', private: true, type: 'module', dependencies: { '@ark-scale/core': 'workspace:*' },
  });
  writeJson(path.join(root, 'packages/web/package.json'), {
    name: '@ark-scale/web', private: true, type: 'module', dependencies: { '@ark-scale/api': 'workspace:*' },
  });
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  writeJson(path.join(root, 'tsconfig.json'), {
    compilerOptions: {
      baseUrl: '.',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      paths: {
        '@shared/*': ['src/domain/*'],
        '@core/*': ['packages/core/src/*'],
        '@api/*': ['packages/api/src/*'],
      },
    },
    include: ['src', 'packages'],
  });
  fs.writeFileSync(path.join(root, 'src/domain/shared.ts'), 'export type Shared = { readonly id: string };\n');
  try {
    fs.symlinkSync(path.join(root, 'packages', 'core'), path.join(root, 'packages', 'core-link'), 'junction');
  } catch {
    // A symlink is a fixture signal; filesystems without support still exercise the remaining tree.
  }
  const roots = [
    'src/domain', 'src/services', 'src/adapters', 'src/components',
    'packages/core/src/domain', 'packages/api/src/services', 'packages/web/src/components',
  ];
  const extensions = ['.ts', '.mts', '.cts', '.js'];
  for (let i = 0; i < n; i++) {
    const directory = roots[i % roots.length];
    const extension = extensions[i % extensions.length];
    const file = `f${i}${extension}`;
    const previous = i > 0 && Math.floor(i / roots.length) === Math.floor((i - 1) / roots.length)
      ? `import { value${i - 1} } from './f${i - 1}${extensions[(i - 1) % extensions.length]}';\n`
      : '';
    const alias = i % 29 === 0 ? "import type { Shared } from '@shared/shared';\n" : '';
    const suffix = i > 0 && previous ? ` + value${i - 1}` : '';
    fs.writeFileSync(
      path.join(root, directory, file),
      `${previous}${alias}export const value${i} = ${i}${suffix};\nexport type Model${i} = { id: string };\n`
    );
  }
}

function sourceFiles(root) {
  const out = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'core-link') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(entry.name)) out.push(absolute);
    }
  };
  visit(root);
  return out.sort();
}

function parsePeakRss(stderr) {
  if (process.platform === 'linux') {
    const kib = stderr.trim().split(/\s+/).at(-1);
    return /^\d+$/.test(kib || '') ? Number(kib) * 1024 : null;
  }
  const match = stderr.match(/(\d+)\s+maximum resident set size/);
  return match ? Number(match[1]) : null;
}

function runTimed(command, args, root) {
  const start = process.hrtime.bigint();
  const useLinuxTime = process.platform === 'linux';
  const result = spawnSync(useLinuxTime ? '/usr/bin/time' : command, useLinuxTime ? ['-f', '%M', command, ...args] : args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return {
    status: result.status ?? 1,
    ms,
    peakRssBytes: useLinuxTime ? parsePeakRss(result.stderr || '') : null,
    stdout: result.stdout || '',
    stderrTail: (result.stderr || '').slice(-200),
  };
}

function runCheck(root, noCache = false) {
  return runTimed(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', ...(noCache ? ['--no-cache'] : [])],
    root
  );
}

function runCanonicalResolvedAnalysis(root) {
  const files = sourceFiles(root);
  const changedFile = path.relative(root, files[Math.floor(files.length / 2)]).split(path.sep).join('/');
  const result = runTimed(process.execPath, [WORKER, '--root', root, '--change', changedFile], root);
  let payload = null;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch {
    // Kept as a failed sample below.
  }
  return { ...result, ...payload };
}

function summary(samples) {
  const times = samples.map((sample) => sample.ms).filter(Number.isFinite);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    samples,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.at(-1) ?? null,
    minMs: sorted[0] ?? null,
    failures: samples.filter((sample) => sample.status !== 0).length,
    peakRssBytes: Math.max(...samples.map((sample) => sample.peakRssBytes ?? 0)),
  };
}

function loadBudgets() {
  return JSON.parse(fs.readFileSync(BUDGETS, 'utf8'));
}

export function budgetFailures(report, budgets) {
  const failures = [];
  const cold = report.results.find((result) => result.size === budgets.scenarios.cold.size)?.cold;
  const canonicalResolvedAnalysis = report.results.find(
    (result) => result.size === budgets.scenarios.canonicalResolvedAnalysis.size
  )?.canonicalResolvedAnalysis;
  const oneShotWarm = report.results.find(
    (result) => result.size === budgets.scenarios.oneShotWarm.size
  )?.oneShotWarm;
  if (cold && cold.p95Ms > budgets.scenarios.cold.maxP95Ms) failures.push(`cold p95 ${cold.p95Ms}ms exceeds ${budgets.scenarios.cold.maxP95Ms}ms`);
  if (
    canonicalResolvedAnalysis &&
    Number.isFinite(budgets.scenarios.canonicalResolvedAnalysis.maxP95Ms) &&
    canonicalResolvedAnalysis.p95Ms >= budgets.scenarios.canonicalResolvedAnalysis.maxP95Ms
  ) {
    failures.push(
      `canonical resolved analysis p95 ${canonicalResolvedAnalysis.p95Ms}ms is not below ${budgets.scenarios.canonicalResolvedAnalysis.maxP95Ms}ms`
    );
  }
  if (oneShotWarm && oneShotWarm.p95Ms > budgets.scenarios.oneShotWarm.maxP95Ms) failures.push(`one-shot warm p95 ${oneShotWarm.p95Ms}ms exceeds ${budgets.scenarios.oneShotWarm.maxP95Ms}ms`);
  for (const result of report.results) {
    if (result.oneShotWarm.cacheMode !== budgets.scenarios.oneShotWarm.expectedCacheMode) failures.push(`one-shot warm cache mode is ${result.oneShotWarm.cacheMode} for n=${result.size}`);
    if (budgets.scenarios.oneShotWarm.requireLegacyCacheAbsent && !result.oneShotWarm.legacyCacheAbsent) failures.push(`retired legacy cache exists for n=${result.size}`);
    if (budgets.scenarios.oneShotWarm.requireColdOutputParity && !result.oneShotWarm.coldOutputParity) failures.push(`cold/one-shot-warm semantic output differs for n=${result.size}`);
    const canonical = result.canonicalResolvedAnalysis;
    if (budgets.scenarios.canonicalResolvedAnalysis.requireOutputParity && !canonical.outputParity) failures.push(`canonical resolved output differs from the validated oracle for n=${result.size}`);
    if (budgets.scenarios.canonicalResolvedAnalysis.requireVerdictParity && !canonical.verdictParity) failures.push(`canonical resolved verdict differs from the validated oracle for n=${result.size}`);
    if (budgets.scenarios.canonicalResolvedAnalysis.requireFactsHashParity && !canonical.factsHashParity) failures.push(`canonical resolved facts hash differs from the validated oracle for n=${result.size}`);
    if (budgets.scenarios.canonicalResolvedAnalysis.requireCandidateTreeHashParity && !canonical.candidateTreeHashParity) failures.push(`canonical resolved tree hash differs from the validated oracle for n=${result.size}`);
    if (budgets.scenarios.canonicalResolvedAnalysis.requireCandidateIdentityChanged && !canonical.candidateIdentityChanged) failures.push(`canonical resolved candidate identity did not change for n=${result.size}`);
    if (!canonical.resolutionExcluded || canonical.timedStage !== 'analysis-only') failures.push(`canonical resolved measurement includes resolution for n=${result.size}`);
    if (result.peakRssBytes > budgets.scenarios.memory.maxPeakRssBytes) failures.push(`peak RSS ${result.peakRssBytes} exceeds ${budgets.scenarios.memory.maxPeakRssBytes}`);
    if (result.status !== 0) failures.push(`scenario failure for n=${result.size}`);
  }
  return failures;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.outDir
    ? path.resolve(args.outDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scale-'));
  fs.mkdirSync(base, { recursive: true });

  const budgets = loadBudgets();
  const results = [];
  for (const size of args.sizes) {
    const root = path.join(base, `n${size}`);
    fs.rmSync(root, { recursive: true, force: true });
    writeFixture(root, size);
    const cachePath = path.join(root, 'node_modules', '.cache', 'ark-check.json');
    fs.rmSync(cachePath, { force: true });
    const cold = summary(Array.from({ length: args.runs }, () => runCheck(root, true)));
    const oneShotWarmPrime = runCheck(root);
    const oneShotWarm = summary(Array.from({ length: args.runs }, () => runCheck(root)));
    const reference = cold.samples[0];
    const matchesReference = (sample) =>
      sample.status === reference?.status && sample.stdout === reference?.stdout;
    oneShotWarm.cacheMode = 'none';
    oneShotWarm.primeStatus = oneShotWarmPrime.status;
    oneShotWarm.legacyCacheAbsent = !fs.existsSync(cachePath);
    oneShotWarm.coldOutputParity = Boolean(
      reference &&
        cold.samples.every(matchesReference) &&
        matchesReference(oneShotWarmPrime) &&
        oneShotWarm.samples.every(matchesReference)
    );
    const canonicalResolvedAnalysisRuns = args.failBudget
      ? size === budgets.scenarios.canonicalResolvedAnalysis.size
        ? Math.max(args.runs, budgets.sampling.minCanonicalResolvedAnalysisRuns ?? args.runs)
        : 1
      : args.runs;
    runCanonicalResolvedAnalysis(root); // primes the canonical worker path outside measured samples
    const canonicalResolvedAnalysis = summary(
      Array.from({ length: canonicalResolvedAnalysisRuns }, () =>
        runCanonicalResolvedAnalysis(root)
      )
    );
    for (const field of [
      'outputParity',
      'verdictParity',
      'factsHashParity',
      'candidateTreeHashParity',
      'candidateIdentityChanged',
      'resolutionExcluded',
    ]) {
      canonicalResolvedAnalysis[field] = canonicalResolvedAnalysis.samples.every(
        (sample) => sample[field] === true
      );
    }
    canonicalResolvedAnalysis.timedStage = canonicalResolvedAnalysis.samples.every(
      (sample) => sample.timedStage === 'analysis-only'
    )
      ? 'analysis-only'
      : 'mixed';
    const peakRssBytes = Math.max(
      cold.peakRssBytes,
      oneShotWarm.peakRssBytes,
      canonicalResolvedAnalysis.peakRssBytes
    );
    results.push({
      size,
      runs: args.runs,
      canonicalResolvedAnalysisRuns,
      status:
        cold.failures + oneShotWarmPrime.status + oneShotWarm.failures + canonicalResolvedAnalysis.failures === 0
          ? 0
          : 1,
      cold,
      oneShotWarm,
      canonicalResolvedAnalysis,
      peakRssBytes,
      // Compatibility summary for the former Q5 contract.
      p50Ms: cold.p50Ms,
      p95Ms: cold.p95Ms,
    });
  }

  const report = {
    schemaVersion: 3,
    tool: 'ark-scale-bench',
    runner: { platform: process.platform, arch: process.arch, node: process.version },
    budgets: { schemaVersion: budgets.schemaVersion, path: path.relative(REPO, BUDGETS) },
    results,
    generatedAt: new Date().toISOString(),
  };
  const failures = budgetFailures(report, budgets);
  report.ok = failures.length === 0;
  report.failures = failures;

  if (!args.keep && !args.outDir) {
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      /* keep */
    }
  }

  if (args.out) {
    const target = path.resolve(args.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Ark scale bench (Q5)');
    for (const row of results) {
      console.log(
        `  n=${row.size} cold p95=${row.cold.p95Ms?.toFixed(1)}ms one-shot-warm p95=${row.oneShotWarm.p95Ms?.toFixed(1)}ms ` +
          `canonical-analysis p95=${row.canonicalResolvedAnalysis.p95Ms?.toFixed(1)}ms cacheMode=${row.oneShotWarm.cacheMode} parity=${row.canonicalResolvedAnalysis.outputParity} rss=${row.peakRssBytes} status=${row.status}`
      );
    }
  }

  if (args.failBudget && failures.length > 0) {
    console.error(`Budget fail: ${failures.join('; ')}`);
    process.exitCode = 1;
  }
  if (results.some((result) => !Number.isFinite(result.cold.p50Ms) || result.peakRssBytes <= 0)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  main();
}
