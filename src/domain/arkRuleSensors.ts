/**
 * Pure ArkRules structure sensor evaluation (ADR 0013).
 *
 * Consumes closed class-shape / file facts + Effective ArkRules. Emits violations with
 * arkrule provenance. No filesystem, no TypeScript compiler.
 */

import type { EffectiveArkRules, EffectiveStructureRule, ArkRuleSensorId } from './arkRulesTypes';
import { findClassDeclarations, maskStringsAndComments, scanClassMembers } from './classSourceScan';
import {
  sourceHasPersistenceWrite,
  sourceHasTaggedSqlWrite,
  sourceImportsPersistenceDriverText,
} from './persistenceWriteHint';
import {
  isDomainRoleLayer,
  tsAstPropertyKeyName,
  unwrapTsAstExpression,
  type TsAstLike,
  type TsAstNode,
  type TsAstSourceFile,
} from './sourcePolicy';

/** Keep in lockstep with arkRulesTypes.ARK_RULE_TIER2_SENSOR_IDS (self-contained for CLI gen). */
const ARK_RULE_TIER2_SENSOR_IDS = ['no-anemic-model'] as const;

/**
 * Shared Domain + rulesInventory guard/publish vocabulary (DSHAPE-001).
 * One list: sensors and inventory suggestions must not drift.
 */
export const DOMAIN_INVARIANT_WORDS = [
  'ensureInvariants',
  'assertInvariants',
  'validate',
  'publish',
  'emit',
  'raise',
  'record',
] as const;

/** No `g` flag: `.test` must not advance lastIndex. */
export const DOMAIN_INVARIANT_WORD_RE = new RegExp(
  `\\b(${DOMAIN_INVARIANT_WORDS.join('|')})\\b`
);

const EVENTS_ARRAY_PROP = '(?:_?pendingEvents|domainEvents|uncommittedEvents|recordedEvents)';

export const DOMAIN_EVENTS_PUSH_RE = new RegExp(
  `\\bthis\\.${EVENTS_ARRAY_PROP}\\.push\\s*\\(`
);

const STRUCTURAL_GUARD_CLAUSE_RE =
  /\bif\s*\([^)]*\)\s*(?:\{[^}]*\bthrow\b|\bthrow\b)/;

const EVENTS_ARRAY_RESET_RE = new RegExp(
  `^this\\.${EVENTS_ARRAY_PROP}\\s*=\\s*\\[\\s*\\]`
);

const ANY_THIS_EMPTY_ARRAY_RE = /^this\.[A-Za-z_][A-Za-z0-9_]*\s*=\s*\[\s*\]/;

const THIS_FIELD_ASSIGNMENT_RE = /\bthis\.[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/g;

export function expectedDomainInvariantWordsPhrase(): string {
  return `${DOMAIN_INVARIANT_WORDS.join(', ')}, or events-array .push(`;
}

function referencesGuardOrPublish(source: string): boolean {
  const code = maskStringsAndComments(source);
  return (
    DOMAIN_INVARIANT_WORD_RE.test(code) ||
    DOMAIN_EVENTS_PUSH_RE.test(code) ||
    STRUCTURAL_GUARD_CLAUSE_RE.test(code)
  );
}

export function isIdiomaticEventsReset(
  source: string,
  assignIndex: number,
  methodName?: string
): boolean {
  const slice = source.slice(assignIndex);
  if (EVENTS_ARRAY_RESET_RE.test(slice)) return true;
  if (!ANY_THIS_EMPTY_ARRAY_RE.test(slice)) return false;
  if (methodName && /^pullEvents$/i.test(methodName)) return true;
  const windowStart = assignIndex > 200 ? assignIndex - 200 : 0;
  return /\bpullEvents\b/.test(source.slice(windowStart, assignIndex + 200));
}

function methodAssignsThis(methodName: string, methodBody: string): boolean {
  const code = maskStringsAndComments(methodBody);
  const re = new RegExp(THIS_FIELD_ASSIGNMENT_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    if (isIdiomaticEventsReset(code, match.index, methodName)) continue;
    return true;
  }
  return false;
}

function attachShapeTruncation(
  shape: ClassShapeFact,
  truncatedUntil: number | undefined
): ClassShapeFact {
  return truncatedUntil == null ? shape : { ...shape, truncatedUntil };
}

function shapeTruncatedUntil(shape: ClassShapeFact): number | undefined {
  return typeof shape.truncatedUntil === 'number' ? shape.truncatedUntil : undefined;
}

function shapeTruncationSuffix(shape: ClassShapeFact): string {
  const until = shapeTruncatedUntil(shape);
  return until == null ? '' : ` shape analysed until character ${until}`;
}

export type ClassShapeFact = {
  file: string;
  className: string;
  exported: boolean;
  hasPublicMutableFields: boolean;
  hasPublicSetters: boolean;
  hasPublicConstructor: boolean;
  hasStaticFactory: boolean;
  /**
   * Methods that mutate state directly or through `this.<helper>()` calls.
   * AR06 evaluates public/protected entries; private helpers are marked covered
   * so the finding points at the public caller that must record or guard.
   */
  mutatingMethods: readonly {
    name: string;
    referencesGuardOrPublish: boolean;
  }[];
  /** Heuristic: data-only class (fields, no methods beyond accessors). */
  dataOnly?: boolean;
  /**
   * Set when the scanner could not walk the class to its end: the character
   * offset (in the source file) where analysis stopped. Enumerable on purpose so
   * it survives fact canonicalisation and serialisation; enforced structure
   * sensors report it instead of passing in silence.
   */
  truncatedUntil?: number;
};

export type ArkRuleSensorViolation = {
  ruleId: string;
  code: string;
  message: string;
  file: string;
  line: number;
  fromLayer?: string;
  arkruleId: string;
  arkruleSource: string;
  severity: 'error' | 'warning';
  sensor: ArkRuleSensorId;
  /** When true, advisory surfaces only (does not fail strict). */
  failsStrict: boolean;
};

export type EvaluateArkRuleSensorsInput = {
  arkRules: EffectiveArkRules;
  classShapes: readonly ClassShapeFact[];
  /** Project-relative paths in scope for the analysis. */
  files: readonly string[];
  /**
   * Optional layer membership: path → layer name. When omitted, structure rules
   * apply by appliesTo globs only (or all files when appliesTo is absent).
   */
  layerForFile?: (path: string) => string | null | undefined;
  /**
   * Optional thin/orchestration heuristic flags per file (Tooling-supplied).
   */
  fileHints?: Readonly<
    Record<
      string,
      {
        orchestrationHeavy?: boolean;
        adapterThick?: boolean;
        persistenceWrite?: boolean;
      }
    >
  >;
};

/**
 * Glob to RegExp for appliesTo. Keep in lockstep with layerMatch.globToRegExp
 * (zero path segments for double-star-slash; self-contained for generate:cli-pure).
 * Critical: double-star-slash patterns match files with no intermediate directory.
 */
function escapeGlobLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegExp(glob: string): RegExp {
  // Normalize Windows path separators without eating glob escapes.
  let normalized = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      const next = glob[i + 1]!;
      if ('*?{}[],'.includes(next) || next === '\\') {
        normalized += '\\' + next;
        i += 1;
        continue;
      }
      normalized += '/';
      continue;
    }
    normalized += c;
  }

  let out = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const c = normalized[i]!;
    if (c === '\\' && i + 1 < normalized.length) {
      out += escapeGlobLiteral(normalized[i + 1]!);
      i += 1;
    } else if (c === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          // Zero-or-more path segments (including zero).
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += escapeGlobLiteral(c);
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesAppliesTo(file: string, appliesTo: readonly string[] | undefined): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return appliesTo.some((pattern) => globToRegExp(pattern).test(file));
}

