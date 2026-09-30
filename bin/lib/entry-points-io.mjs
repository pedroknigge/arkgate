/**
 * Entry evidence for the files-nothing-imports advisory (ADR 0037 D3).
 *
 * A closed list of sources, each with a `source` label: package.json fields
 * and scripts (plus CI workflow run steps), framework conventions, the
 * arkRun / arkOrder / slice-wall roots in ark.config.json, config and setup
 * files (and the source files a config file names), ambient declaration files,
 * and the optional `.ark/entry-points.json` sidecar. Reads are bounded. A file
 * any source covers is never listed. Advisory input only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectWorkspaces, globToRegExp } from '../ark-shared.mjs';

export const ENTRY_POINTS_SIDECAR = '.ark/entry-points.json';
const SIDECAR_MAX_BYTES = 64 * 1024;
const SIDECAR_MAX_ENTRIES = 200;
const MAX_PACKAGES = 200;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_WORKFLOWS = 50;
const SOURCE_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const BUILT_DIRS = ['dist', 'build', 'lib', 'out'];
const CONFIG_FILE = /(?:^|\/)[^/]+\.config\.[cm]?[jt]s$/;
const SETUP_FILE = /(?:^|\/)(?:vitest\.setup|jest\.setup|setupTests)\.[cm]?[jt]sx?$/;
const NEXT_ROUTE =
  /^(?:src\/)?app\/(?:.*\/)?(?:page|layout|template|loading|error|global-error|not-found|default|route|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.[cm]?[jt]sx?$/;
const NEXT_PAGES = /^(?:src\/)?pages\//;
const NEXT_ROOT_FILE = /^(?:src\/)?(?:middleware|proxy|instrumentation|instrumentation-client|mdx-components)\.[cm]?[jt]sx?$/;
const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/;
const PATH_TOKEN = /[\w@.][\w@./-]*\.[cm]?[jt]sx?(?![\w/])/g;
const STRING_LITERAL = /(['"`])([^'"`\n]{1,300})\1/g;
const KEY_VALUE = /(?:(['"])([^'"\n]{1,200})\1|([A-Za-z_$][\w$]*))\s*:\s*(['"])([^'"\n]{1,300})\4/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readText(absolute, max = MAX_TEXT_BYTES) {
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > max) return null;
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

function readJson(absolute) {
  const text = readText(absolute);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** tsconfig is JSONC: drop comments and trailing commas before parsing. */
function readJsonc(absolute) {
  const text = readText(absolute);
  if (text == null) return null;
  const stripped = text
    .replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match, quoted) => quoted ?? '')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/** Repo-relative, posix, no leading `./`; null when it leaves the root. */
function joinRel(base, rel) {
  const raw = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  const joined = path.posix.normalize(base === '.' || base === '' ? raw : `${base}/${raw}`);
  if (joined === '..' || joined.startsWith('../')) return null;
  return joined.replace(/^\.\//, '');
}

function stripSourceExt(rel) {
  return rel.replace(DECLARATION_FILE, '').replace(SOURCE_FILE, '');
}

/** Governed file for a path stem: exact, then with a source extension, then as a directory index. */
export function probeGoverned(stem, governed) {
  if (!stem) return null;
  if (governed.has(stem)) return stem;
  for (const ext of SOURCE_EXT) if (governed.has(`${stem}${ext}`)) return `${stem}${ext}`;
  for (const ext of SOURCE_EXT) if (governed.has(`${stem}/index${ext}`)) return `${stem}/index${ext}`;
  return null;
}

function packageRoots(root, governed) {
  const roots = new Set(['.']);
  let dirs = [];
  try {
    dirs = detectWorkspaces(root);
  } catch {
    dirs = [];
  }
  const hasGovernedUnder = (dir) => {
    const prefix = `${dir}/`;
    for (const file of governed) if (file.startsWith(prefix)) return true;
    return false;
  };
  const add = (dir) => {
    if (roots.size < MAX_PACKAGES && hasGovernedUnder(dir)) roots.add(dir);
  };
  for (const dir of dirs) {
    const absolute = path.join(root, dir);
    if (fs.existsSync(path.join(absolute, 'package.json'))) {
      add(dir);
      continue;
    }
    let children = [];
    try {
      children = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      children = [];
    }
    for (const child of children) {
      if (!child.isDirectory() || child.name.startsWith('.') || child.name === 'node_modules') continue;
      if (fs.existsSync(path.join(absolute, child.name, 'package.json'))) add(`${dir}/${child.name}`);
    }
  }
  return [...roots].sort();
}

function stringLeaves(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringLeaves(item, out);
  return out;
}

function tsOutput(root, pkgRoot, ts) {
  const file = path.join(root, pkgRoot, 'tsconfig.json');
  let options;
  if (ts?.readConfigFile && ts?.sys?.readFile) {
    options = ts.readConfigFile(file, ts.sys.readFile)?.config?.compilerOptions;
  } else {
    options = readJsonc(file)?.compilerOptions;
  }
  const clean = (value) =>
    typeof value === 'string' && value.length > 0 ? value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '') : null;
  return { outDir: clean(options?.outDir), rootDir: clean(options?.rootDir) };
}

