/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/rulesInventory.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/rules-inventory.mjs). Zero Node I/O.
 */

import { DOMAIN_EVENTS_PUSH_RE, DOMAIN_INVARIANT_WORD_RE, expectedDomainInvariantWordsPhrase, isIdiomaticEventsReset, } from './arkrules-sensors.mjs';
function lineOf(content, index) {
    return content.slice(0, index).split('\n').length;
}
function normalizeInventoryPath(file) {
    return file.replace(/\\/g, '/').replace(/^\.\//, '');
}
function ownsIntent(intentPrefixes, intentRoots) {
    return intentPrefixes.some((prefix) => {
        const normalized = prefix.trim().replace(/\.+$/, '');
        return intentRoots.some((root) => normalized === root || normalized.startsWith(`${root}.`));
    });
}
function isDomainLayer(layer, intentPrefixes = []) {
    return (/domain|entity|aggregate|model/i.test(layer) ||
        ownsIntent(intentPrefixes, ['Domain']));
}
function isControllerEligibleLayer(layer, intentPrefixes = []) {
    return (/application|orchestration|presentation|adapter|framework|interface|delivery|transport|inbound|controller/i.test(layer) ||
        ownsIntent(intentPrefixes, [
            'Application',
            'Orchestration',
            'Presentation',
            'Adapter',
            'Interface',
            'Delivery',
            'Transport',
        ]));
}
function isNonPilotSurface(file) {
    return (/(?:^|\/)(?:tests?|__tests__|fixtures?|testdata|mocks?|stubs?|examples?|samples?|seeds?|seeders?|migrations?|excluded|exclusions?)(?:\/|$)/i.test(file) ||
        /(?:^|\/)[^/]*\.(?:test|spec|fixture|mock|stub|seed|seeder)\.[^/]+$/i.test(file) ||
        /(?:^|\/)(?:seed|seeder|fixture|mock|stub)\.[^/]+$/i.test(file));
}
export function buildRulesInventory(input) {
    const candidates = [];
    let seq = 0;
    const fileLayers = new Map(Object.entries(input.fileLayers ?? {}).map(([file, layer]) => [
        normalizeInventoryPath(file),
        layer,
    ]));
    const layerIntentPrefixes = new Map((input.layerContexts ?? []).map((layer) => [
        layer.name,
        layer.intentPrefixes ?? [],
    ]));
    const domainLayer = (input.layerContexts ?? []).find((layer) => isDomainLayer(layer.name, layer.intentPrefixes))?.name ?? 'DomainModel';
    for (const [file, content] of Object.entries(input.fileContents).sort(([a], [b]) => a.localeCompare(b))) {
        const posix = normalizeInventoryPath(file);
        // Test data, fixtures, seeds, migrations, and explicit exclusions may retain
        // representative smells, but are not production extraction pilots.
        if (isNonPilotSurface(posix))
            continue;
        // Generated mirrors are evidence for their canonical source, not a second
        // extraction candidate.
        if (/GENERATED FILE\s+[—-]\s+do not edit by hand/i.test(content.slice(0, 320)))
            continue;
        const hasGovernedLayer = fileLayers.has(posix);
        const governedLayer = fileLayers.get(posix);
        const governedIntentPrefixes = governedLayer
            ? layerIntentPrefixes.get(governedLayer) ?? []
            : [];
        // P2-N — clear UI bags only (components/theme/styles). Do NOT blanket-skip all
        // app/pages (server actions / route handlers live there and stay inventoriable).
        const isUiChrome = /(?:^|\/)(?:components|ui|layouts|styles|hooks|theme|tokens|i18n|locales?)(?:\/|$)/i.test(posix) ||
            /(?:^|\/)(?:src\/)?(?:app|pages)\/.+\.(?:tsx|jsx)$/i.test(posix) &&
                /(?:page|layout|loading|error|template|default)\.(?:tsx|jsx)$/i.test(posix);
        const isApiRoute = /(?:^|\/)(?:app|pages)(?:\/[^/]+)*\/api(?:\/|$)/i.test(posix);
        const isServerAction = /(?:^|\/)actions?(?:\/|\.|$)/i.test(posix) || /['"]use server['"]/.test(content);
        const controllerShape = /controller|handler|resolver/i.test(file) ||
            isApiRoute ||
            isServerAction ||
            (/route\.(?:ts|js|tsx|jsx)$/i.test(posix) && !isUiChrome) ||
            /@(Controller|Get|Post|Put|Delete|Patch)\b/.test(content) ||
            /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b/.test(content) ||
            /\bexport\s+const\s+(?:GET|POST|PUT|DELETE|PATCH)\s*=/.test(content);
        const isController = hasGovernedLayer
            ? Boolean(governedLayer &&
                isControllerEligibleLayer(governedLayer, governedIntentPrefixes) &&
                controllerShape)
            : controllerShape;
        const isDomain = hasGovernedLayer
            ? Boolean(governedLayer && isDomainLayer(governedLayer, governedIntentPrefixes))
            : /domain|entity|aggregate|model/i.test(file);
        const magicConstantEligible = !hasGovernedLayer || isDomain || isController;
        // validation-in-controller (API/Nest/server-action handlers — not pure UI chrome)
        if (isController && !isUiChrome) {
            const valRe = /\b(if\s*\([^)]{0,80}(amount|total|price|qty|quantity|balance)[^)]{0,40}\)|throw new (Error|BadRequest|ValidationError)|z\.object\(|yup\.|class-validator|@Is[A-Z])/g;
            let m;
            while ((m = valRe.exec(content)) !== null) {
                seq += 1;
                candidates.push({
                    id: `inv-val-${seq}`,
                    kind: 'validation-in-controller',
                    file,
                    line: lineOf(content, m.index),
                    message: 'Business validation appears in a controller/handler — extract an invariant or Domain rule.',
                    confidence: 'direct-evidence',
                    governedLayer,
                    suggestedArkRule: {
                        layer: domainLayer,
                        invariantId: `INV-EXTRACT-${seq}`,
                        sensor: 'invariant-coverage',
                    },
                    neverMechanicalSafe: true,
                });
            }
        }
        // magic business constants (heuristic) — quiet UI labels via anchored prefixes/tokens
        const magicRe = /\b(const|let)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(\d{2,}|['"][^'"]{8,}['"])/g;
        let magic;
        // Wave-2 (P2N residual): infra / I/O / storage noise without swallowing domain seeds
        // like MAX_CART_SIZE, ORDER_STATUS_OPEN, MAX_PROPERTY_LIMIT, MAX_MEDIA_PER_PROPERTY,
        // DEFAULT_ORDER_LIMIT (narrow DEFAULT_/REQUEST_/STORAGE_ — do not drop all DEFAULT_*).
        const isInfraMagicName = (name) => /^(?:TEST|SPEC|TIMEOUT|PORT|VERSION|MAX_RETRY|MIN_RETRY|TTL|CACHE|HEADER|COOKIE|MIME|CONTENT_TYPE|HTTP_STATUS|NODE_ENV|LOG_LEVEL|FEATURE_FLAG|ID_PREFIX|Z_INDEX)(?:_|$)/i.test(name) ||
            /^(?:ROUTE|PATH|LABEL|TITLE|HEADING|CLASS|STYLE|COLOR|THEME|BREAKPOINT|QUERY|PARAM|ICON|ARIA|MSG|COPY|I18N|LOCALE|PAGE|NAV|MENU|TAB|BTN|BUTTON|PLACEHOLDER|TOOLTIP|SHADOW|RADIUS|GAP|PADDING|MARGIN|FONT|WIDTH|HEIGHT|OPACITY|DURATION|EASE|ANIM)_/i.test(name) ||
            /_(?:ROUTE|PATH|LABEL|TITLE|COLOR|THEME|CLASS|STYLE|ICON|ARIA|MSG|COPY|TIMEOUT|PORT|VERSION|RETRY|DELAY|INTERVAL|TTL|CACHE)$/i.test(name) ||
            // ms/timeout/bytes/storage/bucket/url infra suffixes (predial residual)
            /_(?:TIMEOUT(?:_MS)?|MS|BYTES|BUCKET|STORAGE_KEY|WINDOW_MS)$/i.test(name) ||
            // Narrow DEFAULT_/REQUEST_/STORAGE_ — only known infra tokens, not all DEFAULT_* seeds
            /^(?:DEFAULT_(?:BASE_URL|TIMEOUT(?:_MS)?|RETRY|PORT|HOST|HEADERS?|CACHE|TTL|MS|LOCALE|LANG|TIMEZONE|TZ)|REQUEST_(?:TIMEOUT(?:_MS)?|HEADERS?|RETRY|ID_PREFIX)|STORAGE_(?:KEY|PREFIX|BUCKET)|DAY_MS$|APP_DOMAIN$|BASE_URL$)$/i.test(name) ||
            // Known I/O bag prefixes that are never domain seeds in field clones
            /^(?:FAVORITES_STORAGE|LISTINGS_CACHE|DOCS_PATH|METRICS_INTERVAL)/i.test(name) ||
            // Development identities and PostgreSQL type OIDs are technical wiring, not
            // business literals. Keep this narrow so Domain limits/status seeds still surface.
            /^(?:DEV|DEMO|SEED|FIXTURE)_[A-Z0-9_]+$/i.test(name) ||
            /^(?:PG|POSTGRES|OID)_[A-Z0-9_]+$/i.test(name) ||
            /_(?:OID|OIDS)$/i.test(name) ||
            /^(?:INT2|INT4|INT8|FLOAT4|FLOAT8|NUMERIC|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|JSON|JSONB|UUID)OID$/i.test(name) ||
            /(?:^|_)(?:SCHEMA|PROTOCOL|RESOLVER|FORMAT)_(?:URL|URI|VERSION|ID|IDENTITY)$/i.test(name);
        /**
         * FX09 — pure UX copy / error-message string constants crowd inventory pilots.
         * Downrank (skip) sentence-like strings and message-named identifiers; keep
         * numeric thresholds and domain status tokens for adopt/contract pilots.
         */
        const isUxMessageConstant = (name, rawValue) => {
            if (/^(?:ERROR|SUCCESS|WARNING|INFO|HINT|HELP|EMPTY|TOAST|SNACK|ALERT|BANNER|DIALOG|MODAL|TOOLTIP|CAPTION|SUBTITLE|HEADLINE|USER|UI|DISPLAY|FEEDBACK)_(?:MSG|MESSAGE|TEXT|COPY|LABEL|TITLE|BODY|DESC|DESCRIPTION|HINT|HELP)?/i.test(name) ||
                /_(?:MSG|MESSAGE|TEXT|COPY|TOAST|SNACK|ALERT|BANNER|CAPTION|HINT|HELP_TEXT|ERROR_TEXT|EMPTY_TEXT|PLACEHOLDER_TEXT|USER_MESSAGE|FEEDBACK)$/i.test(name)) {
                return true;
            }
            const unquoted = rawValue.replace(/^['"]|['"]$/g, '');
            // Sentence-like string values (spaces or terminal punctuation) are UX copy,
            // not behavioral business limits — unless the name is a clear domain status seed.
            if (/^['"]/.test(rawValue) &&
                (/\s/.test(unquoted) || /[.!?…]$/.test(unquoted)) &&
                !/^(?:STATUS|STATE|PHASE|ROLE|TYPE|KIND|ORDER|PAYMENT|CART|INVOICE|POLICY)_[A-Z0-9_]+$/i.test(name)) {
                return true;
            }
            return false;
        };
        while ((magic = magicRe.exec(content)) !== null) {
            const name = magic[2];
            const rawValue = magic[3] ?? '';
            // With governed layer evidence, generic Tooling/Kernel constants are not
            // business-rule candidates. Controller-shaped boundaries stay eligible
            // because business policy can leak into them.
            if (!magicConstantEligible)
                continue;
            if (isInfraMagicName(name))
                continue;
            if (isUxMessageConstant(name, rawValue))
                continue;
            // P2-N: skip remaining ALL_CAPS noise only on clear UI chrome (not all of app/).
            if (isUiChrome && !isDomain)
                continue;
            // Wave-2: integrations / repos / clients are usually I/O constants, not Domain seeds.
            // Keep Domain/controller paths so spaghetti magic limits still surface.
            const isIoSurface = /(?:^|\/)(?:integrations?|repos?|clients?|infra(?:structure)?|adapters?)(?:\/|$)/i.test(posix) && !isDomain;
            if (isIoSurface)
                continue;
            seq += 1;
            candidates.push({
                id: `inv-magic-${seq}`,
                kind: 'magic-business-constant',
                file,
                line: lineOf(content, magic.index),
                message: `Magic business constant ${name} may belong in a Domain policy or invariant catalog.`,
                confidence: 'heuristic',
                governedLayer,
                suggestedArkRule: { layer: domainLayer, invariantId: `INV-${name}` },
                neverMechanicalSafe: true,
            });
        }
        // anemic entity
        if (isDomain) {
            const classRe = /export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]{0,800})\}/g;
            let c;
            while ((c = classRe.exec(content)) !== null) {
                const body = c[2] ?? '';
                const methods = (body.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g) ?? []).length;
                const fields = (body.match(/:\s*[A-Za-z]/g) ?? []).length;
                if (fields >= 2 && methods <= 1) {
                    seq += 1;
                    candidates.push({
                        id: `inv-anemic-${seq}`,
                        kind: 'anemic-entity',
                        file,
                        line: lineOf(content, c.index),
                        message: `Class ${c[1]} looks anemic (data-heavy, few behaviors).`,
                        confidence: 'heuristic',
                        governedLayer,
                        suggestedArkRule: {
                            layer: domainLayer,
                            structureId: 'no-anemic-model',
                            sensor: 'no-anemic-model',
                        },
                        neverMechanicalSafe: true,
                    });
                }
            }
        }
        // mutation without guard in domain
        if (isDomain) {
            // Wave-2: *Error / *access.error bags are not aggregate mutators (propia residual).
            // Narrow: path-based error modules only — do not skip whole domain files that
            // merely export an Error class alongside aggregates.
            const isErrorBag = /\.error\.(?:ts|js|tsx|jsx)$/i.test(posix) ||
                /(?:^|\/)[^/]*(?:-access)?\.error\./i.test(posix) ||
                /(?:^|\/)errors?(?:\/|$)/i.test(posix);
            if (!isErrorBag) {
                const mutRe = /\bthis\.[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/g;
                let mut;
                while ((mut = mutRe.exec(content)) !== null) {
                    const classStart = content.lastIndexOf('class ', mut.index);
                    const classHeaderEnd = classStart >= 0 ? content.indexOf('{', classStart) : -1;
                    const classHeader = classStart >= 0 && classHeaderEnd >= classStart && classHeaderEnd < mut.index
                        ? content.slice(classStart, classHeaderEnd)
                        : '';
                    // Error metadata assignment is constructor wiring, not aggregate
                    // mutation. Keep the exclusion local to the containing class header.
                    if (/\bextends\s+(?:Error|[A-Za-z_$][A-Za-z0-9_$]*Error)\b/.test(classHeader)) {
                        continue;
                    }
                    if (isIdiomaticEventsReset(content, mut.index))
                        continue;
                    const window = content.slice(Math.max(0, mut.index - 200), mut.index + 200);
                    if (!DOMAIN_INVARIANT_WORD_RE.test(window) &&
                        !DOMAIN_EVENTS_PUSH_RE.test(window)) {
                        seq += 1;
                        candidates.push({
                            id: `inv-mut-${seq}`,
                            kind: 'mutation-without-guard',
                            file,
                            line: lineOf(content, mut.index),
                            message: `Domain field mutation without nearby ${expectedDomainInvariantWordsPhrase()}.`,
                            confidence: 'heuristic',
                            governedLayer,
                            suggestedArkRule: {
                                layer: domainLayer,
                                structureId: 'events-on-mutation',
                                sensor: 'domain-event-on-mutation',
                            },
                            neverMechanicalSafe: true,
                        });
                        break; // one per file is enough for inventory ranking
                    }
                }
            }
        }
    }
    const contracted = new Set(input.contractedRuleIds ?? []);
    candidates.sort((a, b) => Number(b.confidence === 'direct-evidence') -
        Number(a.confidence === 'direct-evidence') ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id));
    const underContract = candidates.filter((c) => (c.suggestedArkRule?.invariantId && contracted.has(c.suggestedArkRule.invariantId)) ||
        (c.suggestedArkRule?.structureId && contracted.has(c.suggestedArkRule.structureId))).length;
    return {
        candidates,
        inventoried: candidates.length,
        underContract,
        frozen: (input.frozenKeys ?? []).length,
        notAScore: true,
    };
}
/** Build a pilotLoop extraction card for the top inventory candidate (AR14). */
export function inventoryToExtractionCard(candidate) {
    return {
        pilot: `Extract rule candidate ${candidate.id} (${candidate.kind})`,
        pilotTarget: candidate.file,
        smellId: candidate.kind,
        move: `Declare in arkrules/${candidate.suggestedArkRule?.layer ?? 'DomainModel'}.json, implement pure Domain logic, add covering test.`,
        doNot: [
            'Do not auto-apply codemods',
            'Do not promote to enforced without coverage evidence',
            'Do not batch multiple extractions',
        ],
        successSignal: 'Doctor reports candidate under contract; gate green with residual honest.',
        killSwitch: 'Stop if extraction requires multi-module redesign without a clear aggregate owner.',
        neverMechanicalSafe: true,
        class: 'judgment',
        next: 'Run ark_prepare_change / preflight, then re-doctor.',
    };
}