function isTier2(sensor: string): boolean {
  return (ARK_RULE_TIER2_SENSOR_IDS as readonly string[]).includes(sensor);
}

function severityFor(rule: EffectiveStructureRule): {
  severity: 'error' | 'warning';
  failsStrict: boolean;
} {
  if (rule.mode === 'enforced' && !isTier2(rule.sensor)) {
    return { severity: 'error', failsStrict: true };
  }
  return { severity: 'warning', failsStrict: false };
}

function baseViolation(
  rule: EffectiveStructureRule,
  file: string,
  message: string,
  line = 1
): ArkRuleSensorViolation {
  const { severity, failsStrict } = severityFor(rule);
  return {
    ruleId: 'ARKRULE_STRUCTURE',
    code: rule.sensor,
    message,
    file,
    line,
    fromLayer: rule.provenance.layer,
    arkruleId: rule.id,
    arkruleSource: rule.provenance.sourceFile,
    severity,
    sensor: rule.sensor,
    failsStrict,
  };
}

/**
 * When layerForFile is provided, structure sensors require the same classification
 * as the layer plane: unclassified paths are skipped (NEW-ARKRULES-UNCLASSIFIED-ATTRIBUTION).
 * Without layerForFile, appliesTo globs alone scope the rule (unit tests / pure eval).
 */
function isInRuleLayer(
  file: string,
  rule: EffectiveStructureRule,
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): boolean {
  if (!layerForFile) return true;
  const layer = layerForFile(file);
  // Unclassified (null/undefined/"") must not inherit rule.provenance.layer attribution.
  if (!layer) return false;
  return layer === rule.provenance.layer;
}

function shapesForRule(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ClassShapeFact[] {
  return shapes.filter((shape) => {
    if (!shape.exported) return false;
    if (!matchesAppliesTo(shape.file, rule.appliesTo)) return false;
    if (!isInRuleLayer(shape.file, rule, layerForFile)) return false;
    return true;
  });
}

/**
 * A shape the scanner could not walk to its end (unbalanced header/body) is
 * reported, never passed in silence: later members may be invisible.
 */
function truncatedShapeViolation(
  rule: EffectiveStructureRule,
  shape: ClassShapeFact,
  what: string
): ArkRuleSensorViolation | undefined {
  const until = shapeTruncatedUntil(shape);
  if (until == null) return undefined;
  return baseViolation(
    rule,
    shape.file,
    `Exported class ${shape.className} shape analysed until character ${until}; later ${what} may be invisible (sensor ${rule.sensor}).`
  );
}

function evaluateAggregatePrivateState(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    const truncated = truncatedShapeViolation(rule, shape, 'members');
    if (truncated) out.push(truncated);
    // P1-L — require real mutability (setters or non-readonly public fields).
    // Readonly public props on intentional value/entity shapes are false-positive-prone.
    if (shape.hasPublicSetters || shape.hasPublicMutableFields) {
      out.push(
        baseViolation(
          rule,
          shape.file,
          `Exported class ${shape.className} exposes public mutable state (sensor aggregate-private-state).`
        )
      );
    }
  }
  return out;
}

