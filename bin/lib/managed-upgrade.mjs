import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { codexPrimaryTable, upsertCodexMcpTable } from './codex-home.mjs';
import { buildManagedAssetCatalog } from './install-migrate.mjs';
import {
  formatManagedUpgradeSelfServiceHonesty,
  projectManagedUpgradeSelfServiceHonesty,
} from './managed-upgrade-honesty.mjs';
import {
  buildUpgradeWhatsNewSuggestions,
  formatUpgradeWhatsNewSuggestions,
} from './upgrade-whats-new.mjs';
import {
  KNOWN_TOOLS,
  arkPackageVersion,
  detectActiveAgentHost,
  normalizeToolsList,
  skillContentIdentity,
} from './skill-install.mjs';

export {
  formatManagedUpgradeSelfServiceHonesty,
  projectHostWritePathActivation,
  projectManagedUpgradeSelfServiceHonesty,
} from './managed-upgrade-honesty.mjs';
export {
  buildUpgradeWhatsNewSuggestions,
  formatUpgradeWhatsNewSuggestions,
  UPGRADE_WHATS_NEW_SCHEMA_VERSION,
} from './upgrade-whats-new.mjs';

export const MANAGED_MANIFEST_PATH = 'ark.managed.json';
const MANIFEST_VERSION = '1.0';
const AFTER_CONTENT = Symbol('managed-after-content');
// Exact normalized identities shipped by the last pre-manifest release. They are
// content proof, not version claims: any user edit changes the hash and is preserved.
const LEGACY_SKILL_IDENTITIES = new Set([
  'sha256:3686d7b03ff625b9e8e7a08eef9758785b8dd3ed4bc76ceee831cfcfcc121388',
  'sha256:46f9661f7a25113687084c8eeb6868d6a358959dd875c2177dc4676bf87a1eb9',
  'sha256:49fcf32420f5ab7c9a4dbd4bcd60d4977c780bfe370d6303d0040a699ebb29f8',
  'sha256:19bec67a229c9109e7dddf79e9fd19dd2d2868f1f8afd4a81e849233415a8aa1',
  'sha256:5d51060fd8d17d6cf66e2c3bca4b928dcc4aed3f4a5d456435f0db9f8f5e57bf',
  'sha256:bd6a3edc06010519329570d12bed22036e042b9193551a5b25204c3edd32f19a',
  'sha256:4ae6f271ad466ac76f892536390735442ee12f0fc49bcc9493b309cc7e0068c2',
  'sha256:9adbd4c2d0ae87340991b830df9d126459f02662ec32fab2c75325fef9a14033',
  'sha256:1648d292c781cbc1701435e9c06547ffae5fe40ac6eedb58bac69f960b91a7f5',
  'sha256:29589c6178bef6ef2e2f78fa989976935fa99892a9857aa05df0b849603ec195',
  'sha256:cdc5a7f6836aad55ae7d6aa965d9d1adf1add5f88551342f4fad8963dc4b0814',
  'sha256:e209ffc7a354916d9b54fcd05a74aadf9d72a6363db3b44354dd3d1a8d5f350e',
  'sha256:a5783e492e97fb82cac18bf934071dadeeb3d1ecca2d7bed02ce4328abc5de7d',
]);

function hash(content) {
  if (content == null) return null;
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function normalizedIdentityContent(content) {
  return String(content).replace(/\r\n/g, '\n');
}

/**
 * Content identity for managed assets. Skill kind delegates to skill-install so
 * doctor stale detection and upgrade classify never drift (single hasher).
 */
export function managedContentIdentity(content, kind = 'gate') {
  if (kind === 'skill') return skillContentIdentity(content);
  return hash(Buffer.from(normalizedIdentityContent(content)));
}

function isSafeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath) || relativePath.includes('\0') || relativePath.includes('\\')) {
    return false;
  }
  const normalized = path.posix.normalize(relativePath);
  return normalized === relativePath && normalized !== '.' && !normalized.startsWith('../');
}

function assertSafeTarget(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error(`unsafe managed path: ${relativePath}`);
  const target = path.resolve(root, relativePath);
  const rel = path.relative(path.resolve(root), target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`managed path escapes project root: ${relativePath}`);
  }
  let cursor = path.resolve(root);
  for (const segment of relativePath.split('/').slice(0, -1)) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error(`managed path crosses symlink: ${relativePath}`);
    if (stat && !stat.isDirectory()) throw new Error(`managed path parent is not a directory: ${relativePath}`);
  }
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) throw new Error(`managed path is a symlink: ${relativePath}`);
  if (stat?.isDirectory()) throw new Error(`managed path is a directory: ${relativePath}`);
  if (stat && !stat.isFile()) throw new Error(`managed path is not a regular file: ${relativePath}`);
  if (stat?.isFile() && stat.nlink > 1) throw new Error(`managed path is hard-linked: ${relativePath}`);
  return target;
}

