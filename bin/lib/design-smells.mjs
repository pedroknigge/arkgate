/**
 * Deterministic design-smell sensors (Phase P / P02).
 *
 * Pure-ish filesystem heuristics: contract edges can be clean while lived design
 * is weak (god modules, I/O in routes, concurrent layouts). Never invents
 * mechanical-safe remediations — smells feed doctor honesty + plan B only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-shared.mjs';
import { detectContractFalseGreenRisk } from './field-install.mjs';

/** Stable smell ids (doctor JSON + plan B + skills). */
export const DESIGN_SMELL_IDS = Object.freeze([
  'io-under-application',
  'handler-in-persistence',
  'god-module',
  'domain-logic-in-ui',
  'facade-sql-in-routes',
  'mixed-pattern-cluster',
  'soft-contract',
]);

const IO_IMPORT_RE =
  /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm|typeorm|knex|mongodb|pg|mysql2|better-sqlite3|ioredis|redis)['"]|require\(\s*['"](?:@?prisma\/client|pg|knex|typeorm)/;
const HANDLER_CONTENT_RE =
  /\b(?:@Controller|@Get|@Post|@Put|@Delete|Router\(\)|createRouter|express\.Router|fastify\.(?:get|post)|export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b|export\s+const\s+(?:GET|POST|PUT|DELETE|PATCH)\s*=)/;
const DOMAIN_LOGIC_UI_RE =
  /\b(?:export\s+)?(?:async\s+)?function\s+(?:can|calculate|compute|should)[A-Z]\w*|\b(?:export\s+)?const\s+(?:can|calculate|compute|should)[A-Z]\w*\s*=/;
const EXPORT_RE =
  /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|default)\b|\bexport\s*\{/g;

const PERSISTENCE_PATH_RE =
  /(?:^|\/)(?:repositories?|persistence|infra\/(?:db|data|persistence)|adapters\/(?:persistence|repository)|data-access)(?:\/|$)/i;
const UI_PATH_RE =
  /(?:^|\/)(?:components?|pages|hooks|ui|views|screens|app\/(?:\(.*\)\/)?[^/]+\/page\.|app\/.*\/page\.)/i;
const ROUTE_PATH_RE =
  /(?:^|\/)(?:routes?|controllers?|api\/|pages\/api\/|app\/api\/|handlers?)(?:\/|$)|(?:route|controller|handler)\.(?:ts|tsx|js|jsx)$/i;

const MAX_FILE_BYTES = 256 * 1024;
const MAX_SCAN_FILES = 800;
const GOD_LOC = 400;
const GOD_EXPORTS = 12;

function normalizeRel(root, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  let rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel.startsWith('./')) rel = rel.slice(2);
  return rel;
}

function readTextLimited(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function countExports(source) {
  if (!source) return 0;
  const matches = source.match(EXPORT_RE);
  return matches ? matches.length : 0;
}

function countLines(source) {
  if (!source) return 0;
  let n = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) n += 1;
  }
  return n;
}

function layerNameFor(root, rel, config) {
  try {
    // CLI layerForFile(root, file, layers) — file may be absolute or relative.
    return layerForFile(root, rel, config?.layers ?? []) ?? null;
  } catch {
    return null;
  }
}

function isApplicationLayer(name) {
  return typeof name === 'string' && /application|orchestr/i.test(name);
}

function isPresentationLayer(name) {
  return typeof name === 'string' && /presentation|ui|view/i.test(name);
}

function isPersistenceLayer(name) {
  return (
    typeof name === 'string' &&
    (/persist|repository|infra|data.?access/i.test(name) || name === 'PersistenceAdapters')
  );
}

/**
 * @typedef {object} DesignSmell
 * @property {string} id
 * @property {'warn'|'info'} severity
 * @property {string} message
 * @property {string[]} evidence
 * @property {string} fix
 */

/**
 * Detect design smells for a project tree.
 *
 * @param {string} root
 * @param {object} config ark.config
 * @param {string[]} files absolute or root-relative source paths
 * @param {object|null} coverage computeCoverage result (optional)
 * @returns {DesignSmell[]}
 */