function evaluateAlwaysValidFactory(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    const truncated = truncatedShapeViolation(rule, shape, 'constructors and factories');
    if (truncated) out.push(truncated);
    if (shape.hasPublicConstructor && !shape.hasStaticFactory) {
      // P1-L — prefer false negatives on intentional DDD / DI aggregates: a public
      // constructor alone is weak evidence. Only fire when mutable public surface
      // exists (needs an always-valid construction story).
      const needsAlwaysValidStory =
        shape.hasPublicMutableFields ||
        shape.hasPublicSetters ||
        (shape.mutatingMethods?.length ?? 0) > 0;
      if (!needsAlwaysValidStory) continue;
      out.push(
        baseViolation(
          rule,
          shape.file,
          `Exported class ${shape.className} exposes a public constructor without a static factory (sensor always-valid-factory).`
        )
      );
    }
  }
  return out;
}

function evaluateDomainEventOnMutation(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  const expected = expectedDomainInvariantWordsPhrase();
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    const truncation = shapeTruncationSuffix(shape);
    const truncated = truncatedShapeViolation(rule, shape, 'methods');
    if (truncated) out.push(truncated);
    for (const method of shape.mutatingMethods) {
      if (!method.referencesGuardOrPublish) {
        out.push(
          baseViolation(
            rule,
            shape.file,
            `Mutating method ${shape.className}.${method.name} does not reference ${expected} (sensor domain-event-on-mutation).${truncation}`
          )
        );
      }
    }
  }
  return out;
}

function evaluateOrchestrationOnly(
  rule: EffectiveStructureRule,
  input: EvaluateArkRuleSensorsInput
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const file of input.files) {
    if (!matchesAppliesTo(file, rule.appliesTo)) continue;
    if (!isInRuleLayer(file, rule, input.layerForFile)) continue;
    if (input.fileHints?.[file]?.orchestrationHeavy) {
      out.push(
        baseViolation(
          rule,
          file,
          `File appears to embed domain branching beyond guard-and-delegate orchestration (sensor orchestration-only).`
        )
      );
    }
  }
  return out;
}

function evaluateThinAdapter(
  rule: EffectiveStructureRule,
  input: EvaluateArkRuleSensorsInput
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const file of input.files) {
    if (!matchesAppliesTo(file, rule.appliesTo)) continue;
    if (!isInRuleLayer(file, rule, input.layerForFile)) continue;
    if (input.fileHints?.[file]?.adapterThick) {
      out.push(
        baseViolation(
          rule,
          file,
          `Adapter module mixes domain branching, persistence, and mapping beyond a thin adapter (sensor thin-adapter).`
        )
      );
    }
  }
  return out;
}

function evaluateWritesViaAggregate(
  rule: EffectiveStructureRule,
  input: EvaluateArkRuleSensorsInput
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const file of input.files) {
    if (!matchesAppliesTo(file, rule.appliesTo)) continue;
    if (!isInRuleLayer(file, rule, input.layerForFile)) continue;
    if (input.fileHints?.[file]?.persistenceWrite) {
      out.push(
        baseViolation(
          rule,
          file,
          `File imports a persistence driver and issues a write; route the write through a Domain aggregate and a persistence adapter (sensor writes-via-aggregate).`
        )
      );
    }
  }
  return out;
}

function evaluateNoAnemicModel(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ArkRuleSensorViolation[] {
  // Tier-2: always advisory.
  const out: ArkRuleSensorViolation[] = [];
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    if (shape.dataOnly === true) {
      const v = baseViolation(
        rule,
        shape.file,
        `Exported type ${shape.className} looks data-only / anemic (sensor no-anemic-model; advisory only).`
      );
      // Tier-2: force advisory even if misconfigured as enforced (schema also rejects enforced).
      out.push({ ...v, severity: 'warning', failsStrict: false });
    }
  }
  return out;
}

/**
 * Evaluate all structure sensors. Empty Effective Contract → no findings (byte-for-byte parity).
 */
export function evaluateArkRuleSensors(
  input: EvaluateArkRuleSensorsInput
): ArkRuleSensorViolation[] {
  if (!input.arkRules.structure.length) return [];
  const violations: ArkRuleSensorViolation[] = [];

  for (const rule of input.arkRules.structure) {
    switch (rule.sensor) {
      case 'aggregate-private-state':
        violations.push(
          ...evaluateAggregatePrivateState(rule, input.classShapes, input.layerForFile)
        );
        break;
      case 'always-valid-factory':
        violations.push(
          ...evaluateAlwaysValidFactory(rule, input.classShapes, input.layerForFile)
        );
        break;
      case 'domain-event-on-mutation':
        violations.push(
          ...evaluateDomainEventOnMutation(rule, input.classShapes, input.layerForFile)
        );
        break;
      case 'orchestration-only':
        violations.push(...evaluateOrchestrationOnly(rule, input));
        break;
      case 'thin-adapter':
        violations.push(...evaluateThinAdapter(rule, input));
        break;
      case 'writes-via-aggregate':
        violations.push(...evaluateWritesViaAggregate(rule, input));
        break;
      case 'no-anemic-model':
        violations.push(...evaluateNoAnemicModel(rule, input.classShapes, input.layerForFile));
        break;
      case 'invariant-coverage':
        // Owned by AR10 coverage pass.
        break;
      default:
        break;
    }
  }

  return violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.arkruleId.localeCompare(b.arkruleId) ||
      a.message.localeCompare(b.message)
  );
}

