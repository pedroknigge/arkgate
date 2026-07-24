/**
 * Field-install surfaces: baseline flag sync, package pin, false-green contract risk.
 *
 * Kept out of agent-gates.mjs so gate install / MCP / skills stay scannable.
 * Zero coupling to template emission — pure-ish FS helpers + package.json mutators.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function arkPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__packageRoot, 'package.json'), 'utf8')
    );
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  return -1;
}

function addDevDependencyPreservingFormat(source, version) {
  const multiline = /\r?\n/.test(source);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const rootPropertyIndent = source.match(/\r?\n([ \t]+)"[^"\n]+"\s*:/)?.[1] ?? '  ';
  const indentUnit = rootPropertyIndent;
  const encoded = JSON.stringify(version);
  const devMatch = /"devDependencies"\s*:\s*\{/.exec(source);

  if (devMatch) {
    const open = source.indexOf('{', devMatch.index);
    const close = matchingBrace(source, open);
    if (close === -1) throw new Error('Unbalanced devDependencies object');
    const body = source.slice(open + 1, close);
    if (!multiline) {
      const addition = body.trim() ? `,"arkgate":${encoded}` : `"arkgate":${encoded}`;
      return `${source.slice(0, close)}${addition}${source.slice(close)}`;
    }
    const beforeClose = source.slice(0, close);
    const trailing = beforeClose.match(/\s*$/)?.[0] ?? '';
    const contentEnd = close - trailing.length;
    const closingIndent = trailing.slice(trailing.lastIndexOf('\n') + 1);
    const propertyIndent = `${closingIndent}${indentUnit}`;
    const addition = body.trim()
      ? `,${eol}${propertyIndent}"arkgate": ${encoded}`
      : `${propertyIndent}"arkgate": ${encoded}`;
    return `${source.slice(0, contentEnd)}${addition}${eol}${closingIndent}${source.slice(close)}`;
  }

  const rootClose = source.lastIndexOf('}');
  if (rootClose === -1) throw new Error('Unbalanced package.json object');
  const rootBody = source.slice(0, rootClose);
  if (!multiline) {
    const separator = rootBody.trim().endsWith('{') ? '' : ',';
    return `${rootBody}${separator}"devDependencies":{"arkgate":${encoded}}${source.slice(rootClose)}`;
  }
  const trailing = rootBody.match(/\s*$/)?.[0] ?? '';
  const contentEnd = rootClose - trailing.length;
  const rootClosingIndent = trailing.slice(trailing.lastIndexOf('\n') + 1);
  const separator = source.slice(0, contentEnd).trimEnd().endsWith('{') ? '' : ',';
  const addition = `${separator}${eol}${rootPropertyIndent}"devDependencies": {${eol}${rootPropertyIndent}${indentUnit}"arkgate": ${encoded}${eol}${rootPropertyIndent}}`;
  return `${source.slice(0, contentEnd)}${addition}${eol}${rootClosingIndent}${source.slice(rootClose)}`;
}

/**
 * Ensure a check command string includes `--baseline <file>`.
 * Only touches strings that already invoke ark-check / arkgate-check.
 */
export function ensureBaselineFlagInCheckCommand(
  command,
  baselineRel = '.ark-baseline.json'
) {
  if (typeof command !== 'string' || !command.trim()) {
    return { command, changed: false };
  }
  if (/^\s*#/.test(command)) {
    return { command, changed: false };
  }
  if (!/\b(ark-check|arkgate-check)\b/.test(command)) {
    return { command, changed: false };
  }
  if (/(?:^|\s)--baseline(?:\s|=|$)/.test(command)) {
    return { command, changed: false };
  }
  const rel = baselineRel?.trim() || '.ark-baseline.json';
  return {
    command: `${command.trimEnd()} --baseline ${rel}`,
    changed: true,
  };
}

/**
 * After a baseline file is written, patch existing package.json scripts and
 * GitHub workflow lines that already run ark-check (no full --force reinstall).
 *
 * @param {string} root
 * @param {{ baselineRel?: string }} [opts]
 */
