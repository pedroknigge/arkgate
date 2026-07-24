/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkRuleSensors.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/arkrules-sensors.mjs). Zero Node I/O.
 */

/** Keep in lockstep with arkRulesTypes.ARK_RULE_TIER2_SENSOR_IDS (self-contained for CLI gen). */
const ARK_RULE_TIER2_SENSOR_IDS = ['no-anemic-model'];
/**
 * Glob to RegExp for appliesTo. Keep in lockstep with layerMatch.globToRegExp
 * (zero path segments for double-star-slash; self-contained for generate:cli-pure).
 * Critical: double-star-slash patterns match files with no intermediate directory.
 */
function escapeGlobLiteral(ch) {
    return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
function globToRegExp(glob) {
    // Normalize Windows path separators without eating glob escapes.
    let normalized = '';
    for (let i = 0; i < glob.length; i += 1) {
        const c = glob[i];
        if (c === '\\' && i + 1 < glob.length) {
            const next = glob[i + 1];
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
        const c = normalized[i];
        if (c === '\\' && i + 1 < normalized.length) {
            out += escapeGlobLiteral(normalized[i + 1]);
            i += 1;
        }
        else if (c === '*') {
            if (normalized[i + 1] === '*') {
                if (normalized[i + 2] === '/') {
                    // Zero-or-more path segments (including zero).
                    out += '(?:.*/)?';
                    i += 2;
                }
                else {
                    out += '.*';
                    i += 1;
                }
            }
            else {
                out += '[^/]*';
            }
        }
        else if (c === '?') {
            out += '[^/]';
        }
        else {
            out += escapeGlobLiteral(c);
        }
    }
    return new RegExp(`^${out}$`);
}
function matchesAppliesTo(file, appliesTo) {
    if (!appliesTo || appliesTo.length === 0)
        return true;
    return appliesTo.some((pattern) => globToRegExp(pattern).test(file));
}
function isTier2(sensor) {
    return ARK_RULE_TIER2_SENSOR_IDS.includes(sensor);
}
function severityFor(rule) {
    if (rule.mode === 'enforced' && !isTier2(rule.sensor)) {
        return { severity: 'error', failsStrict: true };
    }
    return { severity: 'warning', failsStrict: false };
}
function baseViolation(rule, file, message, line = 1) {
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
function shapesForRule(rule, shapes, layerForFile) {
    return shapes.filter((shape) => {
        if (!shape.exported)
            return false;
        if (!matchesAppliesTo(shape.file, rule.appliesTo))
            return false;
        if (layerForFile) {
            const layer = layerForFile(shape.file);
            if (layer && layer !== rule.provenance.layer)
                return false;
        }
        return true;
    });
}
function evaluateAggregatePrivateState(rule, shapes, layerForFile) {
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        if (shape.hasPublicMutableFields || shape.hasPublicSetters) {
            out.push(baseViolation(rule, shape.file, `Exported class ${shape.className} exposes public mutable state (sensor aggregate-private-state).`));
        }
    }
    return out;
}
function evaluateAlwaysValidFactory(rule, shapes, layerForFile) {
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        if (shape.hasPublicConstructor && !shape.hasStaticFactory) {
            out.push(baseViolation(rule, shape.file, `Exported class ${shape.className} exposes a public constructor without a static factory (sensor always-valid-factory).`));
        }
    }
    return out;
}
function evaluateDomainEventOnMutation(rule, shapes, layerForFile) {
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        for (const method of shape.mutatingMethods) {
            if (!method.referencesGuardOrPublish) {
                out.push(baseViolation(rule, shape.file, `Mutating method ${shape.className}.${method.name} does not reference a guard or publish symbol (sensor domain-event-on-mutation).`));
            }
        }
    }
    return out;
}
function evaluateOrchestrationOnly(rule, input) {
    const out = [];
    for (const file of input.files) {
        if (!matchesAppliesTo(file, rule.appliesTo))
            continue;
        if (input.layerForFile) {
            const layer = input.layerForFile(file);
            if (layer && layer !== rule.provenance.layer)
                continue;
        }
        if (input.fileHints?.[file]?.orchestrationHeavy) {
            out.push(baseViolation(rule, file, `File appears to embed domain branching beyond guard-and-delegate orchestration (sensor orchestration-only).`));
        }
    }
    return out;
}
function evaluateThinAdapter(rule, input) {
    const out = [];
    for (const file of input.files) {
        if (!matchesAppliesTo(file, rule.appliesTo))
            continue;
        if (input.layerForFile) {
            const layer = input.layerForFile(file);
            if (layer && layer !== rule.provenance.layer)
                continue;
        }
        if (input.fileHints?.[file]?.adapterThick) {
            out.push(baseViolation(rule, file, `Adapter module mixes domain branching, persistence, and mapping beyond a thin adapter (sensor thin-adapter).`));
        }
    }
    return out;
}
function evaluateNoAnemicModel(rule, shapes, layerForFile) {
    // Tier-2: always advisory.
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        if (shape.dataOnly === true) {
            const v = baseViolation(rule, shape.file, `Exported type ${shape.className} looks data-only / anemic (sensor no-anemic-model; advisory only).`);
            // Tier-2: force advisory even if misconfigured as enforced (schema also rejects enforced).
            out.push({ ...v, severity: 'warning', failsStrict: false });
        }
    }
    return out;
}
/**
 * Evaluate all structure sensors. Empty Effective Contract → no findings (byte-for-byte parity).
 */