/**
 * ADR 0012 D3 — a structure rule whose appliesTo matches zero governed files is
 * never silent green. Advisory → warning; enforced → failsStrict.
 * Rules without appliesTo (whole-layer) never emit this signal.
 */
export function collectEmptyAppliesToFindings(
  arkRules: EffectiveArkRules,
  files: readonly string[]
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  const fileList = files.map((f) => f.replace(/\\/g, '/'));

  for (const rule of arkRules.structure) {
    if (!rule.appliesTo || rule.appliesTo.length === 0) continue;
    const matched = fileList.some((file) => matchesAppliesTo(file, rule.appliesTo));
    if (matched) continue;
    const { severity, failsStrict } = severityFor(rule);
    out.push({
      ruleId: 'ARKRULE_SCOPE_EMPTY',
      code: 'appliesTo-zero-match',
      message: `ArkRule structure "${rule.id}" appliesTo matched zero governed files (patterns: ${rule.appliesTo.join(', ')}). A zero-match scope is almost always misconfiguration.`,
      file: rule.provenance.sourceFile,
      line: 1,
      fromLayer: rule.provenance.layer,
      arkruleId: rule.id,
      arkruleSource: rule.provenance.sourceFile,
      severity,
      sensor: rule.sensor,
      failsStrict,
    });
  }

  for (const inv of arkRules.invariants ?? []) {
    if (!inv.appliesTo || inv.appliesTo.length === 0) continue;
    const matched = fileList.some((file) => matchesAppliesTo(file, inv.appliesTo));
    if (matched) continue;
    const failsStrict = inv.mode === 'enforced';
    out.push({
      ruleId: 'ARKRULE_SCOPE_EMPTY',
      code: 'appliesTo-zero-match',
      message: `ArkRule invariant "${inv.id}" appliesTo matched zero governed files (patterns: ${inv.appliesTo.join(', ')}). A zero-match scope is almost always misconfiguration.`,
      file: inv.provenance.sourceFile,
      line: 1,
      fromLayer: inv.provenance.layer,
      arkruleId: inv.id,
      arkruleSource: inv.provenance.sourceFile,
      severity: failsStrict ? 'error' : 'warning',
      sensor: 'invariant-coverage',
      failsStrict,
    });
  }

  return out.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.arkruleId.localeCompare(b.arkruleId) ||
      a.message.localeCompare(b.message)
  );
}

/** Domain-role house: delegates to canonical sourcePolicy.isDomainRoleLayer. */
export function isDomainRoleLayerName(
  layer: string,
  intentPrefixes: readonly string[] = []
): boolean {
  return isDomainRoleLayer(layer, intentPrefixes);
}

export type EmptyInvariantCatalogInput = {
  /** `arkRules` map present on ark.config.json. Absence stays silent. */
  arkRulesActive: boolean;
  arkRules: EffectiveArkRules;
  layers: readonly { name: string; intentPrefixes?: readonly string[] }[];
  files: readonly { path: string; layer?: string | null | undefined }[];
};

/**
 * §2 catalog residual — ArkRules is on, Domain has code, invariants[] is empty.
 * Advisory by default. failsStrict only when a domain structure rule is already
 * enforced (the project opted into ArkRules merge teeth). Not freezable.
 */
export function collectEmptyInvariantCatalogFindings(
  input: EmptyInvariantCatalogInput
): ArkRuleSensorViolation[] {
  if (input.arkRulesActive !== true) return [];
  const domainLayers = (input.layers ?? [])
    .filter((layer) => isDomainRoleLayerName(layer.name, layer.intentPrefixes ?? []))
    .map((layer) => layer.name);
  if (domainLayers.length === 0) return [];

  const domainSet = new Set(domainLayers);
  const domainPopulated = (input.files ?? []).some((file) => {
    const layer = typeof file.layer === 'string' ? file.layer : '';
    return layer.length > 0 && domainSet.has(layer);
  });
  if (!domainPopulated) return [];

  const domainInvariants = (input.arkRules.invariants ?? []).filter((inv) =>
    domainSet.has(inv.provenance.layer)
  );
  if (domainInvariants.length > 0) return [];

  const fillLayer =
    domainLayers.find((name) => input.arkRules.byLayer?.[name]) ?? domainLayers[0]!;
  const fillPath =
    input.arkRules.byLayer?.[fillLayer]?.sourceFile ?? `arkrules/${fillLayer}.json`;
  const optedIntoTeeth = (input.arkRules.structure ?? []).some(
    (rule) =>
      rule.mode === 'enforced' &&
      domainSet.has(rule.provenance.layer) &&
      !isTier2(rule.sensor)
  );

  return [
    {
      ruleId: 'INVARIANT_CATALOG_EMPTY',
      code: 'invariant-catalog-empty',
      message:
        `ArkRules is on and ${fillLayer} has code, but invariants[] is empty — there are no phrases the code must preserve. Add 1–2 short phrases in ${fillPath}.`,
      file: fillPath,
      line: 1,
      fromLayer: fillLayer,
      arkruleId: 'invariant-catalog',
      arkruleSource: fillPath,
      severity: optedIntoTeeth ? 'error' : 'warning',
      sensor: 'invariant-coverage',
      failsStrict: optedIntoTeeth,
    },
  ];
}

