/**
 * ACS04 — version-matched agent contract projection (Tooling I/O).
 *
 * Gathers package version + ark.config layers + diagnostic short list, then
 * builds/merges the non-authoritative projection via Domain pure helpers.
 * Never prompts. Projection is never a gate input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
  ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  DEFAULT_AGENT_PROJECTION_RULE_IDS,
  buildAgentProjectionBlock,
  buildAgentProjectionMeta,
  extractAgentProjectionBlock,
  mergeAgentProjectionDocument,
  parseAgentProjectionStamp,
  projectionMatchesPackageVersion,
} from './agent-projection.mjs';
import { getDiagnosticCatalogEntry } from './diagnostic-catalog.mjs';
import {
  arkCheckCommand,
  loadConfigLayersForAgents,
} from './ci-and-commands.mjs';
import { isSelfHostedLibraryAgents } from './gate-files.mjs';
import { resolveEffectiveProjectRoot } from './project-root.mjs';
import { arkPackageVersion } from './skill-install.mjs';

function packageVersionFallback() {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Resolve catalog short-list entries (ruleId + title) from the public catalog.
 * @param {readonly string[]|null|undefined} [ruleIds]
 */
export function resolveProjectionCatalogShortList(ruleIds) {
  const ids =
    Array.isArray(ruleIds) && ruleIds.length > 0 ? ruleIds : DEFAULT_AGENT_PROJECTION_RULE_IDS;
  return ids.map((ruleId) => {
    const entry = getDiagnosticCatalogEntry(ruleId);
    return {
      ruleId,
      title: entry?.title ?? ruleId,
    };
  });
}

/**
 * Pure-ish facts for Domain build (after path/config load).
 * @param {{
 *   root?: string,
 *   config?: string,
 *   arkgateVersion?: string,
 *   host?: string|null,
 *   profile?: 'compact'|'full'|null,
 *   layers?: Array<{name?: string, patterns?: string[], intentPrefixes?: string[], prefixes?: string[]}>|null,
 *   checkCommand?: string|null,
 * }} [options]
 */
export function collectAgentProjectionFacts(options = {}) {
  const startRoot = path.resolve(options.root || process.cwd());
  const configName = options.config || 'ark.config.json';
  let resolvedRoot = startRoot;
  try {
    const resolved = resolveEffectiveProjectRoot(startRoot, {
      configName,
      writeMode: false,
    });
    resolvedRoot = path.resolve(resolved.root || startRoot);
  } catch {
    resolvedRoot = startRoot;
  }

  const version =
    (typeof options.arkgateVersion === 'string' && options.arkgateVersion.trim()) ||
    arkPackageVersion() ||
    packageVersionFallback();

  let layers = options.layers;
  if (layers === undefined) {
    layers = loadConfigLayersForAgents(resolvedRoot);
  }

  const layerSummaries = Array.isArray(layers)
    ? layers.map((layer) => ({
        name: layer.name ?? layer.layer ?? 'Unknown',
        patterns: layer.patterns ?? [],
        intentPrefixes: layer.intentPrefixes ?? layer.prefixes ?? [],
      }))
    : [];

  const profile =
    options.profile === 'compact' || options.profile === 'full'
      ? options.profile
      : null;

  const checkCommand =
    typeof options.checkCommand === 'string' && options.checkCommand.trim()
      ? options.checkCommand.trim()
      : arkCheckCommand(resolvedRoot);

  const host =
    typeof options.host === 'string' && options.host.trim()
      ? options.host.trim().toLowerCase()
      : null;

  return {
    arkgateVersion: version,
    checkCommand,
    layers: layerSummaries,
    catalogShortList: resolveProjectionCatalogShortList(),
    host,
    profile: profile ?? 'full',
    diagnosticsDocsPath: 'docs/diagnostics.md',
    resolvedRoot,
  };
}

/**
 * Build projection block + meta for a project (no write).
 * @param {Parameters<typeof collectAgentProjectionFacts>[0]} [options]
 */
export function buildProjectAgentProjection(options = {}) {
  const facts = collectAgentProjectionFacts(options);
  const block = buildAgentProjectionBlock(facts);
  const meta = buildAgentProjectionMeta(facts);
  return { facts, block, meta };
}

