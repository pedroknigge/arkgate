/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/improvementCompassTypes.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/improvement-compass-types.mjs). Zero Node I/O.
 */

export const ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION = '1.0';
/** Closed 15 lens ids (stable order for projection). */
export const IMPROVEMENT_LENS_IDS = [
    'soc',
    'cohesion',
    'coupling',
    'srp',
    'dip',
    'ocp',
    'encapsulation',
    'modularity',
    'scalability',
    'resilience',
    'security',
    'maintainability',
    'testability',
    'domain',
    'stack',
];
/** Cap for topResidual — short, agent-legible list (not a ranking score). */
export const IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP = 5;
/** Locked out-of-scope — never become residual from missing sensors. */
export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES = [
    'scalability',
    'resilience',
    'security',
];
/** Shared out-of-scope set for mappers and build. */
export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_SET = new Set(IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES);
/**
 * Residual sort priority (lower = earlier in topResidual). Product relevance,
 * not a health score. Ties break by id.
 */
export const IMPROVEMENT_COMPASS_RESIDUAL_SORT_PRIORITY = {
    soc: 10,
    coupling: 20,
    dip: 30,
    domain: 40,
    srp: 50,
    cohesion: 60,
    encapsulation: 70,
    modularity: 80,
    testability: 90,
    maintainability: 100,
    ocp: 110,
    stack: 120,
    scalability: 200,
    resilience: 200,
    security: 200,
};
export const IMPROVEMENT_COMPASS_LENS_LABELS = {
    soc: 'Separation of concerns',
    cohesion: 'High cohesion',
    coupling: 'Low coupling',
    srp: 'Single responsibility (architecture)',
    dip: 'Dependency inversion',
    ocp: 'Open/closed',
    encapsulation: 'Encapsulation',
    modularity: 'Modularity',
    scalability: 'Scalability / performance',
    resilience: 'Resilience / fault tolerance',
    security: 'Security by design',
    maintainability: 'Maintainability',
    testability: 'Testability',
    domain: 'Domain alignment',
    stack: 'Stack-specific practices',
};
export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_SUMMARIES = {
    scalability: 'ArkGate does not measure performance or horizontal scale. Use load tests and APM outside Ark.',
    resilience: 'ArkGate does not measure app resilience or chaos readiness. Structural boundaries and optional experimental runtime are not a resilience score.',
    security: 'ArkGate does not run SAST or app-security tooling. Structural least-privilege of effects is partial only — not a security rating.',
};
export function improvementCompassHumanLabel(id) {
    return IMPROVEMENT_COMPASS_LENS_LABELS[id] ?? id;
}