/**
 * IO / ORM import evidence and receiver-bound write tokens live in
 * persistenceWriteHint (shared with ArkOrder — one definition, not lockstep copies).
 * Callee must be a persistence client (db|tx|client|prisma|drizzle, `new PrismaClient()`,
 * or a name bound to a driver constructor); not repo.update(.
 */
/** Optional resolved-import facts when the collector already classified the specifier. */
export type ResolvedPersistenceImportFact = {
  specifier?: string;
  resolvedFile?: string;
  layer?: string | null;
};

function isPersistenceDriverLayer(layer: string | null | undefined): boolean {
  return layer === 'PersistenceAdapters';
}

function sourceImportsPersistenceDriver(
  content: string,
  resolvedImports?: readonly ResolvedPersistenceImportFact[]
): boolean {
  if (sourceImportsPersistenceDriverText(content)) return true;
  if (!resolvedImports) return false;
  for (const imp of resolvedImports) {
    if (isPersistenceDriverLayer(imp.layer)) return true;
    const specifier = imp.specifier;
    if (!specifier) continue;
    const synthetic = `from '${specifier}'`;
    if (sourceImportsPersistenceDriverText(synthetic)) return true;
  }
  return false;
}

const HANDLER_SHAPE_HINT_RE =
  /\b(?:@Controller|@Get|@Post|@Put|@Delete|Router\(\)|createRouter|express\.Router|fastify\.(?:get|post)|export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b|export\s+const\s+(?:GET|POST|PUT|DELETE|PATCH)\s*=)/;

