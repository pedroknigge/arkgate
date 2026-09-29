/**
 * Tooling I/O for the config version floor (#338): read the files that can pin
 * an arkgate version and hand their text to the pure Domain parser.
 *
 * Bounded and non-recursive. Missing or oversized files are skipped. Every
 * probed path is reported to `observeInput` so a resident snapshot notices a
 * later edit of package.json or a workflow.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArkgatePins } from './analysis-engine.mjs';
import { __packageRoot } from './gate-files.mjs';

const MAX_PIN_FILE_BYTES = 256 * 1024;

const FIXED_CANDIDATES = [
  ['package.json', 'package-json'],
  ['package-lock.json', 'package-lock'],
  ['node_modules/arkgate/package.json', 'installed'],
  ['.claude/settings.json', 'hook'],
  ['.cursor/hooks.json', 'hook'],
  ['.codex/hooks.json', 'hook'],
  ['.codex/config.toml', 'hook'],
  ['.grok/settings.json', 'hook'],
];

/** Directories whose direct children may pin arkgate, with a basename filter. */
const DIRECTORY_CANDIDATES = [
  ['scripts', 'hook', (name) => /hook/i.test(name)],
  ['.husky', 'hook', () => true],
  ['.githooks', 'hook', () => true],
  ['.github/workflows', 'ci', (name) => /\.ya?ml$/i.test(name)],
];

function readSmall(absolute) {
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_PIN_FILE_BYTES) return null;
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

function listDirectory(absolute) {
  try {
    return fs
      .readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Every arkgate pin under `root` (repo-relative files, 1-based lines).
 * @param {string} root
 * @param {{ observeInput?: (absolutePath: string, kind: string) => void }} [options]
 */
export function collectArkgatePins(root, { observeInput } = {}) {
  const pins = [];
  const probe = (rel, source) => {
    const absolute = path.join(root, rel);
    observeInput?.(absolute, 'arkgate-pin');
    const text = readSmall(absolute);
    if (text) pins.push(...parseArkgatePins(rel, text, source));
  };
  for (const [rel, source] of FIXED_CANDIDATES) probe(rel, source);
  for (const [dir, source, accept] of DIRECTORY_CANDIDATES) {
    const absoluteDir = path.join(root, dir);
    observeInput?.(absoluteDir, 'arkgate-pin');
    for (const name of listDirectory(absoluteDir)) {
      if (accept(name)) probe(`${dir}/${name}`, source);
    }
  }
  return pins;
}

/** The arkgate version running this check. */
export function runningArkgateVersion() {
  const text = readSmall(path.join(__packageRoot, 'package.json'));
  if (!text) return undefined;
  try {
    const pkg = JSON.parse(text);
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}