export function evaluateArkRuleSensors(input) {
    if (!input.arkRules.structure.length)
        return [];
    const violations = [];
    for (const rule of input.arkRules.structure) {
        switch (rule.sensor) {
            case 'aggregate-private-state':
                violations.push(...evaluateAggregatePrivateState(rule, input.classShapes, input.layerForFile));
                break;
            case 'always-valid-factory':
                violations.push(...evaluateAlwaysValidFactory(rule, input.classShapes, input.layerForFile));
                break;
            case 'domain-event-on-mutation':
                violations.push(...evaluateDomainEventOnMutation(rule, input.classShapes, input.layerForFile));
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
    return violations.sort((a, b) => a.file.localeCompare(b.file) ||
        a.arkruleId.localeCompare(b.arkruleId) ||
        a.message.localeCompare(b.message));
}
/**
 * ADR 0012 D3 — a structure rule whose appliesTo matches zero governed files is
 * never silent green. Advisory → warning; enforced → failsStrict.
 * Rules without appliesTo (whole-layer) never emit this signal.
 */
export function collectEmptyAppliesToFindings(arkRules, files) {
    const out = [];
    const fileList = files.map((f) => f.replace(/\\/g, '/'));
    for (const rule of arkRules.structure) {
        if (!rule.appliesTo || rule.appliesTo.length === 0)
            continue;
        const matched = fileList.some((file) => matchesAppliesTo(file, rule.appliesTo));
        if (matched)
            continue;
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
        if (!inv.appliesTo || inv.appliesTo.length === 0)
            continue;
        const matched = fileList.some((file) => matchesAppliesTo(file, inv.appliesTo));
        if (matched)
            continue;
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
    return out.sort((a, b) => a.file.localeCompare(b.file) ||
        a.arkruleId.localeCompare(b.arkruleId) ||
        a.message.localeCompare(b.message));
}
/** IO / ORM import evidence (mirrors design-smells; kept local for Domain purity). */
const IO_IMPORT_HINT_RE = /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm|typeorm|knex|mongodb|pg|mysql2|better-sqlite3|ioredis|redis)['"]|require\(\s*['"](?:@?prisma\/client|pg|knex|typeorm)/;
const HANDLER_SHAPE_HINT_RE = /\b(?:@Controller|@Get|@Post|@Put|@Delete|Router\(\)|createRouter|express\.Router|fastify\.(?:get|post)|export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b|export\s+const\s+(?:GET|POST|PUT|DELETE|PATCH)\s*=)/;
const FRAMEWORK_HTTP_HINT_RE = /(?:^|[;\n])\s*(?:import\s+(?:type\s+)?(?:[^;]{0,512}?\s+from\s+)?|export\s+(?:type\s+)?[^;]{0,512}?\s+from\s+)['"]next\/server(?:\.js)?['"]/;
/** Business-predicate / domain branching signals (conservative). */
const DOMAIN_PREDICATE_HINT_RE = /\b(?:export\s+)?(?:async\s+)?function\s+(?:can|calculate|compute|should|ensure|validate|is|has)[A-Z]\w*|\b(?:export\s+)?const\s+(?:can|calculate|compute|should|ensure|validate|is|has)[A-Z]\w*\s*=/;
const BUSINESS_BRANCH_HINT_RE = /\bif\s*\(\s*(?:!)?(?:order|invoice|cart|user|account|policy|aggregate|entity|amount|total|balance|status|state)\b/i;
/**
 * Pure Tooling/Domain heuristic for orchestration-only / thin-adapter fileHints.
 * Prefers false negatives over false positives (ADR 0013 discipline).
 * Returns null when neither flag is set (callers may omit the path).
 */
export function deriveArkRuleFileHints(_file, content) {
    if (!content || content.length < 40)
        return null;
    const domainPredicates = content.match(new RegExp(DOMAIN_PREDICATE_HINT_RE.source, 'g')) ?? [];
    const businessBranches = content.match(new RegExp(BUSINESS_BRANCH_HINT_RE.source, 'g')) ?? [];
    const ifCount = (content.match(/\bif\s*\(/g) ?? []).length;
    const switchCount = (content.match(/\bswitch\s*\(/g) ?? []).length;
    // Orchestration-heavy: strong multi-signal domain logic beyond guard-and-delegate.
    // Require ≥2 domain-predicate defs, OR one predicate + several domain-shaped branches.
    const orchestrationHeavy = domainPredicates.length >= 2 ||
        (domainPredicates.length >= 1 && businessBranches.length >= 2) ||
        (businessBranches.length >= 3 && ifCount + switchCount >= 6);
    // Adapter-thick: multi-concern mixing — domain branching + persistence/HTTP in one module.
    const hasIo = IO_IMPORT_HINT_RE.test(content);
    const hasHandler = HANDLER_SHAPE_HINT_RE.test(content) || FRAMEWORK_HTTP_HINT_RE.test(content);
    const hasDomainSignal = domainPredicates.length >= 1 || businessBranches.length >= 2;
    const hasMapping = /\b(?:mapTo|toDomain|toDto|fromRow|toEntity|fromPrisma|serialize|deserialize)\w*\s*[(=]/.test(content);
    const adapterThick = (hasIo && hasDomainSignal) ||
        (hasHandler && hasDomainSignal) ||
        (hasIo && hasMapping && (ifCount >= 4 || domainPredicates.length >= 1)) ||
        (hasHandler && hasIo); // hollow-persistence style: HTTP + persistence together
    if (!orchestrationHeavy && !adapterThick)
        return null;
    return {
        ...(orchestrationHeavy ? { orchestrationHeavy: true } : {}),
        ...(adapterThick ? { adapterThick: true } : {}),
    };
}
/**
 * Build fileHints map from path→content. Omits paths with no flags (sparse map).
 */
export function buildArkRuleFileHints(fileContents) {
    const out = {};
    for (const [file, content] of Object.entries(fileContents)) {
        const hint = deriveArkRuleFileHints(file, content);
        if (hint)
            out[file.replace(/\\/g, '/')] = hint;
    }
    return out;
}
/**
 * Lightweight class-shape extraction from TypeScript source text (no compiler).
 * Conservative: prefers false negatives over false positives for mutability.
 * Tooling may replace with TypeScript-API facts; sensors consume the same shape.
 *
 * Limitation (AR05/AR06): only `export class` / `export abstract class` forms.
 * `export default class`, re-exported classes, and non-exported aggregates are
 * invisible — enforced structure sensors stay silent (false negative). Silence
 * is never proof of compliance.
 */
export function extractClassShapesFromSource(file, content) {
    const shapes = [];
    // Match exported class declarations (simple cases; see limitation above).
    const classRe = /export\s+(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:extends\s+[^{]+)?(?:implements\s+[^{]+)?\{/g;
    let match;
    while ((match = classRe.exec(content)) !== null) {
        const className = match[1];
        const start = match.index + match[0].length;
        // Brace match body
        let depth = 1;
        let i = start;
        while (i < content.length && depth > 0) {
            const ch = content[i];
            if (ch === '{')
                depth += 1;
            else if (ch === '}')
                depth -= 1;
            i += 1;
        }
        const body = content.slice(start, i - 1);
        const hasPublicMutableFields = /(?:^|\n)\s*(?:public\s+)?(?:readonly\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/m.test(body.replace(/(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+|async\s+|get\s+|set\s+)/g, '')) &&
            /(?:^|\n)\s*(public\s+)?(?!constructor|static|get|set|private|protected|readonly)[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/m.test(body);
        // Simpler public field detection: "public foo" or unadorned "foo:" at class level
        const publicField = /(?:^|\n)\s*public\s+(?!static|async|get|set|constructor)[a-zA-Z_]/.test(body) ||
            /(?:^|\n)\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[^=;\n]+[;=]/m.test(body
                .split('\n')
                .filter((line) => !/^\s*(private|protected|static|constructor|get |set |async |\/)/.test(line))
                .join('\n'));
        const hasPublicSetters = /(?:^|[\n;{])\s*(?:public\s+)?set\s+[a-zA-Z_]/.test(body);
        const hasPrivateConstructor = /(?:^|[\n;{])\s*private\s+constructor\s*\(/.test(body);
        const hasPublicConstructor = /(?:^|[\n;{])\s*(?:public\s+)?constructor\s*\(/.test(body) && !hasPrivateConstructor;
        const hasStaticFactory = /(?:^|[\n;{])\s*static\s+(?:async\s+)?(?:create|of|from|parse|build|make|new)\s*[<(]/.test(body) ||
            /(?:^|[\n;{])\s*static\s+(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*:\s*[A-Za-z_]/.test(body);
        const mutatingMethods = [];
        const methodRe = /(?:^|\n)\s*(?:public\s+|private\s+|protected\s+|async\s+)*(?!constructor|get|set|static)([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;
        let methodMatch;
        while ((methodMatch = methodRe.exec(body)) !== null) {
            const name = methodMatch[1];
            const mStart = methodMatch.index + methodMatch[0].length;
            let mDepth = 1;
            let j = mStart;
            while (j < body.length && mDepth > 0) {
                if (body[j] === '{')
                    mDepth += 1;
                else if (body[j] === '}')
                    mDepth -= 1;
                j += 1;
            }
            const methodBody = body.slice(mStart, j - 1);
            const assignsThis = /this\.\w+\s*=/.test(methodBody);
            if (!assignsThis)
                continue;
            const referencesGuardOrPublish = /\b(ensureInvariants|assertInvariants|validate|publish|emit|raise|record)\b/.test(methodBody);
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