const FRAMEWORK_HTTP_HINT_RE =
  /(?:^|[;\n])\s*(?:import\s+(?:type\s+)?(?:[^;]{0,512}?\s+from\s+)?|export\s+(?:type\s+)?[^;]{0,512}?\s+from\s+)['"]next\/server(?:\.js)?['"]/;

/** Business-predicate / domain branching signals (conservative). */
const DOMAIN_PREDICATE_HINT_RE =
  /\b(?:export\s+)?(?:async\s+)?function\s+(?:can|calculate|compute|should|ensure|validate|is|has)[A-Z]\w*|\b(?:export\s+)?const\s+(?:can|calculate|compute|should|ensure|validate|is|has)[A-Z]\w*\s*=/;

const BUSINESS_BRANCH_HINT_RE =
  /\bif\s*\(\s*(?:!)?(?:order|invoice|cart|user|account|policy|aggregate|entity|amount|total|balance|status|state)\b/i;

/**
 * Pure Tooling/Domain heuristic for orchestration-only / thin-adapter fileHints.
 * Prefers false negatives over false positives (ADR 0013 discipline).
 * Returns null when neither flag is set (callers may omit the path).
 */
export function deriveArkRuleFileHints(
  _file: string,
  content: string,
  resolvedImports?: readonly ResolvedPersistenceImportFact[]
): {
  orchestrationHeavy?: boolean;
  adapterThick?: boolean;
  persistenceWrite?: boolean;
} | null {
  if (!content) return null;

  const hasIo = sourceImportsPersistenceDriver(content, resolvedImports);
  // A tagged-template SQL write head is evidence on its own (the use case composed
  // the statement). ORM verbs and untagged SQL still need a driver import.
  const persistenceWrite =
    (hasIo && sourceHasPersistenceWrite(content)) || sourceHasTaggedSqlWrite(content);
  // Orchestration/adapter heuristics need a longer window; writes still fire on short probes.
  if (content.length < 40) {
    return persistenceWrite ? { persistenceWrite: true } : null;
  }

  const domainPredicates = content.match(new RegExp(DOMAIN_PREDICATE_HINT_RE.source, 'g')) ?? [];
  const businessBranches = content.match(new RegExp(BUSINESS_BRANCH_HINT_RE.source, 'g')) ?? [];
  const ifCount = (content.match(/\bif\s*\(/g) ?? []).length;
  const switchCount = (content.match(/\bswitch\s*\(/g) ?? []).length;

  // Orchestration-heavy: strong multi-signal domain logic beyond guard-and-delegate.
  // Require ≥2 domain-predicate defs, OR one predicate + several domain-shaped branches.
  const orchestrationHeavy =
    domainPredicates.length >= 2 ||
    (domainPredicates.length >= 1 && businessBranches.length >= 2) ||
    (businessBranches.length >= 3 && ifCount + switchCount >= 6);

  // Adapter-thick: multi-concern mixing — domain branching + persistence/HTTP in one module.
  const hasHandler =
    HANDLER_SHAPE_HINT_RE.test(content) || FRAMEWORK_HTTP_HINT_RE.test(content);
  const hasDomainSignal =
    domainPredicates.length >= 1 || businessBranches.length >= 2;
  const hasMapping =
    /\b(?:mapTo|toDomain|toDto|fromRow|toEntity|fromPrisma|serialize|deserialize)\w*\s*[(=]/.test(
      content
    );
  const adapterThick =
    (hasIo && hasDomainSignal) ||
    (hasHandler && hasDomainSignal) ||
    (hasIo && hasMapping && (ifCount >= 4 || domainPredicates.length >= 1)) ||
    (hasHandler && hasIo); // hollow-persistence style: HTTP + persistence together

  if (!orchestrationHeavy && !adapterThick && !persistenceWrite) return null;
  return {
    ...(orchestrationHeavy ? { orchestrationHeavy: true } : {}),
    ...(adapterThick ? { adapterThick: true } : {}),
    ...(persistenceWrite ? { persistenceWrite: true } : {}),
  };
}

/**
 * Build fileHints map from path→content. Omits paths with no flags (sparse map).
 */
export function buildArkRuleFileHints(
  fileContents: Readonly<Record<string, string>>,
  resolvedImportsByFile?: Readonly<Record<string, readonly ResolvedPersistenceImportFact[]>>
): Record<
  string,
  { orchestrationHeavy?: boolean; adapterThick?: boolean; persistenceWrite?: boolean }
> {
  const out: Record<
    string,
    { orchestrationHeavy?: boolean; adapterThick?: boolean; persistenceWrite?: boolean }
  > = {};
  for (const [file, content] of Object.entries(fileContents)) {
    const rel = file.replace(/\\/g, '/');
    const hint = deriveArkRuleFileHints(file, content, resolvedImportsByFile?.[rel]);
    if (hint) out[rel] = hint;
  }
  return out;
}

const CONTROL_FLOW_METHOD_NAMES = new Set(['if', 'match', 'when']);
const DOMAIN_INVARIANT_WORD_SET: ReadonlySet<string> = new Set(DOMAIN_INVARIANT_WORDS);
const EVENTS_ARRAY_PROP_RE = /^_?(?:pendingEvents|domainEvents|uncommittedEvents|recordedEvents)$/;
const STATIC_FACTORY_NAME_RE = /^(?:create|of|from|parse|build|make|new)$/;

export type ExtractClassShapesOptions = {
  ts?: TsAstLike | null;
  sourceFile?: TsAstSourceFile | null;
};

function hasAstModifier(
  node: { readonly modifiers?: readonly TsAstNode[] },
  kind: number
): boolean {
  return Array.isArray(node.modifiers) && node.modifiers.some((mod) => mod.kind === kind);
}

function isNestedFunctionOrClassBoundary(ts: TsAstLike, node: TsAstNode): boolean {
  const k = node.kind;
  return (
    k === ts.SyntaxKind.ClassDeclaration ||
    k === ts.SyntaxKind.FunctionDeclaration ||
    k === ts.SyntaxKind.FunctionExpression ||
    k === ts.SyntaxKind.MethodDeclaration ||
    k === ts.SyntaxKind.GetAccessor ||
    k === ts.SyntaxKind.SetAccessor
  );
}

function isAssignmentOperator(ts: TsAstLike, kind: number): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    (kind >= ts.SyntaxKind.FirstCompoundAssignment && kind <= ts.SyntaxKind.LastCompoundAssignment)
  );
}

function methodBodyMutatesThisAst(
  ts: TsAstLike,
  body: TsAstNode,
  methodName: string
): boolean {
  let mutates = false;
  const visit = (node: TsAstNode): void => {
    if (mutates) return;
    if (node !== body && isNestedFunctionOrClassBoundary(ts, node)) return;
    if (ts.isBinaryExpression(node) && isAssignmentOperator(ts, node.operatorToken.kind)) {
      const left = unwrapTsAstExpression(ts, node.left);
      if (
        ts.isPropertyAccessExpression(left) &&
        left.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        const right = unwrapTsAstExpression(ts, node.right);
        const isEmptyArrayReset =
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isArrayLiteralExpression(right) &&
          right.elements.length === 0 &&
          (EVENTS_ARRAY_PROP_RE.test(left.name.text) || /^pullEvents$/i.test(methodName));
        if (!isEmptyArrayReset) {
          mutates = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return mutates;
}

/**
 * AST-backed verification for `domain-event-on-mutation`: requires a real CallExpression
 * naming a domain invariant/publish verb or `this.<events>.push(...)`, or a real
 * ThrowStatement inside the method's own body (rejects `const record = 1`, comments,
 * strings, and uninvoked nested closures).
 */
function methodBodyHasGuardOrPublishAst(ts: TsAstLike, body: TsAstNode): boolean {
  let found = false;
  const visit = (node: TsAstNode): void => {
    if (found) return;
    if (
      node !== body &&
      (isNestedFunctionOrClassBoundary(ts, node) || node.kind === ts.SyntaxKind.ArrowFunction)
    ) {
      return;
    }
    if (ts.isThrowStatement(node) || node.kind === ts.SyntaxKind.ThrowStatement) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrapTsAstExpression(ts, node.expression);
      if (ts.isIdentifier(callee) && DOMAIN_INVARIANT_WORD_SET.has(callee.text)) {
        found = true;
        return;
      }
      if (ts.isPropertyAccessExpression(callee)) {
        if (DOMAIN_INVARIANT_WORD_SET.has(callee.name.text)) {
          found = true;
          return;
        }
        if (callee.name.text === 'push') {
          const receiver = unwrapTsAstExpression(ts, callee.expression);
          if (
            ts.isPropertyAccessExpression(receiver) &&
            receiver.expression.kind === ts.SyntaxKind.ThisKeyword &&
            EVENTS_ARRAY_PROP_RE.test(receiver.name.text)
          ) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

type MethodVisibility = 'public' | 'private' | 'protected';

type ScannedMethodFacts = {
  name: string;
  visibility: MethodVisibility;
  directMutates: boolean;
  directGuard: boolean;
  calls: readonly string[];
};

/**
 * Collect `this.<method>(...)` calls that can run in the method's own body.
 * Nested functions and classes are skipped: a dead closure must not make a
 * public mutator look guarded (same boundary rule as the direct guard scan).
 */
function methodBodyCallsThisAst(ts: TsAstLike, body: TsAstNode): string[] {
  const calls = new Set<string>();
  const visit = (node: TsAstNode): void => {
    if (
      node !== body &&
      (isNestedFunctionOrClassBoundary(ts, node) || node.kind === ts.SyntaxKind.ArrowFunction)
    ) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrapTsAstExpression(ts, node.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const receiver = unwrapTsAstExpression(ts, callee.expression);
        if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
          const name = callee.name.text;
          if (name) calls.add(name);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return [...calls];
}

function methodBodyCallsThisLexical(body: string): string[] {
  const code = maskStringsAndComments(body);
  const calls = new Set<string>();
  const re = /\bthis\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    if (name) calls.add(name);
  }
  return [...calls];
}

/**
 * AR06 is an entrypoint rule, not a per-method rule. A private helper that only
 * mutates state is part of a public method's implementation; the public method
 * is the thing that must record or guard. Propagate mutation and guard evidence
 * through `this.<method>()` calls, then evaluate public/protected entrypoints.
 * Private helpers are marked covered so they do not emit a duplicate finding
 * next to the caller that actually has to change.
 */
function buildMutatingMethodsFromFacts(
  facts: readonly ScannedMethodFacts[]
): Array<{ name: string; referencesGuardOrPublish: boolean }> {
  const mutates = new Set(facts.filter((fact) => fact.directMutates).map((fact) => fact.name));
  const guards = new Set(facts.filter((fact) => fact.directGuard).map((fact) => fact.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const fact of facts) {
      if (!mutates.has(fact.name) && fact.calls.some((called) => mutates.has(called))) {
        mutates.add(fact.name);
        changed = true;
      }
      if (!guards.has(fact.name) && fact.calls.some((called) => guards.has(called))) {
        guards.add(fact.name);
        changed = true;
      }
    }
  }
  return facts
    .filter((fact) => mutates.has(fact.name))
    .map((fact) => ({
      name: fact.name,
      referencesGuardOrPublish:
        fact.visibility === 'private' ? true : guards.has(fact.name),
    }));
}

function extractClassShapesWithAst(
  file: string,
  ts: TsAstLike,
  sourceFile: TsAstSourceFile
): ClassShapeFact[] {
  const shapes: ClassShapeFact[] = [];
  const visit = (node: TsAstNode): void => {
    if (ts.isClassDeclaration(node)) {
      const isExported =
        hasAstModifier(node, ts.SyntaxKind.ExportKeyword) &&
        !hasAstModifier(node, ts.SyntaxKind.DefaultKeyword);
      if (isExported && node.name) {
        let publicMutableFieldCount = 0;
        let hasPublicSetters = false;
        let hasPublicConstructor = false;
        let hasStaticFactory = false;
        let methodCount = 0;
        const methodFacts: ScannedMethodFacts[] = [];

        for (const member of node.members) {
          if (ts.isPropertyDeclaration(member)) {
            if (
              !hasAstModifier(member, ts.SyntaxKind.PrivateKeyword) &&
              !hasAstModifier(member, ts.SyntaxKind.ProtectedKeyword) &&
              !hasAstModifier(member, ts.SyntaxKind.ReadonlyKeyword) &&
              !hasAstModifier(member, ts.SyntaxKind.StaticKeyword)
            ) {
              publicMutableFieldCount += 1;
            }
            continue;
          }
          if (ts.isSetAccessorDeclaration(member)) {
            if (
              !hasAstModifier(member, ts.SyntaxKind.PrivateKeyword) &&
              !hasAstModifier(member, ts.SyntaxKind.ProtectedKeyword)
            ) {
              hasPublicSetters = true;
            }
            continue;
          }
          if (ts.isConstructorDeclaration(member)) {
            methodCount += 1;
            if (
              !hasAstModifier(member, ts.SyntaxKind.PrivateKeyword) &&
              !hasAstModifier(member, ts.SyntaxKind.ProtectedKeyword)
            ) {
              hasPublicConstructor = true;
            }
            continue;
          }
          if (ts.isMethodDeclaration(member)) {
            methodCount += 1;
            const memberName = tsAstPropertyKeyName(ts, member.name);
            const isStatic = hasAstModifier(member, ts.SyntaxKind.StaticKeyword);
            if (isStatic) {
              if (memberName && STATIC_FACTORY_NAME_RE.test(memberName)) {
                hasStaticFactory = true;
              } else if (member.type) {
                const typeText = member.type.getText?.(sourceFile)?.trim() ?? '';
                if (/^[A-Za-z_]/.test(typeText)) hasStaticFactory = true;
              }
              continue;
            }
            if (!memberName || !member.body) continue;
            if (memberName === 'constructor' || CONTROL_FLOW_METHOD_NAMES.has(memberName)) {
              continue;
            }
            const visibility: MethodVisibility = hasAstModifier(
              member,
              ts.SyntaxKind.PrivateKeyword
            )
              ? 'private'
              : hasAstModifier(member, ts.SyntaxKind.ProtectedKeyword)
                ? 'protected'
                : 'public';
            methodFacts.push({
              name: memberName,
              visibility,
              directMutates: methodBodyMutatesThisAst(ts, member.body, memberName),
              directGuard: methodBodyHasGuardOrPublishAst(ts, member.body),
              calls: methodBodyCallsThisAst(ts, member.body),
            });
          }
        }

        const mutatingMethods = buildMutatingMethodsFromFacts(methodFacts);
        const hasPublicMutableFields = publicMutableFieldCount > 0;
        const dataOnly =
          methodCount <= 1 && publicMutableFieldCount >= 2 && hasPublicMutableFields;

        shapes.push({
          file,
          className: node.name.text,
          exported: true,
          hasPublicMutableFields,
          hasPublicSetters,
          hasPublicConstructor,
          hasStaticFactory,
          mutatingMethods,
          dataOnly,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return shapes;
}

/**
 * Class-shape extraction from TypeScript source text.
 * Uses real TypeScript AST verification when `options.ts` is supplied (and the file
 * parses cleanly); falls back to the conservative lexical scanner when `ts` is absent
 * or the file has parse diagnostics (preserving `truncatedUntil` reporting).
 *
 * Limitation (AR05/AR06): only `export class` / `export abstract class` forms.
 * `export default class`, re-exported classes, and non-exported aggregates are
 * invisible — enforced structure sensors stay silent (false negative). Silence
 * is never proof of compliance.
 */
export function extractClassShapesFromSource(
  file: string,
  content: string,
  options: ExtractClassShapesOptions = {}
): ClassShapeFact[] {
  const ts = options.ts;
  if (ts && typeof ts.createSourceFile === 'function') {
    const sourceFile =
      options.sourceFile ?? ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const hasParseErrors =
      Array.isArray(sourceFile.parseDiagnostics) && sourceFile.parseDiagnostics.length > 0;
    if (!hasParseErrors) {
      return extractClassShapesWithAst(file, ts, sourceFile);
    }
  }

  const shapes: ClassShapeFact[] = [];
  for (const decl of findClassDeclarations(content, { exportedOnly: true })) {
    const className = decl.name;
    if (decl.bodyStart == null) {
      // Header seen, body not derivable: an unshaped class, never a silent pass.
      shapes.push(
        attachShapeTruncation(
          {
            file,
            className,
            exported: true,
            hasPublicMutableFields: false,
            hasPublicSetters: false,
            hasPublicConstructor: false,
            hasStaticFactory: false,
            mutatingMethods: [],
          },
          decl.start
        )
      );
      continue;
    }
    const start = decl.bodyStart;
    const classUnclosed = decl.bodyEnd == null;
    const body = content.slice(start, decl.bodyEnd ?? content.length);

    const scanned = scanClassMembers(body);
    const truncatedUntil = classUnclosed
      ? content.length
      : scanned.truncatedAt == null
        ? undefined
        : start + scanned.truncatedAt;

    const publicMutableFields = scanned.members.filter((member) => {
      if (member.kind !== 'field') return false;
      if (member.name === 'constructor') return false;
      if (member.modifiers.includes('private') || member.modifiers.includes('protected')) {
        return false;
      }
      if (member.modifiers.includes('readonly')) return false;
      if (member.modifiers.includes('static')) return false;
      if (member.modifiers.includes('get') || member.modifiers.includes('set')) return false;
      return true;
    });
    const hasPublicMutableFields = publicMutableFields.length > 0;

    const hasPublicSetters = /(?:^|[\n;{])\s*(?:public\s+)?set\s+[a-zA-Z_]/.test(body);
    const hasPrivateConstructor = /(?:^|[\n;{])\s*private\s+constructor\s*\(/.test(body);
    const hasPublicConstructor =
      /(?:^|[\n;{])\s*(?:public\s+)?constructor\s*\(/.test(body) && !hasPrivateConstructor;
    const hasStaticFactory =
      /(?:^|[\n;{])\s*static\s+(?:async\s+)?(?:create|of|from|parse|build|make|new)\s*[<(]/.test(
        body
      ) ||
      /(?:^|[\n;{])\s*static\s+(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*:\s*[A-Za-z_]/.test(
        body
      );

    const methodFacts: ScannedMethodFacts[] = [];
    for (const member of scanned.members) {
      if (member.kind !== 'method') continue;
      if (member.name === 'constructor') continue;
      if (member.modifiers.includes('static')) continue;
      if (member.modifiers.includes('get') || member.modifiers.includes('set')) continue;
      if (CONTROL_FLOW_METHOD_NAMES.has(member.name)) continue;
      const visibility: MethodVisibility = member.modifiers.includes('private')
        ? 'private'
        : member.modifiers.includes('protected')
          ? 'protected'
          : 'public';
      methodFacts.push({
        name: member.name,
        visibility,
        directMutates: methodAssignsThis(member.name, member.body),
        directGuard: referencesGuardOrPublish(member.body),
        calls: methodBodyCallsThisLexical(member.body),
      });
    }
    const mutatingMethods = buildMutatingMethodsFromFacts(methodFacts);

    const methodCount = scanned.members.filter((member) => member.kind === 'method').length;
    const dataOnly =
      methodCount <= 1 &&
      publicMutableFields.length >= 2 &&
      hasPublicMutableFields;

    shapes.push(
      attachShapeTruncation(
        {
          file,
          className,
          exported: true,
          hasPublicMutableFields,
          hasPublicSetters,
          hasPublicConstructor,
          hasStaticFactory,
          mutatingMethods: [...mutatingMethods],
          dataOnly,
        },
        truncatedUntil
      )
    );
  }
  return shapes;
}
