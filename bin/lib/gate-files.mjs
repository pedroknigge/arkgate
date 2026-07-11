/**
 * Gate file IO: package.json helpers, template writes, required gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generationIdentityForRoot } from './product-identity.mjs';

export const __packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const __arkCheckCli = path.join(__packageRoot, 'bin', 'ark-check.mjs');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readPackageJson(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

export function hasCheckArchitectureScript(root) {
  const pkg = readPackageJson(root);
  return Boolean(pkg?.scripts?.['check:architecture']);
}

/**
 * Whether package.json scripts already expose a typecheck-like command.
 * Shared by deploy-path quality + typecheck bootstrap (single definition).
 * @param {Record<string, unknown>|null|undefined} scripts
 */
export function packageScriptsHaveTypecheck(scripts) {
  if (!scripts || typeof scripts !== 'object') return false;
  return Boolean(
    (typeof scripts.typecheck === 'string' && scripts.typecheck.trim()) ||
      (typeof scripts['type-check'] === 'string' && scripts['type-check'].trim()) ||
      (typeof scripts['check:types'] === 'string' && scripts['check:types'].trim()) ||
      (typeof scripts.tsc === 'string' && /\btsc\b/.test(scripts.tsc))
  );
}

/**
 * Root package (and shallow nested packages) already have a typecheck script.
 * Does not scan CI or framework configs — only package.json scripts.
 * @param {string} root
 */
export function treeHasTypecheckScript(root) {
  const pkg = readPackageJson(root);
  if (packageScriptsHaveTypecheck(pkg?.scripts)) return true;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const candidates = [path.join(root, entry.name)];
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
          if (packageScriptsHaveTypecheck(nested.scripts)) return true;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Add a conservative `typecheck` script when the host has a TS/JS project config
 * but no typecheck-like script yet. Never overwrites an existing script.
 *
 * @param {string} root
 * @param {{ write?: boolean }} [opts]
 * @returns {{
 *   changed: boolean,
 *   reason: 'added' | 'already' | 'no-tsconfig' | 'no-package-json',
 *   script?: string,
 * }}
 */
export function ensureTypecheckScript(root, opts = {}) {
  const write = opts.write !== false;
  const hasTsconfig =
    fs.existsSync(path.join(root, 'tsconfig.json')) ||
    fs.existsSync(path.join(root, 'jsconfig.json'));
  if (!hasTsconfig) return { changed: false, reason: 'no-tsconfig' };

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { changed: false, reason: 'no-package-json' };

  if (treeHasTypecheckScript(root)) {
    return { changed: false, reason: 'already' };
  }

  const pkg = readPackageJson(root) || {};
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' ? { ...pkg.scripts } : {};
  const script = 'tsc --noEmit';
  scripts.typecheck = script;
  if (write) {
    const next = { ...pkg, scripts };
    fs.writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { changed: true, reason: 'added', script };
}

export const REQUIRED_GATE_FILES = [
  'AGENTS.md',
  '.mcp.json',
];
export function hasArkWorkflow(root) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;
  return fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .some((file) => {
      try {
        const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
        return (
          /\bark-check\b/.test(content) ||
          /\bstructrail-check\b/.test(content) ||
          /\bcheck:architecture\b/.test(content) ||
          /\buses\s*:\s*['"]?[^'"\s#]+\/(?:arkgate|structrail)@/i.test(content)
        );
      } catch {
        return false;
      }
    });
}

export function missingGates(root) {
  const identity = generationIdentityForRoot(root);
  const missing = REQUIRED_GATE_FILES.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );
  if (!hasArkWorkflow(root)) {
    missing.push(`.github/workflows/*.yml running ${identity.checkBin}`);
  }
  return missing;
}

export function ensureDirForFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * True when AGENTS.md is wholly Ark-owned (header is Ark Enforcement).
 * Project guides that merely append an Ark section must remain non-Ark so --force
 * never wipes them.
 */
export function isArkAgentsContent(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const head = text.trimStart().slice(0, 120);
  return /^#\s*(?:Ark(?:Gate)?|Structrail)\s+Enforcement\b/.test(head);
}

/**
 * True when AGENTS.md is the **library mother-repo** self-hosted guide (Identity block).
 * Never replace with the consumer install template — even under `--force`.
 */
export function isSelfHostedLibraryAgents(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return (
    /##\s*Identity\s*[—\-–-]\s*read this first/i.test(text) ||
    /mother\s*\/\s*canonical development repository/i.test(text) ||
    /Git\s*\/\s*clone only/i.test(text)
  );
}

export function writeTemplate(root, relativePath, content, force) {
  const fullPath = path.join(root, relativePath);
  if (relativePath === 'AGENTS.md' && fs.existsSync(fullPath)) {
    let existing = '';
    try {
      existing = fs.readFileSync(fullPath, 'utf8');
    } catch {
      existing = '';
    }
    // Library authoring tree: keep Identity + 4-layer dogfood contract forever.
    if (existing && isSelfHostedLibraryAgents(existing)) {
      return { relativePath, status: 'skipped-self-hosted' };
    }
    if (existing && !isArkAgentsContent(existing)) {
      // Never clobber a project-owned AGENTS.md — even with --force.
      // If Ark section not present yet, merge once; subsequent runs leave it alone.
      const hasArkSection =
        /#\s*(?:Ark(?:Gate)?|Structrail)\s+Enforcement\b/.test(existing) ||
        /(?:ark|structrail)\.config\.json is authoritative/i.test(existing);
      if (force && isArkAgentsContent(content) && !hasArkSection) {
        try {
          const merged = `${existing.replace(/\s*$/, '')}\n\n---\n\n${content}`;
          ensureDirForFile(fullPath);
          fs.writeFileSync(fullPath, merged);
          return { relativePath, status: 'merged' };
        } catch {
          return { relativePath, status: 'failed' };
        }
      }
      return { relativePath, status: 'skipped-non-ark' };
    }
    if (!force && isArkAgentsContent(existing)) {
      return { relativePath, status: 'skipped' };
    }
  } else if (fs.existsSync(fullPath) && !force) {
    return { relativePath, status: 'skipped' };
  }
  try {
    ensureDirForFile(fullPath);
    fs.writeFileSync(fullPath, content);
    return { relativePath, status: 'written' };
  } catch {
    return { relativePath, status: 'failed' };
  }
}
