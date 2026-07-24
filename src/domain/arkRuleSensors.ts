/**
 * Pure ArkRules structure sensor evaluation (ADR 0013).
 *
 * Consumes closed class-shape / file facts + Effective ArkRules. Emits violations with
 * arkrule provenance. No filesystem, no TypeScript compiler.
 */

import type { EffectiveArkRules, EffectiveStructureRule, ArkRuleSensorId } from './arkRulesTypes';
import { ARK_RULE_TIER2_SENSOR_IDS } from './arkRulesTypes';

export type ClassShapeFact = {
  file: string;
  className: string;
  exported: boolean;
  hasPublicMutableFields: boolean;
  hasPublicSetters: boolean;
  hasPublicConstructor: boolean;
  hasStaticFactory: boolean;
  mutatingMethods: readonly {
    name: string;
    referencesGuardOrPublish: boolean;
  }[];
  /** Heuristic: data-only class (fields, no methods beyond accessors). */
  dataOnly?: boolean;
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
      }
    >
  >;
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(`^${escaped}$`);
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

function shapesForRule(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ClassShapeFact[] {
  return shapes.filter((shape) => {
    if (!shape.exported) return false;
    if (!matchesAppliesTo(shape.file, rule.appliesTo)) return false;
    if (layerForFile) {
      const layer = layerForFile(shape.file);
      if (layer && layer !== rule.provenance.layer) return false;
    }
    return true;
  });
}

function evaluateAggregatePrivateState(
  rule: EffectiveStructureRule,
  shapes: readonly ClassShapeFact[],
  layerForFile?: EvaluateArkRuleSensorsInput['layerForFile']
): ArkRuleSensorViolation[] {
  const out: ArkRuleSensorViolation[] = [];
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    if (shape.hasPublicMutableFields || shape.hasPublicSetters) {
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
    if (shape.hasPublicConstructor && !shape.hasStaticFactory) {
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
  for (const shape of shapesForRule(rule, shapes, layerForFile)) {
    for (const method of shape.mutatingMethods) {
      if (!method.referencesGuardOrPublish) {
        out.push(
          baseViolation(
            rule,
            shape.file,
            `Mutating method ${shape.className}.${method.name} does not reference a guard or publish symbol (sensor domain-event-on-mutation).`
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
    if (input.layerForFile) {
      const layer = input.layerForFile(file);
      if (layer && layer !== rule.provenance.layer) continue;
    }
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
    if (input.layerForFile) {
      const layer = input.layerForFile(file);
      if (layer && layer !== rule.provenance.layer) continue;
    }
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
 * Lightweight class-shape extraction from TypeScript source text (no compiler).
 * Conservative: prefers false negatives over false positives for mutability.
 * Tooling may replace with TypeScript-API facts; sensors consume the same shape.
 */
export function extractClassShapesFromSource(
  file: string,
  content: string
): ClassShapeFact[] {
  const shapes: ClassShapeFact[] = [];
  // Match exported class declarations (simple cases).
  const classRe =
    /export\s+(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:extends\s+[^{]+)?(?:implements\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = classRe.exec(content)) !== null) {
    const className = match[1]!;
    const start = match.index + match[0].length;
    // Brace match body
    let depth = 1;
    let i = start;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const body = content.slice(start, i - 1);

    const hasPublicMutableFields =
      /(?:^|\n)\s*(?:public\s+)?(?:readonly\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/m.test(
        body.replace(/(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+|async\s+|get\s+|set\s+)/g, '')
      ) &&
      /(?:^|\n)\s*(public\s+)?(?!constructor|static|get|set|private|protected|readonly)[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/m.test(
        body
      );
    // Simpler public field detection: "public foo" or unadorned "foo:" at class level
    const publicField =
      /(?:^|\n)\s*public\s+(?!static|async|get|set|constructor)[a-zA-Z_]/.test(body) ||
      /(?:^|\n)\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[^=;\n]+[;=]/m.test(
        body
          .split('\n')
          .filter((line) => !/^\s*(private|protected|static|constructor|get |set |async |\/)/.test(line))
          .join('\n')
      );
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

    const mutatingMethods: Array<{ name: string; referencesGuardOrPublish: boolean }> = [];
    const methodRe =
      /(?:^|\n)\s*(?:public\s+|private\s+|protected\s+|async\s+)*(?!constructor|get|set|static)([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(body)) !== null) {
      const name = methodMatch[1]!;
      const mStart = methodMatch.index + methodMatch[0].length;
      let mDepth = 1;
      let j = mStart;
      while (j < body.length && mDepth > 0) {
        if (body[j] === '{') mDepth += 1;
        else if (body[j] === '}') mDepth -= 1;
        j += 1;
      }
      const methodBody = body.slice(mStart, j - 1);
      const assignsThis = /this\.\w+\s*=/.test(methodBody);
      if (!assignsThis) continue;
      const referencesGuardOrPublish =
        /\b(ensureInvariants|assertInvariants|validate|publish|emit|raise|record)\b/.test(
          methodBody
        );
      mutatingMethods.push({ name, referencesGuardOrPublish });
    }

    const methodCount = (body.match(/(?:^|\n)\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g) ?? []).length;
    const dataOnly = methodCount <= 1 && (publicField || hasPublicMutableFields);

    shapes.push({
      file,
      className,
      exported: true,
      hasPublicMutableFields: publicField || hasPublicMutableFields,
      hasPublicSetters,
      hasPublicConstructor,
      hasStaticFactory,
      mutatingMethods: [...mutatingMethods],
      dataOnly,
    });
  }
  return shapes;
}