function readFile(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`refusing non-regular managed read: ${file}`);
  if (stat.nlink !== 1) throw new Error(`refusing hard-linked managed read: ${file}`);
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function compactRouterHost(root) {
  const content = readFile(path.join(root, 'AGENTS.md'));
  return content?.toString('utf8').match(/<!--\s*arkgate:compact-router host=([a-z]+)\s*-->/)?.[1] ?? null;
}

function hasArkText(root, relativePath) {
  const content = readFile(path.join(root, relativePath));
  return Boolean(content && /\bark(?:gate)?\b/i.test(content.toString('utf8')));
}

const HOST_SIGNALS = {
  claude: ['.claude/settings.json', '.claude/skills/ark-upgrade/SKILL.md'],
  cursor: [
    '.cursor/mcp.json',
    '.cursor/hooks.json',
    '.cursor/rules/ark.mdc',
    '.cursor/commands/ark-upgrade.md',
  ],
  codex: ['.codex/hooks.json', '.codex/config.toml', '.agents/skills/ark-upgrade/SKILL.md'],
  grok: ['.grok/config.toml', '.grok/hooks/ark-write-gate.json', '.grok/skills/ark-upgrade/SKILL.md'],
  antigravity: ['.agents/hooks.json', '.agents/skills/ark-upgrade/SKILL.md'],
  opencode: ['opencode.json', '.opencode/skills/ark-upgrade/SKILL.md'],
  windsurf: ['.windsurf/rules/ark.md', '.windsurf/workflows/ark-upgrade.md'],
  cline: ['.clinerules/ark.md', '.clinerules/workflows/ark-upgrade.md'],
  copilot: ['.github/copilot-instructions.md', '.github/prompts/ark-upgrade.prompt.md'],
  kiro: ['.kiro/steering/ark.md'],
  roo: ['.roo/rules/ark.md'],
  continue: ['.continue/rules/ark.md'],
  gemini: ['GEMINI.md'],
};

function detectedManagedHosts(root) {
  return KNOWN_TOOLS.filter((host) =>
    (HOST_SIGNALS[host] ?? []).some((relativePath) => hasArkText(root, relativePath))
  );
}

function normalizeHosts(hosts) {
  const normalized = [...new Set(normalizeToolsList(hosts))].sort();
  const invalid = normalized.filter((host) => !KNOWN_TOOLS.includes(host));
  if (invalid.length > 0) throw new Error(`unknown managed host(s): ${invalid.join(', ')}`);
  return normalized;
}

function allKnownPaths(root) {
  return new Set(
    buildManagedAssetCatalog({ root, tools: KNOWN_TOOLS, compact: false }).assets.map(
      (asset) => asset.relativePath
    )
  );
}

function readManifest(root) {
  const file = assertSafeTarget(root, MANAGED_MANIFEST_PATH);
  const content = readFile(file);
  if (!content) return { file, content: null, value: null };
  let value;
  try {
    value = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error(`${MANAGED_MANIFEST_PATH} is not valid JSON`);
  }
  if (value?.schemaVersion !== MANIFEST_VERSION) {
    throw new Error(`${MANAGED_MANIFEST_PATH} has an unsupported schemaVersion`);
  }
  if (!['compact', 'full'].includes(value.profile) || !Array.isArray(value.hosts) || !Array.isArray(value.assets)) {
    throw new Error(`${MANAGED_MANIFEST_PATH} has an invalid shape`);
  }
  value.hosts = normalizeHosts(value.hosts);
  const known = allKnownPaths(root);
  const seen = new Set();
  for (const asset of value.assets) {
    if (
      !asset ||
      !isSafeRelativePath(asset.path) ||
      !known.has(asset.path) ||
      seen.has(asset.path) ||
      typeof asset.templateId !== 'string' ||
      !['whole-file', 'toml-section'].includes(asset.scope) ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.baseHash) ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.contentIdentity)
    ) {
      throw new Error(`${MANAGED_MANIFEST_PATH} contains an invalid asset identity`);
    }
    seen.add(asset.path);
  }
  value.assets.sort((left, right) => left.path.localeCompare(right.path));
  return { file, content, value };
}

/**
 * Best-effort managed manifest load for install-agent-gates force/preserve paths.
 * Returns null when missing or invalid (never throws).
 * @param {string} root
 * @returns {{ schemaVersion: string, profile: string, hosts: string[], assets: object[] } | null}
 */
export function tryReadManagedManifest(root) {
  try {
    const { value } = readManifest(path.resolve(root));
    return value;
  } catch {
    return null;
  }
}

/**
 * Recompute `ark.managed.json` identities from on-disk content after a force
 * gate install (or any out-of-band rewrite of managed assets). Without this,
 * a prior upgrade planDigest is silently invalidated and apply fails with
 * "managed upgrade plan digest mismatch".
 *
 * @param {string} root
 * @param {{ tools?: string[]|string|Set<string>, profile?: 'compact'|'full' }} [options]
 * @returns {{ planDigest: string, profile: string, hosts: string[], assetCount: number, wrote: boolean }}
 */
