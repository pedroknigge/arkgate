/**
 * Production deploy-path quality signals (install modularization).
 */
import fs from 'node:fs';
import path from 'node:path';
import { readPackageJson, packageScriptsHaveTypecheck } from './gate-files.mjs';

/**
 * Production deploy path quality (universal — any consumer repo).
 * Detects when the production build host runs ESLint / typecheck as part of
 * `build` (e.g. Next.js "Linting and checking validity of types") so failures
 * surface first on Vercel/Netlify/etc. unless CI/pre-merge runs the same checks.
 * Framework signals only (deps + scripts + config) — never project-specific.
 *
 * @returns {{
 *   embedsLintInBuild: boolean,
 *   embedsTypecheckInBuild: boolean,
 *   engines: string[],
 *   hasLintScript: boolean,
 *   hasTypecheckScript: boolean,
 *   ciRunsLint: boolean,
 *   ciRunsTypecheck: boolean,
 *   eslintIgnoreDuringBuilds: boolean,
 * }}
 */
export function detectDeployPathQuality(root) {
  const pkg = readPackageJson(root) || {};
  const deps = {
    ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
    ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
    ...(pkg.peerDependencies && typeof pkg.peerDependencies === 'object' ? pkg.peerDependencies : {}),
  };
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const buildScript = typeof scripts.build === 'string' ? scripts.build : '';

  const engines = [];
  // Next.js production build runs ESLint + typecheck by default (unless opted out).
  if (deps.next || /\bnext\s+build\b/.test(buildScript)) engines.push('next');
  // Nuxt 3+ can lint via modules; only flag when build clearly invokes nuxt build + eslint tooling present.
  if ((deps.nuxt || deps['nuxt3'] || /\bnuxt\s+build\b/.test(buildScript)) && (deps.eslint || hasEslintConfig(root))) {
    engines.push('nuxt');
  }
  // Create React App historically failed build on ESLint errors.
  if (deps['react-scripts'] || /\breact-scripts\s+build\b/.test(buildScript)) engines.push('cra');

  const eslintIgnoreDuringBuilds = engines.includes('next') && nextIgnoresEslintDuringBuilds(root);
  const embedsLintInBuild = engines.length > 0 && !eslintIgnoreDuringBuilds;
  // Next still typechecks during build even when eslint.ignoreDuringBuilds is true.
  const embedsTypecheckInBuild = engines.includes('next') || engines.includes('nuxt');

  const scriptHasLint = (s) =>
    Boolean(
      s &&
        ((typeof s.lint === 'string' && s.lint.trim()) ||
          (typeof s.eslint === 'string' && s.eslint.trim()) ||
          (typeof s['lint:ci'] === 'string' && s['lint:ci'].trim()) ||
          (typeof s['check:lint'] === 'string' && s['check:lint'].trim()))
    );

  let hasLintScript = scriptHasLint(scripts);
  let hasTypecheckScript = packageScriptsHaveTypecheck(scripts);
  const packageLintScripts = [];
  // Monorepo: package-level scripts count (apps/web, packages/ui, …).
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const candidates = [path.join(root, entry.name)];
      // one more level: packages/foo
      try {
        for (const child of fs.readdirSync(path.join(root, entry.name), { withFileTypes: true })) {
          if (child.isDirectory() && !child.name.startsWith('.')) {
            candidates.push(path.join(root, entry.name, child.name));
          }
        }
      } catch {
        /* ignore */
      }
      for (const dir of candidates) {
        const pj = path.join(dir, 'package.json');
        if (!fs.existsSync(pj)) continue;
        try {
          const nested = JSON.parse(fs.readFileSync(pj, 'utf8'));
          const ns = nested.scripts && typeof nested.scripts === 'object' ? nested.scripts : {};
          if (scriptHasLint(ns)) {
            hasLintScript = true;
            packageLintScripts.push(path.relative(root, dir).split(path.sep).join('/'));
          }
          if (packageScriptsHaveTypecheck(ns)) hasTypecheckScript = true;
          const nd = {
            ...(nested.dependencies || {}),
            ...(nested.devDependencies || {}),
          };
          if (nd.next && !engines.includes('next')) engines.push('next');
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  const ciTexts = collectCiWorkflowTexts(root);
  const ciJoined = ciTexts.join('\n');
  const ciRunsLint =
    ciTexts.length > 0 &&
    (/\bnpm\s+run\s+lint\b/i.test(ciJoined) ||
      /\bpnpm\s+(?:run\s+)?lint\b/i.test(ciJoined) ||
      /\byarn\s+(?:run\s+)?lint\b/i.test(ciJoined) ||
      /\bbun\s+run\s+lint\b/i.test(ciJoined) ||
      /\beslint\b/i.test(ciJoined) ||
      /\blint:ci\b/i.test(ciJoined) ||
      /\bcheck:lint\b/i.test(ciJoined) ||
      // package-level: working-directory + lint, or path/filter lint
      (packageLintScripts.length > 0 &&
        packageLintScripts.some((p) => ciJoined.includes(p) && /lint/i.test(ciJoined))));
  const ciRunsTypecheck =
    ciTexts.length > 0 &&
    (/\btypecheck\b/i.test(ciJoined) ||
      /\btype-check\b/i.test(ciJoined) ||
      /\bcheck:types\b/i.test(ciJoined) ||
      /\btsc\s+--noEmit\b/i.test(ciJoined));

  return {
    embedsLintInBuild,
    embedsTypecheckInBuild,
    engines,
    hasLintScript,
    hasTypecheckScript,
    ciRunsLint,
    ciRunsTypecheck,
    eslintIgnoreDuringBuilds,
    hasCiWorkflows: ciTexts.length > 0,
    packageLintScripts,
  };
}

function hasEslintConfig(root) {
  return [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.json',
    '.eslintrc.cjs',
    '.eslintrc.js',
    '.eslintrc.yml',
    '.eslintrc.yaml',
  ].some((f) => fs.existsSync(path.join(root, f)));
}

/** next.config.* eslint.ignoreDuringBuilds: true → production build will not fail on ESLint. */
function nextIgnoresEslintDuringBuilds(root) {
  const names = [
    'next.config.ts',
    'next.config.mts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
  ];
  for (const name of names) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs.readFileSync(file, 'utf8');
      // Common patterns: ignoreDuringBuilds: true | ignoreDuringBuilds: true,
      if (/ignoreDuringBuilds\s*:\s*true/.test(text)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function collectCiWorkflowTexts(root) {
  const texts = [];
  const pushFile = (rel) => {
    try {
      const full = path.join(root, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        texts.push(fs.readFileSync(full, 'utf8'));
      }
    } catch {
      /* ignore */
    }
  };
  pushFile('.gitlab-ci.yml');
  pushFile('bitbucket-pipelines.yml');
  pushFile('azure-pipelines.yml');
  pushFile('.circleci/config.yml');
  const wfDir = path.join(root, '.github', 'workflows');
  try {
    if (fs.existsSync(wfDir)) {
      for (const f of fs.readdirSync(wfDir)) {
        if (!/\.ya?ml$/i.test(f)) continue;
        pushFile(path.join('.github', 'workflows', f));
      }
    }
  } catch {
    /* ignore */
  }
  return texts;
}

