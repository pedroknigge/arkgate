/**
 * Tooling adapter for the sensor promotability map and the promotion write.
 *
 * Hand-written (NOT generated): the pure projection lives in
 * `src/domain/sensorPromotion.ts` → `bin/lib/sensor-promotion.mjs`, and
 * everything with a filesystem in it belongs here.
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildSensorMap, promoteRuleInArkRulesText, ruleCountKey } from './sensor-promotion.mjs';
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { evaluateInvariantCoverage } from './invariant-coverage.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';

/**
 * The root as the filesystem sees it. Comparing a realpath against a lexical
 * root is a guaranteed mismatch wherever the root itself sits behind a link
 * (`/var` on macOS, a symlinked checkout, a bind mount), and every containment
 * test would then answer "outside". Same helper pair as literal-path-drift-io.
 */
function realRoot(root) {
  const resolved = path.resolve(root);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function isInsideRoot(real, rootReal) {
  return real === rootReal || real.startsWith(rootReal + path.sep);
}

/**
 * Build the promotability map for a project, WITHOUT the TypeScript resolver.
 *
 * Everything here is a declaration read off disk: the contract, the ArkRules
 * documents it points at, and — for invariants — the coverage evidence scan,
 * which is a filesystem walk plus a text match and never executes anything. A
 * full `ark-check` on a real repository takes ~160s; this answers in the time
 * it takes to read the files.
 *
 * @param {string} root
 * @param {Record<string, unknown>} config
 * @returns {{ ok: true, map: object, coverage: { partial: boolean, evaluated: boolean } }
 *          | { ok: false, reason: string, issues?: object[] }}
 */
export function loadSensorMap(root, config, facts) {
  const refs = config?.arkRules;
  if (!refs || typeof refs !== 'object' || Object.keys(refs).length === 0) {
    return {
      ok: true,
      map: buildSensorMap({ structure: [], invariants: [] }),
      coverage: { partial: false, evaluated: false },
      arkRulesActive: false,
    };
  }
  const loaded = loadEffectiveArkRulesFromDisk(root, config);
  if (loaded.errors?.length) {
    return {
      ok: false,
      reason:
        'ArkRules references failed to load, so no promotability can be reported (fail closed).',
      issues: loaded.errors,
    };
  }
  const structure = (loaded.arkRules.structure ?? []).map((entry) => ({
    id: entry.id,
    sensor: entry.sensor,
    mode: entry.mode ?? 'advisory',
    layer: entry.provenance?.layer ?? null,
    sourceFile: entry.provenance?.sourceFile ?? null,
    description: entry.description ?? null,
  }));

  const catalogued = loaded.arkRules.invariants ?? [];
  let coverageRows = [];
  let partial = false;
  if (catalogued.length > 0) {
    const inputs = loadInvariantCoverageInputs(root, facts ?? { files: [] }, {
      invariantIds: invariantIdsFromCatalog(loaded.arkRules),
      ...coverageOptionsFromConfig(config),
    });
    const coverage = evaluateInvariantCoverage({
      arkRules: loaded.arkRules,
      fileContents: inputs.fileContents,
      testFiles: inputs.testFiles,
      testGlobsMissing: inputs.testGlobsMissing,
      coverageBudgetExhausted: inputs.coverageBudgetExhausted === true,
      ...(inputs.stats ? { coverageStats: inputs.stats } : {}),
      // The declared roots decide `outsideDeclaredRoots`, which is one of the
      // four reasons canPromoteInvariant refuses. Dropping them here would make
      // this surface promise a promotion the gate then denies.
      ...(inputs.coverageRoots ? { coverageRoots: inputs.coverageRoots } : {}),
    });
    coverageRows = coverage.coverage ?? [];
    partial = coverage.partial === true;
  }
  const evidenceById = new Map(coverageRows.map((row) => [row.invariantId, row]));

  const invariants = catalogued.map((entry) => ({
    id: entry.id,
    mode: entry.mode ?? 'advisory',
    layer: entry.provenance?.layer ?? null,
    sourceFile: entry.provenance?.sourceFile ?? null,
    description: entry.description ?? null,
    ...(evidenceById.has(entry.id) ? { coverage: evidenceById.get(entry.id) } : {}),
  }));

  return {
    ok: true,
    map: buildSensorMap({ structure, invariants }),
    coverage: { partial, evaluated: catalogued.length > 0 },
    arkRulesActive: true,
  };
}

/**
 * Count the findings each declared rule produced in an analysis that already
 * ran. One run answers for every rule: the loop this replaces was one full
 * ~160s run per attempted promotion.
 *
 * Structure sensors stamp `arkruleId` AND `arkruleSource` on every violation
 * they emit (`baseViolation` in arkRuleSensors.ts) and so do the
 * invariant-coverage findings, so grouping by that pair is the per-rule count —
 * there is no per-rule evaluator to call, and inventing one would be a second
 * opinion that could disagree with the gate.
 *
 * The pair, not the bare id: ids are unique per DOCUMENT (`validateSemantics`
 * keeps its `seen` set per file and `buildEffectiveArkRules` concatenates the
 * layers without a second check), so two layer files declaring `shared-id`
 * would pool their findings under it and each row would report the other's as
 * its own.
 *
 * @param {Array<object>} findings violations and warnings from the same run
 * @returns {Record<string, number>} `<sourceFile>#<ruleId>` → count
 */
export function countFindingsByRule(findings) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const finding of findings ?? []) {
    const id = finding?.arkruleId;
    if (typeof id !== 'string' || id.length === 0) continue;
    const source = typeof finding?.arkruleSource === 'string' ? finding.arkruleSource : null;
    const key = ruleCountKey(source, id);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Set one rule to `mode: "enforced"` in the ArkRules document that declares it.
 *
 * The containment discipline is the one `--write` on `--path-drift` had to
 * learn the hard way: the parent must still be inside the root as the
 * filesystem sees it, the read-modify-write goes through a single
 * `O_NOFOLLOW` descriptor so the LEAF is never resolved twice, and a hard link
 * is refused because lstat reports one as an ordinary file while the write
 * lands on a shared inode.
 *
 * What it does NOT close, stated rather than implied: `O_NOFOLLOW` guards the
 * final component only. A local attacker who can swap an ANCESTOR directory for
 * a symlink between the parent realpath check and the open still wins the race.
 * Both writers in this package share that gap; closing it needs an
 * openat-relative walk, which is a change to both, not to this one.
 *
 * @param {string} root
 * @param {string} sourceFile project-relative path to the ArkRules document
 * @param {string} ruleId
 * @param {string} [expectedSensor] the sensor the rule had when it was priced
 * @returns {{ ok: boolean, file: string, reason: string }}
 */
export function writeRulePromotion(root, sourceFile, ruleId, expectedSensor) {
  const rootResolved = path.resolve(root);
  const rootReal = realRoot(root);
  const relative = String(sourceFile ?? '').replace(/\\/g, '/');
  const fail = (reason) => ({ ok: false, file: relative, reason });
  if (!relative) return fail('no source file recorded for this rule');
  const absolute = path.resolve(rootResolved, relative);
  if (!isInsideRoot(absolute, rootResolved)) return fail('outside-root');
  let realParent;
  try {
    realParent = fs.realpathSync.native(path.dirname(absolute));
  } catch {
    return fail('unreadable');
  }
  if (!isInsideRoot(realParent, rootReal)) return fail('outside-root');

  let fd;
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  } catch (error) {
    const code = error?.code;
    return fail(code === 'ELOOP' || code === 'EMLINK' ? 'symlink' : 'unwritable');
  }
  try {
    const stat = fs.fstatSync(fd);
    if (stat.nlink > 1) return fail('hard-link');
    const buffer = Buffer.alloc(stat.size);
    fs.readSync(fd, buffer, 0, stat.size, 0);
    const text = buffer.toString('utf8');
    // Reading as utf8 turns an invalid byte into U+FFFD and writing the whole
    // string back would destroy it, anywhere in the file. Round-tripping the
    // buffer is the exact test.
    if (!Buffer.from(text, 'utf8').equals(buffer)) return fail('not-utf8');
    const result = promoteRuleInArkRulesText(text, ruleId, expectedSensor);
    if (!result.ok) return fail(result.reason);
    const out = Buffer.from(result.text, 'utf8');
    // Write BEFORE truncating, and only truncate once every byte is down. A
    // truncate-then-write on the live descriptor turns an ENOSPC, an EIO or a
    // signal into an empty or half-written contract; this order leaves a
    // superset of the old document instead, which still parses back to a
    // contract the loader can read.
    let offset = 0;
    while (offset < out.length) {
      const wrote = fs.writeSync(fd, out, offset, out.length - offset, offset);
      // A zero-byte write is not progress; looping on it would spin forever.
      if (!(wrote > 0)) return fail('short-write');
      offset += wrote;
    }
    fs.ftruncateSync(fd, out.length);
    // The reported success has to mean the contract survives a crash: this file
    // IS the contract, and a lost write leaves the project with no loadable one.
    try {
      fs.fsyncSync(fd);
    } catch {
      // Some filesystems refuse fsync on a regular file (rare, but real). The
      // bytes are written either way; not durable is not a reason to report the
      // write as failed.
    }
    return { ok: true, file: relative, reason: result.reason };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'unwritable');
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* already closed */
    }
  }
}
