#!/usr/bin/env node
/**
 * CI profile decision helper for .github/workflows/ci.yml.
 *
 * Tiers (mutually exclusive path classes; full_matrix overrides all of them):
 * - docs_only  — only markdown/docs/license surfaces; skip heavy matrices
 * - hygiene    — docs + package-lock.json (± package.json only when lock also
 *                changes) + allowlisted release-surface tests; still runs required
 *                build (typecheck + test:coverage) but skips onboarding, gallery,
 *                OS portability, packed consumer matrices. Root package.json alone
 *                stays on the code path (packaging fields need packed matrices).
 * - code       — any other product path (src/bin/templates/workflows/…); PR slim
 * - full_matrix — main push, release/full-matrix labels, or release-prep branches
 *
 * Usage:
 *   node scripts/ci-profile.mjs --json \
 *     --event pull_request --ref-name feat/x --head-ref feat/x \
 *     --labels '[]' --changed 'src/gate.ts' 'docs/README.md'
 *
 * Or read newline-separated changed paths from stdin when --changed is omitted
 * and stdin is not a TTY.
 *
 * Outputs either human lines or a single JSON object (--json) consumed by the
 * workflow step that writes GITHUB_OUTPUT.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SCRIPT = fileURLToPath(import.meta.url);

const FULL_TS_INCLUDE = [
  { node: 18, pm: { name: 'npm', version: '10.8.2' } },
  { node: 18, pm: { name: 'pnpm', version: '9.15.9' } },
  { node: 18, pm: { name: 'yarn', version: '4.17.1' } },
  { node: 20, pm: { name: 'npm', version: '10.8.2' } },
  { node: 20, pm: { name: 'pnpm', version: '9.15.9' } },
  { node: 20, pm: { name: 'yarn', version: '4.17.1' } },
  { node: 22, pm: { name: 'npm', version: '10.8.2' } },
  { node: 22, pm: { name: 'pnpm', version: '9.15.9' } },
  { node: 22, pm: { name: 'yarn', version: '4.17.1' } },
  { node: 24, pm: { name: 'npm', version: '10.8.2' } },
  { node: 24, pm: { name: 'pnpm', version: '9.15.9' } },
  { node: 24, pm: { name: 'yarn', version: '4.17.1' } },
];

const SLIM_TS_INCLUDE = [{ node: 20, pm: { name: 'npm', version: '10.8.2' } }];

const FULL_GALLERY = [
  { pm: { name: 'npm', version: '10.8.2' } },
  { pm: { name: 'pnpm', version: '9.15.9' } },
  { pm: { name: 'yarn', version: '4.17.1' } },
];

const SLIM_GALLERY = [{ pm: { name: 'npm', version: '10.8.2' } }];

const FULL_ONBOARDING = [
  'library/small',
  'library/medium',
  'library/large',
  'api/small',
  'api/medium',
  'api/large',
  'frontend/small',
  'frontend/medium',
  'frontend/large',
  'monorepo/small',
  'monorepo/medium',
  'monorepo/large',
];

const SLIM_ONBOARDING = ['library/small', 'api/small', 'frontend/small', 'monorepo/small'];

const NODE_VERSIONS = [18, 20, 22, 24];

/**
 * Supply-chain / release-surface unit tests that may ride with docs+lock PRs
 * without forcing the full product matrix (onboarding, gallery, OS portability).
 * Keep this list narrow — anything product-logic must stay on the code path.
 */
const HYGIENE_TEST_PATHS = new Set([
  'tests/unit/static-check/q06ReleaseSurfaces.test.ts',
]);

/**
 * Manifest / lock paths allowed on the hygiene tier (with or without docs).
 * Note: root package.json alone is NOT hygiene — see decideCiProfile (requires
 * package-lock.json in the same change set so packaging-only edits stay on code).
 */
const HYGIENE_MANIFEST_PATHS = new Set(['package.json', 'package-lock.json']);

/** @param {string} f */
export function isCodePath(f) {
  if (
    /^(src|bin|scripts|tests|packages|templates|schemas|examples|eval)\//.test(f) ||
    f.startsWith('.github/workflows/')
  ) {
    return true;
  }
  return [
    'package.json',
    'package-lock.json',
    'ark.config.json',
    'action.yml',
    'server.json',
  ].includes(f) || /^(tsconfig.*\.json|vitest.*\.(ts|mjs)|stryker.*\.(json|mjs)|\.npmrc)$/.test(f);
}

/** @param {string} f */
export function isDocsPath(f) {
  return (
    f.startsWith('docs/') ||
    f.endsWith('.md') ||
    /^(LICENSE|NOTICE)(\.|$)/i.test(f) ||
    f.startsWith('.github/ISSUE_TEMPLATE/') ||
    f.startsWith('.github/PULL_REQUEST_TEMPLATE')
  );
}

/**
 * Paths that may appear on a hygiene-tier PR (docs + lock/overrides + focused
 * release-surface tests). Any other path forces the code profile.
 * @param {string} f
 */
export function isHygienePath(f) {
  if (isDocsPath(f)) return true;
  if (HYGIENE_MANIFEST_PATHS.has(f)) return true;
  if (HYGIENE_TEST_PATHS.has(f)) return true;
  return false;
}