/** Config files at a package root: their literals name entries and built-name maps. */
function scanConfigFiles(root, pkgRoot, governed) {
  const named = new Set();
  const outNames = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(path.join(root, pkgRoot), { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !CONFIG_FILE.test(entry.name)) continue;
    const text = readText(path.join(root, pkgRoot, entry.name));
    if (text == null) continue;
    for (const match of text.matchAll(KEY_VALUE)) {
      const key = match[2] ?? match[3];
      const target = probeGoverned(stripSourceExt(joinRel(pkgRoot, match[5]) ?? ''), governed);
      if (key && target && !outNames.has(key)) outNames.set(key, target);
    }
    for (const match of text.matchAll(STRING_LITERAL)) {
      const literal = match[2];
      if (!literal.includes('/') && !SOURCE_FILE.test(literal)) continue;
      const target = probeGoverned(stripSourceExt(joinRel(pkgRoot, literal) ?? ''), governed);
      if (!target) continue;
      named.add(target);
      const stem = path.posix.basename(stripSourceExt(target));
      if (!outNames.has(stem)) outNames.set(stem, target);
    }
  }
  return { named, outNames };
}

/**
 * Built path (`dist/x.js`) or source path → governed source.
 * @returns {{ path: string } | { unmapped: string } | null} null = not ours to judge
 */
function mapToSource(rel, ctx) {
  if (rel.includes('*')) return { unmapped: 'pattern export' };
  const ext = path.posix.extname(rel);
  if (ext && !SOURCE_FILE.test(rel) && !DECLARATION_FILE.test(rel)) return null;
  if (ctx.governed.has(rel)) return { path: rel };
  const direct = probeGoverned(stripSourceExt(rel), ctx.governed);
  if (direct) return { path: direct };
  const builtDirs = [...new Set([ctx.outDir, ...BUILT_DIRS].filter(Boolean))];
  for (const built of builtDirs) {
    const prefix = `${joinRel(ctx.pkgRoot, built)}/`;
    if (!rel.startsWith(prefix)) continue;
    const rest = stripSourceExt(rel.slice(prefix.length));
    const viaBundler = ctx.outNames.get(rest);
    if (viaBundler) return { path: viaBundler };
    if (built === ctx.outDir && ctx.rootDir) {
      const viaTsconfig = probeGoverned(joinRel(ctx.pkgRoot, `${ctx.rootDir}/${rest}`), ctx.governed);
      if (viaTsconfig) return { path: viaTsconfig };
    }
    const viaSrc = probeGoverned(joinRel(ctx.pkgRoot, `src/${rest}`), ctx.governed);
    if (viaSrc) return { path: viaSrc };
    return { unmapped: 'built path maps to no governed source file' };
  }
  if (fs.existsSync(path.join(ctx.root, rel))) return null;
  return { unmapped: 'path does not exist' };
}

function dependencyNames(pkg) {
  return new Set(
    [pkg?.dependencies, pkg?.devDependencies, pkg?.peerDependencies]
      .flatMap((deps) => (deps && typeof deps === 'object' ? Object.keys(deps) : []))
  );
}

function viteEntries(root, pkgRoot, governed) {
  const html = readText(path.join(root, pkgRoot, 'index.html'));
  if (html == null) return [];
  const out = [];
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/type\s*=\s*["']module["']/i.test(tag[0])) continue;
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
    const target = src ? probeGoverned(stripSourceExt(joinRel(pkgRoot, src) ?? ''), governed) : null;
    if (target) out.push(target);
  }
  return out;
}