export function syncManagedManifestFromDisk(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const plan = planManagedUpgrade(resolvedRoot, {
    tools: options.tools,
    profile: options.profile,
    acceptConflicts: options.acceptConflicts === true,
  });
  const file = assertSafeTarget(resolvedRoot, MANAGED_MANIFEST_PATH);
  const previous = readFile(file);
  const next = Buffer.from(plan.manifestContent);
  if (previous && hash(previous) === hash(next)) {
    return {
      planDigest: plan.planDigest,
      profile: plan.profile,
      hosts: plan.hosts,
      assetCount: plan.assets.length,
      wrote: false,
    };
  }
  ensureParentDirectories(resolvedRoot, MANAGED_MANIFEST_PATH, []);
  fs.writeFileSync(file, plan.manifestContent);
  return {
    planDigest: plan.planDigest,
    profile: plan.profile,
    hosts: plan.hosts,
    assetCount: plan.assets.length,
    wrote: true,
  };
}

/**
 * True when an existing managed asset is customized/conflicted vs the recorded
 * identity — install-agent-gates --force must preserve these (same contract as
 * content-identity upgrade).
 *
 * Force preserve also applies by content-identity when the asset is missing from
 * ark.managed.json (incomplete manifest must not clobber customized AGENTS.md).
 */
export function isManagedAssetCustomizedOnDisk(root, relativePath, desiredContent, kind = 'gate') {
  const file = path.join(path.resolve(root), relativePath);
  const currentFile = readFile(file);
  if (currentFile == null) return false;
  let currentScoped = currentFile.toString('utf8');

  const manifest = tryReadManagedManifest(root);
  const recorded = manifest
    ? (manifest.assets ?? []).find((asset) => asset.path === relativePath)
    : null;

  if (recorded) {
    // Whole-file gates: compare full file bytes. Toml-section uses primary table only.
    if (recorded.scope === 'toml-section') {
      currentScoped = codexPrimaryTable(currentScoped)?.block ?? currentScoped;
    }
    const classified = classifyManagedAsset({
      recorded,
      currentContent: currentScoped,
      targetContent: desiredContent,
      kind,
    });
    return classified.state === 'customized' || classified.state === 'conflicted';
  }

  // Incomplete / missing managed list: still preserve when on-disk content differs
  // from the desired template (content-identity force preserve, especially AGENTS.md).
  if (kind === 'skill') return false;
  const desiredNorm = normalizedIdentityContent(desiredContent ?? '');
  const currentNorm = normalizedIdentityContent(currentScoped);
  if (!currentNorm.trim()) return false;
  if (currentNorm === desiredNorm) return false;
  // AGENTS.md and other whole-file gates: any divergence from desired template is customized.
  return managedContentIdentity(currentNorm, kind) !== managedContentIdentity(desiredNorm, kind);
}

function resolveSelection(root, options, manifest) {
  const explicit = normalizeToolsList(options.tools);
  const compactHost = compactRouterHost(root);
  let hosts;
  if (explicit.length > 0) hosts = normalizeHosts(explicit);
  else if (manifest) hosts = normalizeHosts(manifest.hosts);
  else if (compactHost !== null) hosts = compactHost === 'none' ? [] : normalizeHosts([compactHost]);
  else {
    hosts = detectedManagedHosts(root);
    if (hosts.length === 0) {
      const active = detectActiveAgentHost();
      if (active && KNOWN_TOOLS.includes(active)) hosts = [active];
    }
  }
  const profile = options.profile ?? manifest?.profile ?? (compactHost !== null ? 'compact' : 'full');
  if (!['compact', 'full'].includes(profile)) throw new Error(`unknown managed profile: ${profile}`);
  if (profile === 'compact' && hosts.length > 1) {
    throw new Error('compact managed profile accepts exactly one host');
  }
  return { hosts: [...hosts].sort(), profile };
}

function scopedContent(asset, fileContent) {
  if (fileContent == null) return null;
  if (asset.scope === 'whole-file') return fileContent.toString('utf8');
  return codexPrimaryTable(fileContent.toString('utf8'))?.block ?? null;
}