/**
 * Plan a merge into AGENTS.md (default path) without writing.
 * @param {{
 *   root?: string,
 *   config?: string,
 *   arkgateVersion?: string,
 *   host?: string|null,
 *   profile?: 'compact'|'full'|null,
 *   agentsPath?: string,
 *   targetRelativePath?: string,
 * }} [options]
 */
export function planAgentProjectionRefresh(options = {}) {
  const built = buildProjectAgentProjection(options);
  const root = built.facts.resolvedRoot;
  const relativePath = options.targetRelativePath || options.agentsPath || 'AGENTS.md';
  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(root, relativePath);

  let existing = null;
  if (fs.existsSync(absolutePath)) {
    try {
      existing = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      existing = null;
    }
  }

  const selfHosted = Boolean(existing && isSelfHostedLibraryAgents(existing));
  const merge = mergeAgentProjectionDocument(existing, built.block);
  const stamp = parseAgentProjectionStamp(built.block);
  const existingStamp = existing ? parseAgentProjectionStamp(existing) : { arkgateVersion: null };
  const versionMatch = projectionMatchesPackageVersion(built.block, built.facts.arkgateVersion);
  const existingVersionMatch = existing
    ? projectionMatchesPackageVersion(existing, built.facts.arkgateVersion)
    : false;
  const extracted = existing ? extractAgentProjectionBlock(existing) : { block: null };

  return {
    root,
    path: absolutePath,
    relativePath: path.isAbsolute(relativePath)
      ? path.relative(root, relativePath) || 'AGENTS.md'
      : relativePath,
    selfHosted,
    action: merge.action,
    wouldWrite: merge.action !== 'unchanged',
    contentIdentity: merge.contentIdentity,
    previousBlockPresent: extracted.block != null,
    preservedOutsideBlock: merge.preservedOutsideBlock,
    packageVersion: built.facts.arkgateVersion,
    stampedVersion: stamp.arkgateVersion,
    existingStampedVersion: existingStamp.arkgateVersion,
    versionMatch,
    existingVersionMatch,
    nonAuthoritative: true,
    nonEnforcementLabel: AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
    schemaVersion: ARK_AGENT_PROJECTION_SCHEMA_VERSION,
    meta: built.meta,
    block: built.block,
    nextContent: merge.content,
  };
}

/**
 * Apply a planned projection refresh (write file).
 * @param {ReturnType<typeof planAgentProjectionRefresh>} plan
 * @param {{ write?: boolean }} [opts]
 */
export function applyAgentProjectionRefresh(plan, opts = {}) {
  const shouldWrite = opts.write !== false;
  if (!plan.wouldWrite) {
    return { wrote: false, action: plan.action, path: plan.path };
  }
  if (!shouldWrite) {
    return { wrote: false, action: plan.action, path: plan.path, dryRun: true };
  }
  fs.mkdirSync(path.dirname(plan.path), { recursive: true });
  fs.writeFileSync(plan.path, plan.nextContent.endsWith('\n') ? plan.nextContent : `${plan.nextContent}\n`);
  return { wrote: true, action: plan.action, path: plan.path };
}

/**
 * CLI entry for `ark agents-md`. Never prompts.
 *
 * Flags (via args object):
 * - write / apply: merge projection into AGENTS.md
 * - check: exit 1 when stamp missing or version ≠ package (Ark-owned or block present)
 * - stdout: print projection block only
 * - json: machine-readable plan / result
 *
 * @param {{
 *   root?: string,
 *   config?: string,
 *   json?: boolean,
 *   write?: boolean,
 *   apply?: boolean,
 *   check?: boolean,
 *   stdout?: boolean,
 *   host?: string,
 *   profile?: 'compact'|'full',
 *   arkgateVersion?: string,
 *   writeOut?: (line: string) => void,
 *   writeErr?: (line: string) => void,
 * }} args
 * @returns {number} exit code
 */