function nestEntry(root, pkgRoot, governed) {
  const cli = readJson(path.join(root, pkgRoot, 'nest-cli.json'));
  const sourceRoot = typeof cli?.sourceRoot === 'string' ? cli.sourceRoot : 'src';
  const entryFile = typeof cli?.entryFile === 'string' ? cli.entryFile : 'main';
  return probeGoverned(joinRel(pkgRoot, `${sourceRoot}/${entryFile}`), governed);
}

function workflowTexts(root) {
  const dir = path.join(root, '.github', 'workflows');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort().slice(0, MAX_WORKFLOWS);
  } catch {
    names = [];
  }
  return names.map((name) => readText(path.join(dir, name)) ?? '');
}

function arkConfigGlobs(config) {
  const globs = [
    ...(config?.arkRun?.kernelRoots ?? []),
    ...(config?.arkRun?.compositionRoots ?? []),
    ...(config?.arkOrder?.planeRoots ?? []),
  ];
  for (const rule of Array.isArray(config?.rules) ? config.rules : []) {
    const stopAt = rule?.sharedImportsSlice?.stopAt;
    if (Array.isArray(stopAt)) globs.push(...stopAt);
  }
  return globs.filter((glob) => typeof glob === 'string' && glob.length > 0);
}

function compileGlob(glob) {
  try {
    return globToRegExp(glob);
  } catch {
    return null;
  }
}

/**
 * Optional user-declared entries. Malformed → suppresses nothing; a line says so.
 * @param {string} root
 * @param {string} today YYYY-MM-DD, supplied by the caller (no clock here)
 */
export function loadEntryPointsSidecar(root, today) {
  const absolute = path.join(root, ENTRY_POINTS_SIDECAR);
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return { status: 'absent', active: [], expired: [] };
  }
  const malformed = (why) => ({
    status: 'malformed',
    active: [],
    expired: [],
    note: `${ENTRY_POINTS_SIDECAR} was not used (${why}). It suppresses nothing until it is fixed.`,
  });
  if (!stat.isFile() || stat.size > SIDECAR_MAX_BYTES) return malformed('larger than 64 KiB');
  const doc = readJson(absolute);
  if (!doc || doc.schemaVersion !== '1' || !Array.isArray(doc.entryPoints)) {
    return malformed('expected { "schemaVersion": "1", "entryPoints": [...] }');
  }
  if (doc.entryPoints.length > SIDECAR_MAX_ENTRIES) return malformed('more than 200 entries');
  const active = [];
  const expired = [];
  for (const row of doc.entryPoints) {
    const glob = typeof row?.glob === 'string' ? row.glob.trim() : '';
    const reason = typeof row?.reason === 'string' ? row.reason.trim() : '';
    const reviewBy = row?.reviewBy;
    if (!glob || !reason || (reviewBy !== undefined && (typeof reviewBy !== 'string' || !DATE.test(reviewBy)))) {
      return malformed('every entry needs a glob and a reason; reviewBy is YYYY-MM-DD');
    }
    if (reviewBy !== undefined && typeof today === 'string' && reviewBy < today) expired.push({ glob, reason, reviewBy });
    else active.push({ glob, reason, ...(reviewBy ? { reviewBy } : {}) });
  }
  return { status: 'loaded', active, expired };
}

/**
 * @param {string} root
 * @param {{ governed: string[], config?: object, ts?: object, today?: string }} input
 * @returns {{
 *   entries: Map<string, string>,
 *   unmapped: Array<{ declared: string, source: string, reason: string }>,
 *   frameworks: string[],
 *   sidecar: ReturnType<typeof loadEntryPointsSidecar>,
 *   expiredByPath: Map<string, string[]>,
 * }}
 */