function hasUnparsedCodexScope(asset, fileContent, scoped) {
  if (asset.scope !== 'toml-section' || fileContent == null || scoped != null) return false;
  const uncommented = fileContent
    .toString('utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  return /mcp_servers/.test(uncommented) && /\bark\b/.test(uncommented);
}

function targetContent(asset) {
  if (asset.scope === 'whole-file') return asset.content;
  const table = codexPrimaryTable(asset.content);
  if (!table) throw new Error(`${asset.relativePath} template has no [mcp_servers.ark] section`);
  return table.block;
}

function afterFileContent(asset, currentFile, desiredScoped) {
  if (asset.scope === 'whole-file') return Buffer.from(desiredScoped);
  return Buffer.from(upsertCodexMcpTable(currentFile?.toString('utf8') ?? '', 'ark', desiredScoped));
}

export function classifyManagedAsset({ recorded, currentContent, targetContent: desired, kind }) {
  const targetIdentity = managedContentIdentity(desired, kind);
  if (currentContent == null) {
    return { state: 'missing', managed: true, requiresConsent: Boolean(recorded) };
  }
  const currentIdentity = managedContentIdentity(currentContent, kind);
  if (currentIdentity === targetIdentity) {
    return { state: 'current', managed: true, requiresConsent: false };
  }
  if (!recorded) {
    if (kind === 'skill' && LEGACY_SKILL_IDENTITIES.has(currentIdentity)) {
      return { state: 'stale', managed: true, requiresConsent: false };
    }
    return { state: 'customized', managed: false, requiresConsent: false };
  }
  if (currentIdentity === recorded.contentIdentity) {
    return { state: 'stale', managed: true, requiresConsent: false };
  }
  if (targetIdentity === recorded.contentIdentity) {
    return { state: 'customized', managed: true, requiresConsent: false };
  }
  return { state: 'conflicted', managed: true, requiresConsent: true };
}

function manifestEntry(asset, baseHash, contentIdentity) {
  return {
    path: asset.relativePath,
    templateId: asset.templateId,
    scope: asset.scope,
    baseHash,
    contentIdentity,
  };
}

function serializeManifest(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function summaryFor(assets, manifestChanged) {
  const states = {};
  for (const asset of assets) states[asset.state] = (states[asset.state] ?? 0) + 1;
  const applying = assets.filter((asset) => asset.willApply);
  const wouldWrite = applying.length;
  // Public-summary compatibility: stamp-only writes are no longer scheduled.
  const metadataRefresh = 0;
  const customizedPreserved = assets.filter((asset) => asset.state === 'customized').length;
  const fileChanges = applying.length;
  return {
    total: assets.length,
    managedAssets: assets.length,
    states,
    wouldWrite,
    metadataRefresh,
    customizedPreserved,
    fileChanges,
    manifestChanged,
    changed: fileChanges + (manifestChanged ? 1 : 0),
    blocked: assets.filter((asset) => asset.blocked).length,
  };
}

export function managedPlanDigest(plan) {
  const payload = {
    schemaVersion: plan.schemaVersion,
    root: plan.root,
    profile: plan.profile,
    hosts: plan.hosts,
    acceptConflicts: plan.acceptConflicts,
    manifestBeforeHash: plan.manifestBeforeHash,
    manifestAfterHash: hash(Buffer.from(plan.manifestContent)),
    assets: plan.assets.map((asset) => ({
      path: asset.path,
      action: asset.action,
      willApply: asset.willApply,
      blocked: asset.blocked,
      beforeHash: asset.beforeHash,
      afterHash: asset.afterHash,
      containerBeforeHash: asset.containerBeforeHash,
      containerAfterHash: hash(asset[AFTER_CONTENT]),
    })),
  };
  return hash(Buffer.from(JSON.stringify(payload)));
}

export function planManagedUpgrade(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const manifestRead = readManifest(resolvedRoot);
  const selection = resolveSelection(resolvedRoot, options, manifestRead.value);
  const catalog = buildManagedAssetCatalog({
    root: resolvedRoot,
    tools: selection.hosts,
    compact: selection.profile === 'compact',
  });
  const recordedByPath = new Map(
    (manifestRead.value?.assets ?? []).map((asset) => [asset.path, asset])
  );
  const assets = [];
  const nextEntries = [];
  const selectedPaths = new Set();

  for (const catalogAsset of catalog.assets) {
    selectedPaths.add(catalogAsset.relativePath);
    const file = assertSafeTarget(resolvedRoot, catalogAsset.relativePath);
    const currentFile = readFile(file);
    const currentScoped = scopedContent(catalogAsset, currentFile);
    const desiredScoped = targetContent(catalogAsset);
    const recorded = recordedByPath.get(catalogAsset.relativePath) ?? null;
    const unparsedScope = hasUnparsedCodexScope(catalogAsset, currentFile, currentScoped);
    const classified = unparsedScope
      ? { state: 'customized', managed: false, requiresConsent: false }
      : classifyManagedAsset({
          recorded,
          currentContent: currentScoped,
          targetContent: desiredScoped,
          kind: catalogAsset.kind,
        });
    const accepted = options.acceptConflicts === true;
    // FX04: --refresh-skills opt-in rewrites customized *skill* assets to package
    // templates. Conflicted still needs --accept-conflicts. Never silent default.
    const refreshSkills = options.refreshSkills === true;
    const skillRefresh =
      refreshSkills &&
      catalogAsset.kind === 'skill' &&
      classified.state === 'customized';
    const canApply =
      classified.state === 'stale' ||
      skillRefresh ||
      (classified.state === 'missing' && (!recorded || accepted)) ||
      (classified.state === 'conflicted' && accepted);
    const blocked = classified.requiresConsent && !accepted && !skillRefresh;
    const desiredFile = afterFileContent(catalogAsset, currentFile, desiredScoped);
    const asset = {
      path: catalogAsset.relativePath,
      templateId: catalogAsset.templateId,
      kind: catalogAsset.kind,
      scope: catalogAsset.scope,
      ...classified,
      ...(unparsedScope ? { reason: 'unparsed managed TOML scope preserved' } : {}),
      action: canApply ? (currentScoped == null ? 'create' : 'update') : 'none',
      willApply: canApply,
      blocked,
      beforeHash: hash(currentScoped == null ? null : Buffer.from(currentScoped)),
      afterHash: hash(Buffer.from(desiredScoped)),
      containerBeforeHash: hash(currentFile),
      [AFTER_CONTENT]: desiredFile,
    };
    assets.push(asset);

    if (canApply || classified.state === 'current') {
      const baseScoped = canApply ? desiredScoped : currentScoped;
      nextEntries.push(
        manifestEntry(
          catalogAsset,
          hash(Buffer.from(baseScoped)),
          managedContentIdentity(baseScoped, catalogAsset.kind)
        )
      );
    } else if (recorded) {
      nextEntries.push(recorded);
    }
  }

  for (const recorded of manifestRead.value?.assets ?? []) {
    if (selectedPaths.has(recorded.path)) continue;
    nextEntries.push(recorded);
    assets.push({
      path: recorded.path,
      templateId: recorded.templateId,
      scope: recorded.scope,
      kind: 'retired',
      state: 'retired',
      managed: true,
      requiresConsent: false,
      action: 'none',
      willApply: false,
      blocked: false,
      beforeHash: recorded.baseHash,
      afterHash: null,
      containerBeforeHash: null,
    });
  }

  assets.sort((left, right) => left.path.localeCompare(right.path));
  nextEntries.sort((left, right) => left.path.localeCompare(right.path));
  const nextManifest = {
    schemaVersion: MANIFEST_VERSION,
    profile: selection.profile,
    hosts: selection.hosts,
    assets: nextEntries,
  };
  const manifestContent = serializeManifest(nextManifest);
  const manifestChanged = manifestRead.content?.toString('utf8') !== manifestContent;
  const summary = summaryFor(assets, manifestChanged);
  const plan = {
    schemaVersion: MANIFEST_VERSION,
    root: resolvedRoot,
    readOnly: true,
    applied: false,
    manifestPath: MANAGED_MANIFEST_PATH,
    profile: selection.profile,
    hosts: selection.hosts,
    acceptConflicts: options.acceptConflicts === true,
    refreshSkills: options.refreshSkills === true,
    assets,
    summary,
    nextManifest,
    manifestBeforeHash: hash(manifestRead.content),
    manifestContent,
  };
  plan.planDigest = managedPlanDigest(plan);
  return plan;
}

/**
 * FX03 — skill content drift honesty (counts by state + sample paths).
 * Skills only; never claims "skills upgraded" when only package pin moved.
 */
export function buildSkillDriftSummary(plan) {
  const assets = Array.isArray(plan?.assets) ? plan.assets : [];
  const skills = assets.filter((a) => a?.kind === 'skill');
  const byState = {};
  for (const skill of skills) {
    const state = typeof skill.state === 'string' ? skill.state : 'unknown';
    byState[state] = (byState[state] ?? 0) + 1;
  }
  const sample = (state, limit = 5) =>
    skills
      .filter((s) => s.state === state)
      .map((s) => s.path)
      .sort()
      .slice(0, limit);
  const customized = byState.customized ?? 0;
  const stale = byState.stale ?? 0;
  const missing = byState.missing ?? 0;
  const current = byState.current ?? 0;
  const wouldRefresh = skills.filter((s) => s.willApply === true).length;
  return {
    schemaVersion: '1.0',
    notAScore: true,
    skillCount: skills.length,
    byState,
    stale,
    customized,
    missing,
    current,
    wouldRefresh,
    samplePaths: {
      stale: sample('stale'),
      customized: sample('customized'),
      missing: sample('missing'),
    },
    note:
      customized > 0 && wouldRefresh === 0
        ? 'Skills on disk differ from package templates (customized preserved). Use --refresh-skills to opt in to rewrite customized skills; never silent overwrite.'
        : stale > 0
          ? 'Some skills are stale vs package templates and will refresh on apply.'
          : skills.length === 0
            ? 'No managed skill assets in this upgrade selection.'
            : 'Skill content matches package templates or is scheduled for write.',
  };
}

/**
 * FX07 — active host vs managed --tools / manifest hosts.
 */
export function buildHostSelectionHonesty(plan) {
  const hosts = Array.isArray(plan?.hosts) ? plan.hosts.map((h) => String(h).toLowerCase()) : [];
  let active = null;
  try {
    active = detectActiveAgentHost();
  } catch {
    active = null;
  }
  const activeNorm =
    typeof active === 'string' && active.trim() ? active.trim().toLowerCase() : null;
  const known = activeNorm && KNOWN_TOOLS.includes(activeNorm);
  const inSelection = Boolean(activeNorm && hosts.includes(activeNorm));
  const note =
    known && !inSelection
      ? `Detected host "${activeNorm}" is not in managed tools [${hosts.join(', ') || 'none'}]. Re-run with --tools ${[...new Set([...hosts, activeNorm])].sort().join(',')} so that host's skills/hooks are in the plan.`
      : known && inSelection
        ? `Detected host "${activeNorm}" is in the managed selection.`
        : activeNorm
          ? `Detected host "${activeNorm}" is outside the known managed tool set.`
          : 'No active agent host detected for this process.';
  return {
    schemaVersion: '1.0',
    notAScore: true,
    activeHost: activeNorm,
    managedHosts: hosts,
    activeInSelection: inSelection,
    suggestTools:
      known && !inSelection
        ? [...new Set([...hosts, activeNorm])].sort().join(',')
        : null,
    note,
  };
}

/**
 * FX05 — post-upgrade verification block (advisory sensors only).
 */
export function buildPostUpgradeChecks(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const checks = [];
  let projectVersion = null;
  try {
    const pkgPath = path.join(resolvedRoot, 'node_modules', 'arkgate', 'package.json');
    if (fs.existsSync(pkgPath)) {
      projectVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
    }
  } catch {
    projectVersion = null;
  }
  const cli = typeof options.cliVersion === 'string' ? options.cliVersion : arkPackageVersion();
  const pinOk =
    projectVersion != null && cli != null ? projectVersion === cli : null;
  checks.push({
    id: 'package-pin-cli',
    ok: pinOk,
    detail:
      pinOk === true
        ? `Installed arkgate@${projectVersion} matches CLI ${cli}.`
        : pinOk === false
          ? `Installed arkgate@${projectVersion} ≠ CLI ${cli}; re-run install or restart using project-local CLI.`
          : `Could not compare pin (installed=${projectVersion ?? 'missing'}, cli=${cli ?? 'unknown'}).`,
  });
  checks.push({
    id: 'architecture-verification',
    ok:
      options.verification?.mode === 'skipped'
        ? null
        : options.verification?.exitCode === 0,
    detail:
      options.verification?.mode === 'skipped'
        ? 'Strict architecture verification was skipped (--no-strict).'
        : options.verification?.exitCode === 0
          ? 'Strict-merge architecture verification passed.'
          : `Architecture verification exit ${options.verification?.exitCode ?? 'unknown'}.`,
  });
  checks.push({
    id: 'package-version-truth',
    ok: options.dualTruth?.dualTruth === true ? false : options.dualTruth ? true : null,
    detail:
      options.dualTruth?.dualTruth === true
        ? options.dualTruth.note || 'Package pin dual-truth detected.'
        : options.dualTruth
          ? 'Package pin truth is consistent for this apply.'
          : 'Package version truth not evaluated.',
  });
  checks.push({
    id: 'doctor-compass-coach',
    ok: null,
    detail:
      'Run `npx arkgate-check --doctor --json` and confirm doctor.improvementCompass + doctor.deepModuleCoach (notAScore).',
  });
  checks.push({
    id: 'agents-md-projection',
    ok: null,
    detail: 'Run `npx arkgate agents-md --check` (or --write) so AGENTS.md matches the package projection.',
  });
  checks.push({
    id: 'status-mode',
    ok: null,
    detail: 'Run `npx arkgate status --json` and read honesty mode; incomplete facts never invent green residual.',
  });
  return {
    schemaVersion: '1.0',
    notAScore: true,
    neverGateInput: true,
    checks,
    mcpNote:
      'If you used Ark MCP this session: restart/retarget MCP after package bump so process arkgateVersion matches project install; always pass project.expectedRoot + expectedProjectId (WI01). Prefer project-local CLI until identity matched and versions align.',
  };
}

export function formatSkillDriftHuman(skillDrift) {
  if (!skillDrift) return [];
  const lines = [
    `Skill drift: ${skillDrift.skillCount} skill(s) — current ${skillDrift.current}, stale ${skillDrift.stale}, customized ${skillDrift.customized}, missing ${skillDrift.missing}, would refresh ${skillDrift.wouldRefresh}.`,
  ];
  if (skillDrift.note) lines.push(`  ${skillDrift.note}`);
  return lines;
}

export function formatHostSelectionHuman(hostSelection) {
  if (!hostSelection?.note) return [];
  return [`Host selection: ${hostSelection.note}`];
}

function publicPlan(plan, overrides = {}) {
  const assets = plan.assets.map(
    ({ containerBeforeHash: _container, [AFTER_CONTENT]: _content, ...asset }) => asset
  );
  const base = {
    schemaVersion: plan.schemaVersion,
    root: plan.root,
    readOnly: overrides.readOnly ?? plan.readOnly,
    applied: overrides.applied ?? plan.applied,
    manifestPath: plan.manifestPath,
    planDigest: plan.planDigest,
    profile: plan.profile,
    hosts: plan.hosts,
    acceptConflicts: plan.acceptConflicts,
    assets,
    summary: plan.summary,
  };
  // DF05: self-service honesty (write-path labels + customized preserve) on every public plan.
  // Not part of planDigest — advisory projection only; never invents hard write on soft hosts.
  const selfService = projectManagedUpgradeSelfServiceHonesty({
    hosts: base.hosts,
    assets,
    summary: base.summary,
  });
  // Suggested improvements / what’s new — product capabilities to try after install/upgrade.
  // Always notAScore; never a gate input; not part of planDigest.
  const whatsNew = buildUpgradeWhatsNewSuggestions();
  return {
    ...base,
    ...overrides,
    // DF05 projection always present unless an override supplies a replacement.
    selfService: overrides.selfService ?? selfService,
    whatsNew: overrides.whatsNew ?? whatsNew,
  };
}

function ensureParentDirectories(root, relativePath, createdDirectories) {
  let directory = path.resolve(root);
  for (const segment of relativePath.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    if (!fs.lstatSync(directory, { throwIfNoEntry: false })) {
      fs.mkdirSync(directory);
      createdDirectories.push(directory);
    }
    // Re-check after every creation so a swapped parent cannot redirect the
    // next mkdir (or the staged bytes) outside the project root.
    assertSafeTarget(root, relativePath);
  }
}

let temporarySequence = 0;
function stageFile(file, content, mode = 0o644) {
  const temporary = `${file}.arkgate-${process.pid}-${temporarySequence += 1}.tmp`;
  const descriptor = fs.openSync(
    temporary,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    mode
  );
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    throw error;
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch {
      // The failure path already closed it before removing the incomplete stage.
    }
  }
  return temporary;
}

function assertAssetUnchanged(root, asset) {
  const file = assertSafeTarget(root, asset.path);
  const currentFile = readFile(file);
  const currentScoped = asset.willApply ? null : scopedContent(asset, currentFile);
  const observedHash = asset.willApply
    ? hash(currentFile)
    : hash(currentScoped == null ? null : Buffer.from(currentScoped));
  const expectedHash = asset.willApply ? asset.containerBeforeHash : asset.beforeHash;
  if (observedHash !== expectedHash) {
    throw new Error(`refusing stale managed upgrade plan: ${asset.path} changed after preview`);
  }
}

export function applyManagedUpgrade(root, plan, expectedPlanDigest) {
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot !== plan.root) throw new Error('managed upgrade plan root mismatch');
  if (plan.summary.blocked > 0) return publicPlan(plan, { blocked: true });
  const wouldWrite = plan.summary.wouldWrite ?? 0;
  // Content already matches: unbound --apply is a no-op (exit success), not a digest error.
  if (!expectedPlanDigest || expectedPlanDigest !== plan.planDigest) {
    if (wouldWrite === 0 && (plan.summary.blocked ?? 0) === 0 && !expectedPlanDigest) {
      return publicPlan(plan, {
        readOnly: true,
        applied: false,
        blocked: false,
        nothingToApply: true,
      });
    }
    throw new Error('managed upgrade plan digest mismatch; run a new preview and use its exact nextCommand');
  }

  const writes = plan.assets.filter((asset) => asset.willApply);
  const adopted = plan.assets.filter((asset) => asset.state === 'current' && !asset.willApply);
  for (const asset of [...writes, ...adopted]) assertAssetUnchanged(resolvedRoot, asset);
  const manifestFile = assertSafeTarget(resolvedRoot, MANAGED_MANIFEST_PATH);
  if (hash(readFile(manifestFile)) !== plan.manifestBeforeHash) {
    throw new Error(`refusing stale managed upgrade plan: ${MANAGED_MANIFEST_PATH} changed after preview`);
  }

  const createdDirectories = [];
  const operations = writes.map((asset) => ({
    file: path.join(resolvedRoot, asset.path),
    content: asset[AFTER_CONTENT],
    expectedHash: asset.containerBeforeHash,
    label: asset.path,
  }));
  if (plan.summary.manifestChanged) {
    operations.push({
      file: manifestFile,
      content: plan.manifestContent,
      expectedHash: plan.manifestBeforeHash,
      label: MANAGED_MANIFEST_PATH,
      manifest: true,
    });
  }
  const staged = [];
  const committed = [];
  try {
    for (const operation of operations) {
      assertSafeTarget(resolvedRoot, operation.label);
      ensureParentDirectories(resolvedRoot, operation.label, createdDirectories);
      assertSafeTarget(resolvedRoot, operation.label);
      const previous = readFile(operation.file);
      if (hash(previous) !== operation.expectedHash) {
        throw new Error(`refusing stale managed upgrade plan: ${operation.label} changed after preview`);
      }
      const mode = fs.lstatSync(operation.file, { throwIfNoEntry: false })?.mode ?? 0o644;
      operation.previous = previous;
      operation.mode = mode;
      operation.temporary = stageFile(operation.file, operation.content, mode);
      staged.push(operation);
    }
    for (const operation of operations) {
      assertSafeTarget(resolvedRoot, operation.label);
      if (operation.manifest) {
        for (const asset of adopted) assertAssetUnchanged(resolvedRoot, asset);
      }
      if (hash(readFile(operation.file)) !== operation.expectedHash) {
        throw new Error(`refusing stale managed upgrade plan: ${operation.label} changed after preview`);
      }
      fs.renameSync(operation.temporary, operation.file);
      operation.temporary = null;
      committed.push(operation);
    }
  } catch (error) {
    const rollbackConflicts = [];
    for (const operation of committed.reverse()) {
      let unchanged = false;
      try {
        assertSafeTarget(resolvedRoot, operation.label);
        unchanged = hash(readFile(operation.file)) === hash(operation.content);
      } catch {
        unchanged = false;
      }
      if (!unchanged) rollbackConflicts.push(operation.label);
      else if (operation.previous == null) fs.rmSync(operation.file, { force: true });
      else {
        const rollback = stageFile(operation.file, operation.previous, operation.mode);
        fs.renameSync(rollback, operation.file);
      }
    }
    for (const directory of createdDirectories.reverse()) {
      try {
        fs.rmdirSync(directory);
      } catch {
        // A non-empty pre-existing sibling means the directory must remain.
      }
    }
    if (rollbackConflicts.length > 0) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; rollback preserved concurrent changes in: ${rollbackConflicts.join(', ')}`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    for (const operation of staged) {
      if (operation.temporary) fs.rmSync(operation.temporary, { force: true });
    }
  }
  return publicPlan(plan, { readOnly: false, applied: true, blocked: false });
}

export function managedUpgradeJson(plan, overrides = {}) {
  return JSON.stringify(publicPlan(plan, overrides), null, 2);
}

export function renderManagedUpgrade(plan, options = {}) {
  console.log(
    plan.applied
      ? 'Ark managed upgrade applied.'
      : 'Ark managed upgrade preview — no project files were changed.'
  );
  console.log(`Profile: ${plan.profile}; hosts: ${plan.hosts.join(', ') || 'shared only'}.`);
  for (const asset of plan.assets) {
    const consent = asset.requiresConsent ? ' (consent required)' : '';
    console.log(`  ${asset.state.padEnd(10)} ${asset.path}${consent}`);
  }
  const summary = plan.summary;
  const managedAssets = summary.managedAssets ?? summary.total ?? plan.assets.length;
  const wouldWrite = summary.wouldWrite ?? 0;
  const customizedPreserved = summary.customizedPreserved ?? summary.states?.customized ?? 0;
  const blocked = summary.blocked ?? 0;
  console.log(
    `Managed assets: ${managedAssets}; would write: ${wouldWrite}; ` +
      `customized preserved: ${customizedPreserved}; blocked conflicts/deletions: ${blocked}.`
  );
  const honesty =
    plan.selfService ??
    projectManagedUpgradeSelfServiceHonesty({
      hosts: plan.hosts,
      assets: plan.assets,
      summary: plan.summary,
    });
  for (const line of formatManagedUpgradeSelfServiceHonesty(honesty)) {
    console.log(line);
  }
  const skillDrift =
    options.skillDrift ?? plan.skillDrift ?? buildSkillDriftSummary(plan);
  for (const line of formatSkillDriftHuman(skillDrift)) {
    console.log(line);
  }
  const hostSelection =
    options.hostSelection ?? plan.hostSelection ?? buildHostSelectionHonesty(plan);
  for (const line of formatHostSelectionHuman(hostSelection)) {
    console.log(line);
  }
  // FX08: whatsNew always on preview/apply human path (including nothing-to-apply).
  const whatsNew = plan.whatsNew ?? buildUpgradeWhatsNewSuggestions();
  for (const line of formatUpgradeWhatsNewSuggestions(whatsNew)) {
    console.log(line);
  }
  if (plan.applied) {
    console.log(
      `Applied ${wouldWrite} content write(s)` +
        (summary.manifestChanged ? ', managed manifest' : '') +
        '.'
    );
    return;
  }
  // Content already matches package templates — do not urge --apply as the primary next step.
  if (wouldWrite === 0 && blocked === 0) {
    const ver = options.packageVersion ?? arkPackageVersion();
    const verLabel = ver ? `arkgate@${ver}` : 'the installed arkgate package';
    console.log(
      `Nothing to apply — managed content matches ${verLabel} (${customizedPreserved} customized preserved).`
    );
    return;
  }
  console.log(`Planned writes: ${wouldWrite}; blocked conflicts/deletions: ${blocked}.`);
  if (options.next) console.log(options.next);
  else console.log('Apply the exact preview with: npx arkgate upgrade --apply --no-install');
}