export function syncBaselineIntoCheckSurfaces(root, opts = {}) {
  const baselineRel =
    typeof opts.baselineRel === 'string' && opts.baselineRel.trim()
      ? opts.baselineRel.trim().replace(/^\.\/+/, '')
      : '.ark-baseline.json';
  const baselinePath = path.isAbsolute(baselineRel)
    ? baselineRel
    : path.join(root, baselineRel);
  if (!fs.existsSync(baselinePath)) {
    return { changed: [], skipped: ['no-baseline-file'] };
  }
  const flagRel = path.isAbsolute(baselineRel)
    ? path.relative(root, baselineRel).split(path.sep).join('/') || '.ark-baseline.json'
    : baselineRel.split(path.sep).join('/');
  const changed = [];
  const skipped = [];

  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts =
        pkg.scripts && typeof pkg.scripts === 'object' ? { ...pkg.scripts } : null;
      if (scripts) {
        let scriptChanged = false;
        for (const [name, value] of Object.entries(scripts)) {
          if (typeof value !== 'string') continue;
          const { command, changed: c } = ensureBaselineFlagInCheckCommand(value, flagRel);
          if (c) {
            scripts[name] = command;
            scriptChanged = true;
          }
        }
        if (scriptChanged) {
          fs.writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, scripts }, null, 2)}\n`);
          changed.push({ file: 'package.json', kind: 'scripts' });
        } else {
          skipped.push('package.json-no-ark-check-script-or-already-baselined');
        }
      }
    } catch {
      skipped.push('package.json-unreadable');
    }
  } else {
    skipped.push('no-package-json');
  }

  const wfDir = path.join(root, '.github', 'workflows');
  if (fs.existsSync(wfDir)) {
    for (const file of fs.readdirSync(wfDir)) {
      if (!/\.ya?ml$/i.test(file)) continue;
      const abs = path.join(wfDir, file);
      let text;
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      if (!/\b(ark-check|arkgate-check)\b/.test(text)) continue;
      const lines = text.split('\n');
      let fileChanged = false;
      const nextLines = lines.map((line) => {
        if (/^\s*#/.test(line)) return line;
        if (!/\b(ark-check|arkgate-check)\b/.test(line)) return line;
        if (/(?:^|\s)--baseline(?:\s|=|$)/.test(line)) return line;
        const { command, changed: c } = ensureBaselineFlagInCheckCommand(line, flagRel);
        if (c) {
          fileChanged = true;
          return command;
        }
        return line;
      });
      if (fileChanged) {
        fs.writeFileSync(abs, nextLines.join('\n'));
        changed.push({ file: path.join('.github', 'workflows', file), kind: 'workflow' });
      }
    }
  } else {
    skipped.push('no-workflows-dir');
  }

  return { changed, skipped };
}

/**
 * Read declared arkgate pin from consumer package.json (deps or devDeps).
 * @param {string} root
 * @returns {string|null}
 */
export function readDeclaredArkgatePin(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
    const dev = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};
    if (typeof deps.arkgate === 'string') return deps.arkgate;
    if (typeof dev.arkgate === 'string') return dev.arkgate;
    return null;
  } catch {
    return null;
  }
}

/**
 * Dual-truth: CLI/package-shipped version vs consumer package.json pin.
 * Used by doctor + upgrade so agents never confuse managed-asset CLI with CI pin.
 *
 * @param {string} root
 * @param {{ cliVersion?: string|null }} [opts]
 * @returns {{
 *   dualTruth: boolean,
 *   cliVersion: string|null,
 *   declaredPin: string|null,
 *   code: 'PACKAGE_PIN_BEHIND_CLI' | 'PACKAGE_PIN_MATCHES' | 'PACKAGE_PIN_ABSENT' | 'CLI_VERSION_UNKNOWN',
 *   note: string
 * }}
 */
export function describePackageVersionDualTruth(root, opts = {}) {
  const cliVersion =
    typeof opts.cliVersion === 'string' && opts.cliVersion
      ? opts.cliVersion
      : arkPackageVersion();
  const declaredPin = readDeclaredArkgatePin(root);
  if (!cliVersion) {
    return {
      dualTruth: false,
      cliVersion: null,
      declaredPin,
      code: 'CLI_VERSION_UNKNOWN',
      note: 'Could not read shipped arkgate package version for this CLI.',
    };
  }
  if (!declaredPin) {
    return {
      dualTruth: false,
      cliVersion,
      declaredPin: null,
      code: 'PACKAGE_PIN_ABSENT',
      note: 'No arkgate pin in package.json; CI/npx may not resolve this CLI version.',
    };
  }
  // Normalize ^x.y.z / ~x.y.z / x.y.z for comparison of leading version token.
  const pinCore = String(declaredPin).replace(/^[\^~>=<\s]+/, '').split(/\s+/)[0];
  const matches =
    pinCore === cliVersion ||
    pinCore.startsWith(`${cliVersion}.`) ||
    cliVersion.startsWith(pinCore.split('.').slice(0, 3).join('.'));
  // Dual-truth when declared pin is clearly older major/minor than CLI, or different major.
  const pinParts = pinCore.split('.').map((p) => Number.parseInt(p, 10));
  const cliParts = cliVersion.split('.').map((p) => Number.parseInt(p, 10));
  let behind = false;
  if (
    pinParts.length >= 1 &&
    cliParts.length >= 1 &&
    pinParts.every((n) => Number.isFinite(n)) &&
    cliParts.every((n) => Number.isFinite(n))
  ) {
    for (let i = 0; i < 3; i += 1) {
      const p = pinParts[i] ?? 0;
      const c = cliParts[i] ?? 0;
      if (p < c) {
        behind = true;
        break;
      }
      if (p > c) break;
    }
  } else if (!matches) {
    behind = true;
  }
  if (behind) {
    return {
      dualTruth: true,
      cliVersion,
      declaredPin,
      code: 'PACKAGE_PIN_BEHIND_CLI',
      note: `Managed CLI is arkgate@${cliVersion} but package.json pins ${declaredPin}. Bump the pin or re-run install so CI resolves the same version (common after upgrade --no-install).`,
    };
  }
  return {
    dualTruth: false,
    cliVersion,
    declaredPin,
    code: 'PACKAGE_PIN_MATCHES',
    note: `package.json pin ${declaredPin} is aligned with CLI arkgate@${cliVersion}.`,
  };
}

/**
 * Pin `arkgate` in package.json devDependencies (no package manager network call).
 *
 * @returns {{ changed: boolean, reason: string, version?: string }}
 */
export function pinArkgateDevDependency(root, opts = {}) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { changed: false, reason: 'no-package-json' };
  }
  let pkg;
  let source;
  try {
    source = fs.readFileSync(pkgPath, 'utf8');
    pkg = JSON.parse(source);
  } catch {
    return { changed: false, reason: 'unreadable-package-json' };
  }
  const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
  const dev = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};
  if (typeof deps.arkgate === 'string' || typeof dev.arkgate === 'string') {
    return {
      changed: false,
      reason: 'already-present',
      version: deps.arkgate || dev.arkgate,
    };
  }
  const shipped = arkPackageVersion();
  const version =
    typeof opts.version === 'string' && opts.version
      ? opts.version
      : shipped
        ? `^${shipped}`
        : 'latest';
  if (opts.write !== false) {
    fs.writeFileSync(pkgPath, addDevDependencyPreservingFormat(source, version));
  }
  return { changed: true, reason: 'added', version };
}

/**
 * Product-shaped I/O directory names under Application globs (not bare `db`/`infra`).
 */
export const IO_DIR_SEGMENTS = [
  'airtable',
  'supabase',
  'prisma',
  'drizzle',
  'typeorm',
  'sequelize',
  'mongoose',
  'knex',
  'kysely',
  'firebase',
  'firestore',
  'mongodb',
  'persistence',
  'repositories',
  'repository',
];

const IO_SEGMENT_SET = new Set(IO_DIR_SEGMENTS);

/** Glob pattern → walk root directory (strip trailing wildcards). */
function walkBaseFromGlob(pattern) {
  if (typeof pattern !== 'string') return null;
  const base = pattern
    .replace(/\/\*\*$/, '')
    .replace(/\/\*$/, '')
    .replace(/\*\*$/, '')
    .replace(/\*$/, '');
  if (!base || base.includes('*')) return null;
  return base;
}

/** Collect rel paths for IO segments under absBase (depth 0–1), prefixed with baseRel. */
function collectIoDirs(absBase, baseRel, seen, out) {
  let entries;
  try {
    entries = fs.readdirSync(absBase, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const seg = entry.name.toLowerCase();
    if (IO_SEGMENT_SET.has(seg)) {
      const rel = path.join(baseRel, entry.name).split(path.sep).join('/');
      if (!seen.has(rel)) {
        seen.add(rel);
        out.push(rel);
      }
    }
    // one level deeper (e.g. lib/server/prisma)
    try {
      for (const child of fs.readdirSync(path.join(absBase, entry.name), {
        withFileTypes: true,
      })) {
        if (!child.isDirectory()) continue;
        if (!IO_SEGMENT_SET.has(child.name.toLowerCase())) continue;
        const rel = path
          .join(baseRel, entry.name, child.name)
          .split(path.sep)
          .join('/');
        if (!seen.has(rel)) {
          seen.add(rel);
          out.push(rel);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Detect false-green: empty Domain/Persistence while Application globs still
 * cover obvious I/O directories.
 *
 * @returns {null | { risk: true, ioPaths: string[], emptyCores: string[], message: string, fix: string }}
 */
export function detectContractFalseGreenRisk(root, config, coverage) {
  if (!config || !Array.isArray(config.layers) || config.layers.length === 0) return null;
  const emptyLayers = new Set(
    Array.isArray(coverage?.emptyLayers) ? coverage.emptyLayers : []
  );
  if (Array.isArray(coverage?.layers)) {
    for (const row of coverage.layers) {
      if (row && typeof row.name === 'string' && (row.files ?? 0) === 0) {
        emptyLayers.add(row.name);
      }
    }
  }
  const emptyCores = [...emptyLayers].filter(
    (name) =>
      name === 'DomainModel' ||
      name === 'PersistenceAdapters' ||
      /^Domain/i.test(name) ||
      /Persist|Infra|DataAccess/i.test(name)
  );
  if (emptyCores.length === 0) return null;

  const appLayers = (config.layers || []).filter((layer) =>
    /application|orchestr/i.test(layer?.name ?? '')
  );
  if (appLayers.length === 0) return null;

  const ioPaths = [];
  const seen = new Set();
  for (const layer of appLayers) {
    for (const pattern of layer.patterns || []) {
      const base = walkBaseFromGlob(pattern);
      if (!base) continue;
      const absBase = path.join(root, base);
      if (!fs.existsSync(absBase) || !fs.statSync(absBase).isDirectory()) continue;
      collectIoDirs(absBase, base, seen, ioPaths);
    }
  }
  if (ioPaths.length === 0) return null;

  return {
    risk: true,
    ioPaths,
    emptyCores,
    message:
      `Contract may be a false green: empty core layer(s) [${emptyCores.join(', ')}] while ` +
      `Application-class globs still cover I/O paths (${ioPaths.slice(0, 5).join(', ')}` +
      `${ioPaths.length > 5 ? ', …' : ''}). A clean check can miss real coupling.`,
    fix: 'Run /ark-adopt or /ark-contract — reclassify persistence/auth dirs out of Application before claiming ENFORCE.',
  };
}

/** Stable adoption-gap id for false-green (doctor + start wrap-up). */
export const FALSE_GREEN_GAP_ID = 'contract-false-green-io-under-application';

/**
 * Build the adoption gap object (or null) for collectAdoptionGaps.
 */
export function falseGreenAdoptionGap(root, config, coverage) {
  const risk = detectContractFalseGreenRisk(root, config, coverage);
  if (!risk?.risk) return null;
  return {
    id: FALSE_GREEN_GAP_ID,
    severity: 'warn',
    message: risk.message,
    fix: risk.fix,
  };
}
