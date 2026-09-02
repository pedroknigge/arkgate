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
];
/** No `g` flag: `.test` must not advance lastIndex. */
export const DOMAIN_INVARIANT_WORD_RE = new RegExp(`\\b(${DOMAIN_INVARIANT_WORDS.join('|')})\\b`);
const EVENTS_ARRAY_PROP = '(?:_?pendingEvents|domainEvents|uncommittedEvents|recordedEvents)';
export const DOMAIN_EVENTS_PUSH_RE = new RegExp(`\\bthis\\.${EVENTS_ARRAY_PROP}\\.push\\s*\\(`);
const EVENTS_ARRAY_RESET_RE = new RegExp(`^this\\.${EVENTS_ARRAY_PROP}\\s*=\\s*\\[\\s*\\]`);
const ANY_THIS_EMPTY_ARRAY_RE = /^this\.[A-Za-z_][A-Za-z0-9_]*\s*=\s*\[\s*\]/;
const THIS_FIELD_ASSIGNMENT_RE = /\bthis\.[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/g;
const SHAPE_TRUNCATED_UNTIL = 'truncatedUntil';
export function expectedDomainInvariantWordsPhrase() {
    return `${DOMAIN_INVARIANT_WORDS.join(', ')}, or events-array .push(`;
}
export function referencesGuardOrPublish(source) {
    return DOMAIN_INVARIANT_WORD_RE.test(source) || DOMAIN_EVENTS_PUSH_RE.test(source);
}
export function isIdiomaticEventsReset(source, assignIndex, methodName) {
    const slice = source.slice(assignIndex);
    if (EVENTS_ARRAY_RESET_RE.test(slice))
        return true;
    if (!ANY_THIS_EMPTY_ARRAY_RE.test(slice))
        return false;
    if (methodName && /^pullEvents$/i.test(methodName))
        return true;
    const windowStart = assignIndex > 200 ? assignIndex - 200 : 0;
    return /\bpullEvents\b/.test(source.slice(windowStart, assignIndex + 200));
}
function methodAssignsThis(methodName, methodBody) {
    const re = new RegExp(THIS_FIELD_ASSIGNMENT_RE.source, 'g');
    let match;
    while ((match = re.exec(methodBody)) !== null) {
        if (isIdiomaticEventsReset(methodBody, match.index, methodName))
            continue;
        return true;
    }
    return false;
}
function attachShapeTruncation(shape, truncatedUntil) {
    if (truncatedUntil == null)
        return shape;
    Object.defineProperty(shape, SHAPE_TRUNCATED_UNTIL, {
        value: truncatedUntil,
        enumerable: false,
        configurable: true,
    });
    return shape;
}
function shapeTruncatedUntil(shape) {
    const value = Object.getOwnPropertyDescriptor(shape, SHAPE_TRUNCATED_UNTIL)?.value;
    return typeof value === 'number' ? value : undefined;
}
function shapeTruncationSuffix(shape) {
    const until = shapeTruncatedUntil(shape);
    return until == null ? '' : ` shape analysed until character ${until}`;
}
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
/**
 * When layerForFile is provided, structure sensors require the same classification
 * as the layer plane: unclassified paths are skipped (NEW-ARKRULES-UNCLASSIFIED-ATTRIBUTION).
 * Without layerForFile, appliesTo globs alone scope the rule (unit tests / pure eval).
 */
function isInRuleLayer(file, rule, layerForFile) {
    if (!layerForFile)
        return true;
    const layer = layerForFile(file);
    // Unclassified (null/undefined/"") must not inherit rule.provenance.layer attribution.
    if (!layer)
        return false;
    return layer === rule.provenance.layer;
}
function shapesForRule(rule, shapes, layerForFile) {
    return shapes.filter((shape) => {
        if (!shape.exported)
            return false;
        if (!matchesAppliesTo(shape.file, rule.appliesTo))
            return false;
        if (!isInRuleLayer(shape.file, rule, layerForFile))
            return false;
        return true;
    });
}
function evaluateAggregatePrivateState(rule, shapes, layerForFile) {
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        // P1-L — require real mutability (setters or non-readonly public fields).
        // Readonly public props on intentional value/entity shapes are false-positive-prone.
        if (shape.hasPublicSetters || shape.hasPublicMutableFields) {
            out.push(baseViolation(rule, shape.file, `Exported class ${shape.className} exposes public mutable state (sensor aggregate-private-state).`));
        }
    }
    return out;
}
function evaluateAlwaysValidFactory(rule, shapes, layerForFile) {
    const out = [];
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        if (shape.hasPublicConstructor && !shape.hasStaticFactory) {
            // P1-L — prefer false negatives on intentional DDD / DI aggregates: a public
            // constructor alone is weak evidence. Only fire when mutable public surface
            // exists (needs an always-valid construction story).
            const needsAlwaysValidStory = shape.hasPublicMutableFields ||
                shape.hasPublicSetters ||
                (shape.mutatingMethods?.length ?? 0) > 0;
            if (!needsAlwaysValidStory)
                continue;
            out.push(baseViolation(rule, shape.file, `Exported class ${shape.className} exposes a public constructor without a static factory (sensor always-valid-factory).`));
        }
    }
    return out;
}
function evaluateDomainEventOnMutation(rule, shapes, layerForFile) {
    const out = [];
    const expected = expectedDomainInvariantWordsPhrase();
    for (const shape of shapesForRule(rule, shapes, layerForFile)) {
        const truncation = shapeTruncationSuffix(shape);
        if (shapeTruncatedUntil(shape) != null) {
            out.push(baseViolation(rule, shape.file, `Exported class ${shape.className} shape analysed until character ${shapeTruncatedUntil(shape)}; later methods may be invisible (sensor domain-event-on-mutation).`));
        }
        for (const method of shape.mutatingMethods) {
            if (!method.referencesGuardOrPublish) {
                out.push(baseViolation(rule, shape.file, `Mutating method ${shape.className}.${method.name} does not reference ${expected} (sensor domain-event-on-mutation).${truncation}`));
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
        if (!isInRuleLayer(file, rule, input.layerForFile))
            continue;
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
        if (!isInRuleLayer(file, rule, input.layerForFile))
            continue;
        if (input.fileHints?.[file]?.adapterThick) {
            out.push(baseViolation(rule, file, `Adapter module mixes domain branching, persistence, and mapping beyond a thin adapter (sensor thin-adapter).`));
        }
    }
    return out;
}
function evaluateWritesViaAggregate(rule, input) {
    const out = [];
    for (const file of input.files) {
        if (!matchesAppliesTo(file, rule.appliesTo))
            continue;
        if (!isInRuleLayer(file, rule, input.layerForFile))
            continue;
        if (input.fileHints?.[file]?.persistenceWrite) {
            out.push(baseViolation(rule, file, `File imports a persistence driver and issues a write; route the write through a Domain aggregate and a persistence adapter (sensor writes-via-aggregate).`));
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
/** IO / ORM import evidence. postgres and drizzle-orm include package subpaths. Keep in lockstep with arkOrderFacts. */
const IO_IMPORT_HINT_RE = /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm(?:\/[^'"]+)?|postgres(?:\/[^'"]+)?|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|postgres(?:\/[^'"]+)?|drizzle-orm(?:\/[^'"]+)?|knex|typeorm|mongoose)/;
/**
 * Path-alias / local db module (`@/lib/db`) without resolving tsconfig.
 * Keep in lockstep with arkOrderFacts.
 */
const IO_ALIAS_IMPORT_RE = /\bfrom\s+['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)(?:\.[cm]?[jt]sx?)?['"]|require\(\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)/;
/**
 * Write tokens that skip the aggregate when paired with a persistence driver import.
 * Callee must be db|tx|client|prisma|drizzle (PrismaClient included); not repo.update(.
 * Keep in lockstep with arkOrderFacts.
 */
const PERSISTENCE_WRITE_HINT_RE = /\b(?:db|tx|client|prisma(?:Client)?|drizzle)\b(?:\s*\.\s*[A-Za-z_]\w*)*\s*\.\s*(?:insert(?:One|Many)?|update(?:One|Many)?|upsert|delete(?:One|Many)?|createMany|create|replaceOne|findOneAnd(?:Update|Delete|Replace))\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+[A-Za-z_][\w.]*\s+SET\b|\bDELETE\s+FROM\b/i;
export function isPersistenceDriverLayer(layer) {
    return layer === 'PersistenceAdapters';
}
export function sourceImportsPersistenceDriver(content, resolvedImports) {
    if (IO_IMPORT_HINT_RE.test(content) || IO_ALIAS_IMPORT_RE.test(content))
        return true;
    if (!resolvedImports)
        return false;
    for (const imp of resolvedImports) {
        if (isPersistenceDriverLayer(imp.layer))
            return true;
        const specifier = imp.specifier;
        if (!specifier)
            continue;
        const synthetic = `from '${specifier}'`;
        if (IO_IMPORT_HINT_RE.test(synthetic) || IO_ALIAS_IMPORT_RE.test(synthetic))
            return true;
    }
    return false;
}
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
export function deriveArkRuleFileHints(_file, content, resolvedImports) {
    if (!content)
        return null;
    const hasIo = sourceImportsPersistenceDriver(content, resolvedImports);
    const persistenceWrite = hasIo && PERSISTENCE_WRITE_HINT_RE.test(content);
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
    const orchestrationHeavy = domainPredicates.length >= 2 ||
        (domainPredicates.length >= 1 && businessBranches.length >= 2) ||
        (businessBranches.length >= 3 && ifCount + switchCount >= 6);
    // Adapter-thick: multi-concern mixing — domain branching + persistence/HTTP in one module.
    const hasHandler = HANDLER_SHAPE_HINT_RE.test(content) || FRAMEWORK_HTTP_HINT_RE.test(content);
    const hasDomainSignal = domainPredicates.length >= 1 || businessBranches.length >= 2;
    const hasMapping = /\b(?:mapTo|toDomain|toDto|fromRow|toEntity|fromPrisma|serialize|deserialize)\w*\s*[(=]/.test(content);
    const adapterThick = (hasIo && hasDomainSignal) ||
        (hasHandler && hasDomainSignal) ||
        (hasIo && hasMapping && (ifCount >= 4 || domainPredicates.length >= 1)) ||
        (hasHandler && hasIo); // hollow-persistence style: HTTP + persistence together
    if (!orchestrationHeavy && !adapterThick && !persistenceWrite)
        return null;
    return {
        ...(orchestrationHeavy ? { orchestrationHeavy: true } : {}),
        ...(adapterThick ? { adapterThick: true } : {}),
        ...(persistenceWrite ? { persistenceWrite: true } : {}),
    };
}
/**
 * Build fileHints map from path→content. Omits paths with no flags (sparse map).
 */
export function buildArkRuleFileHints(fileContents, resolvedImportsByFile) {
    const out = {};
    for (const [file, content] of Object.entries(fileContents)) {
        const rel = file.replace(/\\/g, '/');
        const hint = deriveArkRuleFileHints(file, content, resolvedImportsByFile?.[rel]);
        if (hint)
            out[rel] = hint;
    }
    return out;
}
const MEMBER_MODIFIERS = new Set([
    'public',
    'private',
    'protected',
    'static',
    'async',
    'readonly',
    'abstract',
    'override',
    'declare',
    'get',
    'set',
]);
const CONTROL_FLOW_METHOD_NAMES = new Set(['if', 'match', 'when']);
function skipStringOrComment(src, index) {
    const ch = src[index];
    if (ch === '/' && src[index + 1] === '/') {
        const nl = src.indexOf('\n', index);
        return nl === -1 ? src.length : nl;
    }
    if (ch === '/' && src[index + 1] === '*') {
        const end = src.indexOf('*/', index + 2);
        return end === -1 ? src.length : end + 2;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
        let j = index + 1;
        while (j < src.length) {
            if (src[j] === '\\') {
                j += 2;
                continue;
            }
            if (src[j] === ch)
                return j + 1;
            j += 1;
        }
        return src.length;
    }
    return index;
}
function skipWsAndComments(src, index) {
    let i = index;
    while (i < src.length) {
        if (/\s/.test(src[i])) {
            i += 1;
            continue;
        }
        if (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
            i = skipStringOrComment(src, i);
            continue;
        }
        break;
    }
    return i;
}
function readIdent(src, index) {
    const ch = src[index];
    if (!ch || !/[A-Za-z_]/.test(ch))
        return null;
    let j = index + 1;
    while (j < src.length && /[A-Za-z0-9_]/.test(src[j]))
        j += 1;
    return { ident: src.slice(index, j), end: j };
}
function skipBalanced(src, openIndex, openCh, closeCh) {
    if (src[openIndex] !== openCh)
        return null;
    let depth = 1;
    let i = openIndex + 1;
    while (i < src.length && depth > 0) {
        const skipped = skipStringOrComment(src, i);
        if (skipped !== i) {
            i = skipped;
            continue;
        }
        const ch = src[i];
        if (ch === openCh)
            depth += 1;
        else if (ch === closeCh)
            depth -= 1;
        i += 1;
    }
    return depth === 0 ? i : null;
}
function scanClassMembers(body) {
    const members = [];
    let i = 0;
    let truncatedAt;
    while (i < body.length) {
        i = skipWsAndComments(body, i);
        if (i >= body.length)
            break;
        if (body[i] === ';') {
            i += 1;
            continue;
        }
        const modifiers = [];
        let cursor = i;
        while (true) {
            const tok = readIdent(body, cursor);
            if (!tok || !MEMBER_MODIFIERS.has(tok.ident))
                break;
            modifiers.push(tok.ident);
            cursor = skipWsAndComments(body, tok.end);
        }
        const nameTok = readIdent(body, cursor);
        if (!nameTok) {
            i += 1;
            continue;
        }
        cursor = skipWsAndComments(body, nameTok.end);
        if (body[cursor] === '<') {
            const afterGeneric = skipBalanced(body, cursor, '<', '>');
            if (afterGeneric == null) {
                truncatedAt = body.length;
                break;
            }
            cursor = skipWsAndComments(body, afterGeneric);
        }
        if (body[cursor] === '(') {
            const afterParen = skipBalanced(body, cursor, '(', ')');
            if (afterParen == null) {
                truncatedAt = body.length;
                break;
            }
            cursor = skipWsAndComments(body, afterParen);
            if (body[cursor] === ':') {
                cursor += 1;
                while (cursor < body.length && body[cursor] !== '{' && body[cursor] !== ';') {
                    const skipped = skipStringOrComment(body, cursor);
                    if (skipped !== cursor) {
                        cursor = skipped;
                        continue;
                    }
                    cursor += 1;
                }
            }
            if (body[cursor] === '{') {
                const afterBrace = skipBalanced(body, cursor, '{', '}');
                if (afterBrace == null) {
                    truncatedAt = body.length;
                    break;
                }
                members.push({
                    name: nameTok.ident,
                    modifiers,
                    kind: 'method',
                    body: body.slice(cursor + 1, afterBrace - 1),
                });
                i = afterBrace;
                continue;
            }
            if (body[cursor] === ';') {
                i = cursor + 1;
                continue;
            }
            i = cursor + 1;
            continue;
        }
        let depthBrace = 0;
        let depthParen = 0;
        let depthBracket = 0;
        while (cursor < body.length) {
            const skipped = skipStringOrComment(body, cursor);
            if (skipped !== cursor) {
                cursor = skipped;
                continue;
            }
            const ch = body[cursor];
            if (ch === '{')
                depthBrace += 1;
            else if (ch === '}') {
                if (depthBrace === 0)
                    break;
                depthBrace -= 1;
            }
            else if (ch === '(')
                depthParen += 1;
            else if (ch === ')')
                depthParen -= 1;
            else if (ch === '[')
                depthBracket += 1;
            else if (ch === ']')
                depthBracket -= 1;
            else if (ch === ';' &&
                depthBrace === 0 &&
                depthParen === 0 &&
                depthBracket === 0) {
                cursor += 1;
                break;
            }
            cursor += 1;
        }
        members.push({
            name: nameTok.ident,
            modifiers,
            kind: 'field',
            body: '',
        });
        i = cursor;
    }
    return { members, truncatedAt };
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
        const classUnclosed = depth > 0;
        const scanned = scanClassMembers(body);
        const truncatedUntil = classUnclosed
            ? content.length
            : scanned.truncatedAt == null
                ? undefined
                : start + scanned.truncatedAt;
        const publicMutableFields = scanned.members.filter((member) => {
            if (member.kind !== 'field')
                return false;
            if (member.name === 'constructor')
                return false;
            if (member.modifiers.includes('private') || member.modifiers.includes('protected')) {
                return false;
            }
            if (member.modifiers.includes('readonly'))
                return false;
            if (member.modifiers.includes('static'))
                return false;
            if (member.modifiers.includes('get') || member.modifiers.includes('set'))
                return false;
            return true;
        });
        const hasPublicMutableFields = publicMutableFields.length > 0;
        const hasPublicSetters = /(?:^|[\n;{])\s*(?:public\s+)?set\s+[a-zA-Z_]/.test(body);
        const hasPrivateConstructor = /(?:^|[\n;{])\s*private\s+constructor\s*\(/.test(body);
        const hasPublicConstructor = /(?:^|[\n;{])\s*(?:public\s+)?constructor\s*\(/.test(body) && !hasPrivateConstructor;
        const hasStaticFactory = /(?:^|[\n;{])\s*static\s+(?:async\s+)?(?:create|of|from|parse|build|make|new)\s*[<(]/.test(body) ||
            /(?:^|[\n;{])\s*static\s+(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*:\s*[A-Za-z_]/.test(body);
        const mutatingMethods = [];
        for (const member of scanned.members) {
            if (member.kind !== 'method')
                continue;
            if (member.name === 'constructor')
                continue;
            if (member.modifiers.includes('static'))
                continue;
            if (member.modifiers.includes('get') || member.modifiers.includes('set'))
                continue;
            if (CONTROL_FLOW_METHOD_NAMES.has(member.name))
                continue;
            if (!methodAssignsThis(member.name, member.body))
                continue;
            mutatingMethods.push({
                name: member.name,
                referencesGuardOrPublish: referencesGuardOrPublish(member.body),
            });
        }
        const methodCount = scanned.members.filter((member) => member.kind === 'method').length;
        const dataOnly = methodCount <= 1 &&
            publicMutableFields.length >= 2 &&
            hasPublicMutableFields;
        shapes.push(attachShapeTruncation({
            file,
            className,
            exported: true,
            hasPublicMutableFields,
            hasPublicSetters,
            hasPublicConstructor,
            hasStaticFactory,
            mutatingMethods: [...mutatingMethods],
            dataOnly,
        }, truncatedUntil));
    }
    return shapes;
}