export function detectDesignSmells(root, config, files = [], coverage = null) {
  const smells = [];
  const resolvedRoot = path.resolve(root);
  const relFiles = [];
  for (const f of files.slice(0, MAX_SCAN_FILES)) {
    const rel = normalizeRel(resolvedRoot, f);
    if (!rel || rel.startsWith('..')) continue;
    if (!/\.(ts|tsx|js|jsx|mts|cts)$/.test(rel)) continue;
    if (rel.includes('node_modules/') || rel.endsWith('.d.ts')) continue;
    relFiles.push(rel);
  }

  // soft-contract: layers with files but no rule edges
  const withoutRules = Array.isArray(coverage?.layersWithoutRules)
    ? coverage.layersWithoutRules
    : [];
  if (withoutRules.length > 0) {
    smells.push({
      id: 'soft-contract',
      severity: 'warn',
      message: `Layers classify files but have no deny/allow rule edges: ${withoutRules.join(', ')}. Soft green — peer leaks may go unchecked.`,
      evidence: withoutRules.map((n) => `layer:${n}`),
      fix: 'Add rules via /ark-contract (or a policy pack) so every populated layer participates in enforcement.',
    });
  }

  // Classic false-green I/O under Application (reuse detector when coverage present)
  const falseGreen = detectContractFalseGreenRisk(resolvedRoot, config, coverage ?? {});
  if (falseGreen?.risk) {
    smells.push({
      id: 'io-under-application',
      severity: 'warn',
      message: falseGreen.message,
      evidence: (falseGreen.ioPaths || []).slice(0, 12),
      fix: falseGreen.fix,
    });
  }

  const godEvidence = [];
  const handlerInPersist = [];
  const domainInUi = [];
  const facadeSql = [];
  const ioUnderAppFiles = [];

  let hasFeaturesLayout = false;
  let hasFlatServices = false;
  let hasHexPorts = false;

  for (const rel of relFiles) {
    if (/\/features\/[^/]+\//.test(rel) || /^features\//.test(rel)) hasFeaturesLayout = true;
    if (/\/(?:services|modules)\/[^/]+\//.test(rel) || /(?:^|\/)services\/[^/]+\.(?:ts|tsx)$/.test(rel)) {
      hasFlatServices = true;
    }
    if (/\/(?:domain|application|infrastructure|adapters)\//.test(rel)) hasHexPorts = true;

    const abs = path.join(resolvedRoot, rel);
    const source = readTextLimited(abs);
    if (source == null) continue;

    const layer = layerNameFor(resolvedRoot, rel, config);
    const loc = countLines(source);
    const exportsCount = countExports(source);

    if (loc >= GOD_LOC && exportsCount >= GOD_EXPORTS) {
      godEvidence.push(rel);
    }

    if (
      (PERSISTENCE_PATH_RE.test(rel) || isPersistenceLayer(layer)) &&
      HANDLER_CONTENT_RE.test(source)
    ) {
      handlerInPersist.push(rel);
    }

    if ((UI_PATH_RE.test(rel) || isPresentationLayer(layer)) && DOMAIN_LOGIC_UI_RE.test(source)) {
      domainInUi.push(rel);
    }

    if (ROUTE_PATH_RE.test(rel) && IO_IMPORT_RE.test(source)) {
      facadeSql.push(rel);
    }

    if (
      !falseGreen?.risk &&
      isApplicationLayer(layer) &&
      IO_IMPORT_RE.test(source) &&
      !/port|adapter|repository/i.test(path.basename(rel))
    ) {
      ioUnderAppFiles.push(rel);
    }
  }

  if (!falseGreen?.risk && ioUnderAppFiles.length > 0) {
    smells.push({
      id: 'io-under-application',
      severity: 'warn',
      message: `Application-layer files import database/client SDKs directly (${ioUnderAppFiles.length} file(s)). Prefer ports in Domain + adapters outside Application.`,
      evidence: ioUnderAppFiles.slice(0, 12),
      fix: 'Extract a port + adapter (extraction card); do not weaken ark.config to silence the smell.',
    });
  }

  if (handlerInPersist.length > 0) {
    smells.push({
      id: 'handler-in-persistence',
      severity: 'warn',
      message: `HTTP/route handler shape found under persistence/repository paths (${handlerInPersist.length} file(s)) — semantic false-green risk.`,
      evidence: handlerInPersist.slice(0, 12),
      fix: 'Move handlers to Presentation/API; keep Persistence as data access only (/ark-explore shape-focus).',
    });
  }

  if (godEvidence.length > 0) {
    smells.push({
      id: 'god-module',
      severity: 'warn',
      message: `God-module candidates: large files with wide export surfaces (${godEvidence.length} file(s), ≥${GOD_LOC} LOC and ≥${GOD_EXPORTS} exports).`,
      evidence: godEvidence.slice(0, 12),
      fix: 'Split by concern with a pilot cluster; keep gate rules; use dual-plan B extraction card.',
    });
  }

  if (domainInUi.length > 0) {
    smells.push({
      id: 'domain-logic-in-ui',
      severity: 'warn',
      message: `Business-style can*/calculate*/compute* helpers live under UI/presentation paths (${domainInUi.length} file(s)).`,
      evidence: domainInUi.slice(0, 12),
      fix: 'Move pure rules into Domain (or shared pure module under Domain globs) and import from UI.',
    });
  }

  if (facadeSql.length > 0) {
    smells.push({
      id: 'facade-sql-in-routes',
      severity: 'warn',
      message: `Route/controller files import ORM/SQL clients directly (${facadeSql.length} file(s)).`,
      evidence: facadeSql.slice(0, 12),
      fix: 'Relocate query bytes into a repository/adapter; routes call a port — extraction card; no schema rewrite.',
    });
  }

  // mixed-pattern: vertical-slice features coexisting with flat services and/or hex folders
  const patternHits = [hasFeaturesLayout, hasFlatServices, hasHexPorts].filter(Boolean).length;
  if (patternHits >= 2 && relFiles.length >= 8) {
    const evidence = [];
    if (hasFeaturesLayout) evidence.push('layout:features/*');
    if (hasFlatServices) evidence.push('layout:services/*');
    if (hasHexPorts) evidence.push('layout:hex-domain-application-infra');
    smells.push({
      id: 'mixed-pattern-cluster',
      severity: 'info',
      message:
        'Concurrent design patterns detected in the tree (slice features vs flat services vs hex folders). Pick a golden pattern and pilot migrate-on-touch.',
      evidence,
      fix: 'Run /ark-explore shape-focus; mark golden vs legacy; dual-plan B with pilot + kill-switch.',
    });
  }

  // Stable order by id for snapshots
  const order = new Map(DESIGN_SMELL_IDS.map((id, i) => [id, i]));
  smells.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  return smells;
}

/**
 * Whether edge-clean ENFORCE should still report design-weak residual.
 *
 * @param {DesignSmell[]} smells
 * @param {{ activeViolations?: number, governedPercent?: number|null, totalFiles?: number|null }} ctx
 */
export function isDesignWeak(smells, ctx = {}) {
  const active = ctx.activeViolations ?? 0;
  const total = ctx.totalFiles ?? null;
  const gov = ctx.governedPercent ?? null;
  if (active > 0) return false;
  if (total === 0) return false;
  if (gov != null && gov < 50) return false;
  return Array.isArray(smells) && smells.length > 0;
}

/**
 * Design fitness summary for doctor JSON / human.
 */
export function summarizeDesignFitness(smells, ctx = {}) {
  const designWeak = isDesignWeak(smells, ctx);
  return {
    status: designWeak ? 'design-weak' : smells.length > 0 ? 'smells-with-open-edges' : 'ok',
    designWeak,
    smellCount: Array.isArray(smells) ? smells.length : 0,
    ids: (smells || []).map((s) => s.id),
    label: designWeak
      ? 'ENFORCE · design-weak — edges clean; Shape residual remains (see designSmells / plan B)'
      : smells.length > 0
        ? 'Design smells present alongside open edge debt'
        : 'No deterministic design smells detected',
  };
}

/**
 * Build plan-B pattern bets from smells (P03). Never mechanical-safe.
 *
 * @param {DesignSmell[]} smells
 * @returns {object[]}
 */
export function buildPatternBetsFromSmells(smells = []) {
  const bets = [];
  for (const smell of smells) {
    const pilot =
      (smell.evidence || []).find((e) => e && !e.startsWith('layer:') && !e.startsWith('layout:')) ||
      (smell.evidence || [])[0] ||
      'src/**';
    bets.push({
      id: `pattern-b:${smell.id}`,
      smellId: smell.id,
      pilot: typeof pilot === 'string' ? pilot.replace(/\/[^/]+$/, '/**') : 'src/**',
      evidence: (smell.evidence || []).slice(0, 8),
      successSignal: successSignalFor(smell.id),
      killSwitch: killSwitchFor(smell.id),
      neverMechanicalSafe: true,
      class: 'judgment',
      fix: smell.fix,
      message: smell.message,
    });
  }
  // Cap at 5 (explore dual-plan B limit)
  return bets.slice(0, 5);
}

function successSignalFor(id) {
  switch (id) {
    case 'io-under-application':
      return '0 Application-layer files import prisma/supabase/drizzle/pg clients; I/O behind ports';
    case 'handler-in-persistence':
      return '0 HTTP handler shapes under persistence/repository globs';
    case 'god-module':
      return 'Pilot god module split; fan-in and export surface reduced without new edge violations';
    case 'domain-logic-in-ui':
      return 'can*/calculate* pure rules live under Domain; UI imports them only';
    case 'facade-sql-in-routes':
      return '0 route/controller files import ORM/SQL clients; queries in adapters';
    case 'mixed-pattern-cluster':
      return 'Golden pattern named; pilot cluster migrated; legacy migrate-on-touch';
    case 'soft-contract':
      return 'Every populated layer has at least one rule edge in ark.config.json';
    default:
      return 'Smell evidence paths cleared on pilot without weakening the contract';
  }
}

function killSwitchFor(id) {
  switch (id) {
    case 'mixed-pattern-cluster':
      return 'If pilot does not reduce confusion in 2 real PRs, keep one layout without adding a layer wall';
    case 'god-module':
      return 'If split increases coupling, stop after one pilot and prefer seam extraction only';
    default:
      return 'If pilot increases edge violations without design clarity, stop and re-map with /ark-explore';
  }
}

/**
 * Honesty guard (P03/P04): refuse “healthy finished” claims when design residual remains.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertNotHealthyFinishedIgnoringDesign(planOrDoctor) {
  const designWeak =
    planOrDoctor?.goal?.designWeak === true ||
    planOrDoctor?.designFitness?.designWeak === true;
  const bets =
    planOrDoctor?.patternBets?.length ??
    planOrDoctor?.goal?.patternBetCount ??
    0;
  const smells =
    planOrDoctor?.designSmells?.length ?? planOrDoctor?.designFitness?.smellCount ?? 0;
  const edgesMet =
    planOrDoctor?.goal?.met === true ||
    (planOrDoctor?.operatingMode === 'enforce' &&
      (planOrDoctor?.violations?.active ?? 0) === 0);

  if (edgesMet && (designWeak || bets > 0 || smells > 0)) {
    return {
      ok: false,
      error:
        'Cannot claim architecture healthy finished: edge goal.met/ENFORCE coexists with design-weak residual (designSmells / patternBets). Use dual-plan B; never auto-apply pattern bets.',
    };
  }
  return { ok: true };
}

/**
 * patternBets must never appear as mechanical-safe kinds (loop / autoPatch).
 * @param {object[]} patternBets
 * @param {string[]} mechanicalSafeKinds from remediation.MECHANICAL_SAFE_KINDS
 */
export function assertPatternBetsNeverMechanicalSafe(patternBets, mechanicalSafeKinds = []) {
  const safe = new Set(mechanicalSafeKinds);
  for (const bet of patternBets || []) {
    if (bet.neverMechanicalSafe !== true) {
      return {
        ok: false,
        error: `patternBet ${bet.id} missing neverMechanicalSafe: true`,
      };
    }
    if (bet.class === 'mechanical-safe') {
      return { ok: false, error: `patternBet ${bet.id} has class mechanical-safe` };
    }
    if (bet.remediationKind && safe.has(bet.remediationKind)) {
      return {
        ok: false,
        error: `patternBet ${bet.id} uses mechanical-safe remediationKind ${bet.remediationKind}`,
      };
    }
  }
  return { ok: true };
}