export function collectEntryPoints(root, input) {
  const governed = new Set(input.governed);
  const entries = new Map();
  const unmapped = [];
  const frameworks = new Set();
  const cover = (file, source) => {
    if (file && governed.has(file) && !entries.has(file)) entries.set(file, source);
  };
  const workflows = workflowTexts(root);

  for (const pkgRoot of packageRoots(root, governed)) {
    const pkg = readJson(path.join(root, pkgRoot, 'package.json'));
    const { named, outNames } = scanConfigFiles(root, pkgRoot, governed);
    const ctx = { root, pkgRoot, governed, outNames, ...tsOutput(root, pkgRoot, input.ts) };
    if (pkg) {
      const fields = [pkg.main, pkg.module, pkg.types, pkg.typings, pkg.browser, pkg.bin, pkg.exports];
      for (const leaf of stringLeaves(fields)) {
        const rel = joinRel(pkgRoot, leaf);
        const mapped = rel ? mapToSource(rel, ctx) : null;
        if (mapped?.path) cover(mapped.path, 'package-json');
        else if (mapped?.unmapped) unmapped.push({ declared: rel, source: 'package-json', reason: mapped.unmapped });
      }
      for (const script of stringLeaves(pkg.scripts ?? {})) {
        for (const token of script.match(PATH_TOKEN) ?? []) {
          const rel = joinRel(pkgRoot, token);
          const mapped = rel ? mapToSource(rel, ctx) : null;
          if (mapped?.path) cover(mapped.path, 'package-scripts');
        }
      }
    }
    if (pkgRoot === '.') {
      for (const text of workflows) {
        for (const token of text.match(PATH_TOKEN) ?? []) {
          const rel = joinRel('.', token);
          const mapped = rel ? mapToSource(rel, ctx) : null;
          if (mapped?.path) cover(mapped.path, 'package-scripts');
        }
      }
    }
    for (const file of named) cover(file, 'config-file');

    const deps = dependencyNames(pkg);
    const prefix = pkgRoot === '.' ? '' : `${pkgRoot}/`;
    const local = (file) => (file.startsWith(prefix) ? file.slice(prefix.length) : null);
    const nextConfig = ['js', 'mjs', 'cjs', 'ts', 'mts'].some((ext) =>
      fs.existsSync(path.join(root, pkgRoot, `next.config.${ext}`))
    );
    if (deps.has('next') || nextConfig) {
      frameworks.add('next');
      for (const file of governed) {
        const rest = local(file);
        if (rest && (NEXT_ROUTE.test(rest) || NEXT_PAGES.test(rest) || NEXT_ROOT_FILE.test(rest))) cover(file, 'framework');
      }
    }
    const vite = viteEntries(root, pkgRoot, governed);
    if (vite.length > 0 || deps.has('vite')) frameworks.add('vite');
    for (const file of vite) cover(file, 'framework');
    if (deps.has('@nestjs/core')) {
      frameworks.add('nest');
      cover(nestEntry(root, pkgRoot, governed), 'framework');
    }
    if ([...deps].some((name) => name === 'storybook' || name.startsWith('@storybook/'))) frameworks.add('storybook');
  }
  if (fs.existsSync(path.join(root, 'vercel.json'))) {
    frameworks.add('vercel');
    for (const file of governed) if (file.startsWith('api/')) cover(file, 'framework');
  }

  const arkGlobs = arkConfigGlobs(input.config).map(compileGlob).filter(Boolean);
  const sidecar = loadEntryPointsSidecar(root, input.today);
  const active = sidecar.active.map((row) => compileGlob(row.glob)).filter(Boolean);
  const expired = sidecar.expired.map((row) => ({ row, re: compileGlob(row.glob) })).filter((item) => item.re);
  const expiredByPath = new Map();
  for (const file of governed) {
    if (STORY_FILE.test(file)) cover(file, 'framework');
    if (CONFIG_FILE.test(file) || SETUP_FILE.test(file)) cover(file, 'config-file');
    if (arkGlobs.some((re) => re.test(file))) cover(file, 'ark-config');
    if (active.some((re) => re.test(file))) cover(file, 'sidecar');
    for (const { row, re } of expired) {
      if (!re.test(file)) continue;
      const notes = expiredByPath.get(file) ?? [];
      notes.push(`its ${ENTRY_POINTS_SIDECAR} entry (${row.glob}) passed reviewBy ${row.reviewBy}`);
      expiredByPath.set(file, notes);
    }
  }
  unmapped.sort((left, right) => (left.declared < right.declared ? -1 : left.declared > right.declared ? 1 : 0));
  return { entries, unmapped, frameworks: [...frameworks].sort(), sidecar, expiredByPath };
}

/** Ambient declaration files (`declare global` / `declare module`), checked lexically. */
export function ambientEntries(root, candidates) {
  const out = [];
  for (const rel of candidates) {
    const text = readText(path.join(root, rel));
    if (text && /\bdeclare\s+(?:global\b|module\s+['"])/.test(text)) out.push(rel);
  }
  return out;
}

/** Entry counts per source label, for the evidence line. */
export function entriesBySource(entries) {
  const bySource = {};
  for (const source of entries.values()) bySource[source] = (bySource[source] ?? 0) + 1;
  return bySource;
}
