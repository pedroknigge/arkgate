/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderFacts.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-facts.mjs). Zero Node I/O.
 */

export const ARKORDER_PLANE_FACTORY = 'createOrderPlane';
export const ARKORDER_FORBIDDEN_METHODS = ['update', 'patch', 'set', 'mutate'];
export function isArkOrderModuleSpecifier(specifier) {
    return specifier === 'arkgate/order' || specifier.startsWith('arkgate/order/');
}
function lineAt(content, index) {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i += 1) {
        if (content[i] === '\n')
            line += 1;
    }
    return line;
}
function stripCommentsPreservingLines(content) {
    return content
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (c) => ' '.repeat(c.length)));
}
export function extractArkOrderPlaneCallsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /\bcreateOrderPlane\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        facts.push({ file, line: lineAt(content, match.index), callee: ARKORDER_PLANE_FACTORY });
    }
    return facts;
}
export function extractArkOrderGenericUpdatesFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /\.((?:update|patch|set|mutate))\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const method = match[1];
        const before = source.slice(Math.max(0, match.index - 80), match.index);
        if (!/\b(?:plane|orderPlane|order)\s*$/.test(before) && !/\bcreateOrderPlane\b/.test(source)) {
            continue;
        }
        facts.push({ file, line: lineAt(content, match.index), method });
    }
    return facts;
}