export function runAgentProjectionCommand(args = {}) {
  const writeOut = args.writeOut ?? ((line) => console.log(line));
  const writeErr = args.writeErr ?? ((line) => console.error(line));
  const asJson = args.json === true || process.env.CI === '1' || process.env.CI === 'true';
  const doWrite = args.write === true || args.apply === true;
  const checkOnly = args.check === true;
  const stdoutOnly = args.stdout === true;

  try {
    const plan = planAgentProjectionRefresh({
      root: args.root,
      config: args.config,
      host: args.host,
      profile: args.profile,
      arkgateVersion: args.arkgateVersion,
    });

    if (stdoutOnly) {
      if (asJson) {
        writeOut(
          JSON.stringify(
            {
              schemaVersion: plan.schemaVersion,
              arkgateVersion: plan.packageVersion,
              nonAuthoritative: true,
              meta: plan.meta,
              block: plan.block,
            },
            null,
            2
          )
        );
      } else {
        writeOut(plan.block.endsWith('\n') ? plan.block.slice(0, -1) : plan.block);
      }
      return 0;
    }

    if (checkOnly) {
      // Drift: missing projection when file exists, or stamped version ≠ package.
      const hasFile = fs.existsSync(plan.path);
      const hasBlock = plan.previousBlockPresent;
      let ok = true;
      const reasons = [];
      if (hasFile && hasBlock && !plan.existingVersionMatch) {
        ok = false;
        reasons.push(
          `projection stamp ${plan.existingStampedVersion ?? '(none)'} ≠ package ${plan.packageVersion}`
        );
      }
      if (hasFile && !hasBlock && !plan.selfHosted) {
        // Consumer AGENTS without projection is drift for version-matched installs.
        ok = false;
        reasons.push('AGENTS.md is missing the managed agent-projection block');
      }
      // Self-hosted mother-repo may omit the block until maintainers insert it; not a hard fail
      // unless a block is present with the wrong version.
      if (plan.selfHosted && hasBlock && !plan.existingVersionMatch) {
        ok = false;
      }

      if (asJson) {
        writeOut(
          JSON.stringify(
            {
              ok,
              check: true,
              reasons,
              packageVersion: plan.packageVersion,
              existingStampedVersion: plan.existingStampedVersion,
              previousBlockPresent: plan.previousBlockPresent,
              selfHosted: plan.selfHosted,
              nonAuthoritative: true,
              path: plan.relativePath,
            },
            null,
            2
          )
        );
      } else if (ok) {
        writeOut(
          `agent projection OK — package ${plan.packageVersion}` +
            (hasBlock ? ` (stamped ${plan.existingStampedVersion})` : ' (no block; self-hosted or absent)')
        );
      } else {
        writeErr(`agent projection drift: ${reasons.join('; ')}`);
        writeErr(`Fix: ark agents-md --write  (regenerates the managed block; never a gate input)`);
      }
      return ok ? 0 : 1;
    }

    let applyResult = { wrote: false, action: plan.action, path: plan.path };
    if (doWrite) {
      applyResult = applyAgentProjectionRefresh(plan, { write: true });
    }

    if (asJson) {
      writeOut(
        JSON.stringify(
          {
            schemaVersion: plan.schemaVersion,
            arkgateVersion: plan.packageVersion,
            nonAuthoritative: true,
            path: plan.relativePath,
            action: applyResult.action,
            wrote: applyResult.wrote,
            wouldWrite: plan.wouldWrite,
            contentIdentity: plan.contentIdentity,
            preservedOutsideBlock: plan.preservedOutsideBlock,
            selfHosted: plan.selfHosted,
            meta: plan.meta,
            ...(doWrite ? {} : { preview: true, block: plan.block }),
          },
          null,
          2
        )
      );
      return 0;
    }

    if (doWrite) {
      if (applyResult.wrote) {
        writeOut(
          `Wrote agent projection (${applyResult.action}) → ${plan.relativePath} · arkgate@${plan.packageVersion}`
        );
        writeOut('Non-authoritative: enforcement remains ark-check / hooks / CI.');
      } else {
        writeOut(
          `Agent projection unchanged (${plan.action}) → ${plan.relativePath} · arkgate@${plan.packageVersion}`
        );
      }
    } else {
      writeOut(
        `Agent projection preview · arkgate@${plan.packageVersion} · action=${plan.action}` +
          (plan.wouldWrite ? ' (pass --write to apply)' : ' (already current)')
      );
      writeOut(`  path: ${plan.relativePath}`);
      writeOut(`  contentIdentity: ${plan.contentIdentity}`);
      writeOut('  nonAuthoritative: true (not a gate input)');
      if (plan.selfHosted) {
        writeOut('  note: self-hosted library AGENTS — merge updates the managed block only');
      }
    }
    return 0;
  } catch (error) {
    writeErr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
