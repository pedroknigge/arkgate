import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_BASENAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

function normalized(relative) {
  return relative.split(path.sep).join('/');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function snapshotTree(root) {
  const absoluteRoot = fs.realpathSync(root);
  const entries = [];
  const unsafeSymlinks = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = normalized(path.relative(root, absolute));
      const candidateRuntimeDependency = relative === '.arkgate-candidate/node_modules'
        || relative.startsWith('.arkgate-candidate/node_modules/');
      if (EXCLUDED_BASENAMES.has(entry.name) && !candidateRuntimeDependency) continue;
      const stat = fs.lstatSync(absolute);
      const mode = stat.mode & 0o777;
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        entries.push({ path: relative, kind: 'file', mode, sha256: sha256File(absolute) });
      } else if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(absolute);
        entries.push({ path: relative, kind: 'symlink', mode, target });
        try {
          const resolved = fs.realpathSync(absolute);
          if (resolved !== absoluteRoot && !resolved.startsWith(`${absoluteRoot}${path.sep}`)) unsafeSymlinks.push(relative);
        } catch {
          unsafeSymlinks.push(relative);
        }
      } else {
        entries.push({ path: relative, kind: 'special', mode });
      }
    }
  };
  visit(root);
  return Object.freeze({
    entries: Object.freeze(entries),
    sha256: sha256(stableJson(entries)),
    unsafeSymlinks: Object.freeze(unsafeSymlinks.sort()),
  });
}

function isAllowed(relative, allowedPrefixes) {
  return allowedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

export function protectedTreeDiff(before, after, allowedPrefixes) {
  const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.entries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort();
  const changed = [];
  for (const relative of paths) {
    if (isAllowed(relative, allowedPrefixes)) continue;
    if (stableJson(beforeByPath.get(relative)) !== stableJson(afterByPath.get(relative))) changed.push(relative);
  }
  return Object.freeze({
    changed: Object.freeze(changed),
    unsafeSymlinks: after.unsafeSymlinks,
    ok: changed.length === 0 && after.unsafeSymlinks.length === 0,
  });
}

export function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, target);
}

export function appendJsonLineDurable(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, 'a', 0o600);
  try {
    fs.writeSync(descriptor, `${JSON.stringify(value)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