/** @param {string} f */
export function isPerfPath(f) {
  return (
    f.startsWith('src/kernel/') ||
    f.startsWith('src/domain/') ||
    f === 'src/gate.ts' ||
    f === 'src/index.ts' ||
    f.startsWith('src/runtime/') ||
    f.startsWith('bin/') ||
    /scripts\/.*bench/.test(f) ||
    f.startsWith('scripts/hook') ||
    f.startsWith('scripts/ark-scale') ||
    f.startsWith('eval/performance/') ||
    f === '.github/workflows/ci.yml'
  );
}

/**
 * @param {{
 *   eventName: string;
 *   refName: string;
 *   headRef?: string;
 *   labels?: string[];
 *   changed: string[];
 * }} input
 */
export function decideCiProfile(input) {
  const eventName = input.eventName;
  const refName = input.refName;
  const headRef = input.headRef || '';
  const labels = input.labels ?? [];
  let changed = input.changed?.length ? [...input.changed] : ['.'];

  let fullMatrix = false;
  if (eventName === 'push' && refName === 'main') fullMatrix = true;
  if (labels.includes('full-matrix') || labels.includes('release')) fullMatrix = true;

  const branch = headRef || refName;
  if (
    /^(feat\/4\.1|feat\/.*release|release\/)/.test(branch) ||
    branch.includes('release-prepare')
  ) {
    fullMatrix = true;
  }

  let code = false;
  let docsSeen = false;
  let nonDocs = false;
  let perf = false;
  let allHygiene = true;
  let hygieneManifestOrTest = false;
  for (const f of changed) {
    if (isCodePath(f)) code = true;
    if (isPerfPath(f)) perf = true;
    if (isDocsPath(f)) docsSeen = true;
    else nonDocs = true;
    if (!isHygienePath(f)) allHygiene = false;
    if (HYGIENE_MANIFEST_PATHS.has(f) || HYGIENE_TEST_PATHS.has(f)) {
      hygieneManifestOrTest = true;
    }
  }

  let docsOnly = false;
  if (!code && docsSeen && !nonDocs) docsOnly = true;
  if (!code && !docsOnly) code = true;

  // Hygiene sits between pure docs-only and full code: only docs + lock
  // (± package.json when lock also changes) + allowlisted release-surface tests.
  // Pure docs stay docs_only. Path-only classifier: package.json alone is code
  // so packaging-sensitive fields (exports/files/bin/engines) still run packed matrices.
  let hygiene = false;
  if (!fullMatrix && !docsOnly && allHygiene && hygieneManifestOrTest) {
    const hasPackageJson = changed.includes('package.json');
    const hasLock = changed.includes('package-lock.json');
    if (!(hasPackageJson && !hasLock)) {
      hygiene = true;
    }
  }

  if (fullMatrix) {
    code = true;
    docsOnly = false;
    hygiene = false;
    perf = true;
  }

  let runPacked = true;
  let runOnboarding = true;
  if (docsOnly || hygiene) {
    runPacked = false;
    runOnboarding = false;
    perf = false;
  }

  const failFast = !fullMatrix;
  const confidenceCmd = fullMatrix ? 'npm run test:confidence' : 'npm run test:coverage';
  const tsCompatInclude = fullMatrix ? FULL_TS_INCLUDE : SLIM_TS_INCLUDE;
  const galleryInclude = fullMatrix ? FULL_GALLERY : SLIM_GALLERY;
  const onboardingFixtures = fullMatrix ? FULL_ONBOARDING : SLIM_ONBOARDING;

  /** @type {'full_matrix' | 'docs_only' | 'hygiene' | 'code'} */
  let profile = 'code';
  if (fullMatrix) profile = 'full_matrix';
  else if (docsOnly) profile = 'docs_only';
  else if (hygiene) profile = 'hygiene';

  return {
    full_matrix: fullMatrix,
    // `code` means "touched a code-classified path" (path diagnostic), not the
    // CI tier. Prefer `profile` / `hygiene` / `docs_only` / `run_*` for scheduling.
    code,
    docs_only: docsOnly,
    hygiene,
    profile,
    run_perf: perf,
    run_packed: runPacked,
    run_onboarding: runOnboarding,
    confidence_cmd: confidenceCmd,
    fail_fast: failFast,
    ts_compat_include: tsCompatInclude,
    gallery_include: galleryInclude,
    onboarding_fixtures: onboardingFixtures,
    node_versions: NODE_VERSIONS,
    branch,
  };
}

function parseLabels(raw) {
  if (!raw || raw === 'null' || raw === 'undefined') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed == null) return [];
  } catch {
    // fall through — comma-separated
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readStdinLines() {
  if (process.stdin.isTTY) return [];
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks)
    .toString('utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean', default: false },
      event: { type: 'string', default: 'pull_request' },
      'ref-name': { type: 'string', default: 'feature' },
      'head-ref': { type: 'string', default: '' },
      labels: { type: 'string', default: '[]' },
      changed: { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`Usage: node scripts/ci-profile.mjs [--json] --event <name> --ref-name <ref> [--head-ref <ref>] [--labels JSON] [--changed path ...]`);
    return 0;
  }

  let changed = values.changed ?? [];
  if (changed.length === 0) {
    changed = await readStdinLines();
  }

  const profile = decideCiProfile({
    eventName: values.event,
    refName: values['ref-name'],
    headRef: values['head-ref'],
    labels: parseLabels(values.labels),
    changed,
  });

  if (values.json) {
    console.log(JSON.stringify(profile));
  } else {
    for (const [key, value] of Object.entries(profile)) {
      const rendered = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(`${key}=${rendered}`);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
