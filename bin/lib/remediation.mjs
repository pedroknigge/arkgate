/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/remediation.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/remediation.mjs). Zero Node I/O.
 */

export const REMEDIATION_CLASSES = [
    'mechanical-safe',
    'judgment',
    'deferred',
];
/** All remediationKinds that may return class: mechanical-safe (ordered for docs/tests). */
export const MECHANICAL_SAFE_KINDS = [
    'pure-type-file-relocate',
    'type-only-import-move',
    'import-type-from-pure-type-module',
    'import-type-of-type-exports',
    // port-proof-inject-binding is intentionally NOT mechanical-safe (signature change).
];
/**
 * Judgment-class kinds that still have a named transform / plan label (eval corpus vocabulary).
 * Never auto-apply without multi-file / caller proof.
 */
export const JUDGMENT_SUGGESTED_KINDS = [
    'port-proof-inject-binding',
];
/** fixClass values from enrichViolationWithFixClass (eval corpus / reports). */
export const KNOWN_FIX_CLASSES = [
    'file-move',
    'port-inversion',
    'cross-slice-boundary',
    'inject-port',
    'registered-intent',
    'add-source-metadata',
    'fix-source-layer',
    'intent-relocation',
    'break-cycle',
    'review-contract',
];
/**
 * Co-pilot work classifier — the TRUST BOUNDARY for auto-apply.
 * Biased toward 'judgment': false mechanical-safe is worse than an extra human approval.
 */
export function classifyRemediation(violation) {
    const ruleId = violation?.ruleId;
    if (ruleId === 'LAYER_IMPORT_VIOLATION') {
        // Cross-slice peer isolation is always judgment (extract shared / events — not mechanical).
        if (violation?.peerIsolation) {
            return {
                class: 'judgment',
                confidence: 0.9,
                rationale: 'peerIsolation blocks cross-slice imports: extract to shared, use events/ports, or redesign ownership — not a mechanical auto-fix.',
            };
        }
        // Single invariant: runtime module loads are never mechanical-safe.
        const edgeKind = violation?.edgeKind;
        if (edgeKind === 'require' || edgeKind === 'dynamic-import') {
            return {
                class: 'judgment',
                confidence: 0.75,
                rationale: 'Runtime module load (require/import()) still executes the target file — not auto-safe; rewrite to a static import type if appropriate.',
            };
        }
        if (violation?.typeOnly && violation?.sourcePureTypeModule) {
            return {
                class: 'mechanical-safe',
                confidence: 0.88,
                remediationKind: 'pure-type-file-relocate',
                rationale: 'Whole source file is type-only surface (no runtime statements) with a type-only cross-layer edge: relocate the file to the owning layer (or extract the type there). Behavior-preserving; gate verifies.',
            };
        }
        if (violation?.typeOnly) {
            return {
                class: 'mechanical-safe',
                confidence: 0.9,
                remediationKind: 'type-only-import-move',
                rationale: 'Type-only import (erased at runtime): move the type to the layer that owns it and re-export for back-compat. Behavior-preserving, and the gate verifies it.',
            };
        }
        if (violation?.targetTypeOnlyExports) {
            return {
                class: 'mechanical-safe',
                confidence: 0.85,
                remediationKind: 'import-type-from-pure-type-module',
                rationale: 'Static import targets a pure type-only module: convert to `import type` (erased at runtime) and place the type in a shared/owning layer. No runtime coupling; gate verifies.',
            };
        }
        // R6: value-syntax named import/export of type-only exports from a mixed module.
        // Only set when scan proves no dual-space value export and no top-level side effects.
        if (violation?.namedBindingsTypeOnly) {
            return {
                class: 'mechanical-safe',
                confidence: 0.86,
                remediationKind: 'import-type-of-type-exports',
                rationale: 'Named bindings are type-only exports of the target module (even if the file also exports values): convert to `import type` / `export type` (erased at runtime). Gate verifies.',
            };
        }
        // W6: port-proof inject is a *suggested* shape when proof holds, but always judgment
        // for auto-apply — adding a required parameter breaks external call sites.
        if (violation?.portProofEligible &&
            edgeKind !== 'require' &&
            edgeKind !== 'dynamic-import' &&
            !violation?.typeOnly) {
            return {
                class: 'judgment',
                confidence: 0.82,
                remediationKind: 'port-proof-inject-binding',
                rationale: 'Port-proof shape: single named value import used only as binding.method(...) in function declarations. Inject as a port parameter (body-local calls preserved) — outer layer must pass the impl. Not mechanical-safe auto-apply: call arity changes. Apply via agent judgment / multi-file plan.',
            };
        }
        return {
            class: 'judgment',
            confidence: 0.7,
            rationale: 'Value import — real runtime coupling. Relocating it (e.g. a route reaching the DB → a repository) is a refactor whose organization is a human choice.',
        };
    }
    if (ruleId === 'FORBIDDEN_GLOBAL') {
        return {
            class: 'judgment',
            confidence: 0.8,
            rationale: 'Ambient global in a pure layer: inject the capability through a port (Clock, Config, Http). Introducing the port is a design decision.',
        };
    }
    if (ruleId === 'CIRCULAR_DEPENDENCY') {
        return {
            class: 'judgment',
            confidence: 0.7,
            rationale: 'Dependency cycle: breaking it means deciding which side owns the shared abstraction.',
        };
    }
    if (typeof ruleId === 'string' && ruleId.length > 0) {
        return {
            class: 'judgment',
            confidence: 0.6,
            rationale: 'Needs a human decision on how to satisfy the contract without weakening the gate.',
        };
    }
    return {
        class: 'deferred',
        confidence: 0.3,
        rationale: 'Unrecognized violation shape — a human should look before anything is changed.',
    };
}
/**
 * Deterministic fix-class labels for JSON output (English, shared with skills/reports).
 */
export function enrichViolationWithFixClass(violation) {
    const enriched = { ...violation };
    switch (violation.ruleId) {
        case 'LAYER_IMPORT_VIOLATION':
            if (violation.typeOnly || violation.targetTypeOnlyExports || violation.namedBindingsTypeOnly) {
                enriched.fixClass = 'file-move';
                enriched.effort = 'small';
                enriched.enthusiastHint = violation.namedBindingsTypeOnly
                    ? 'Those named imports are type-only exports of the target — use `import type { … }` (or `export type { … }`) so the edge is erased at runtime.'
                    : violation.targetTypeOnlyExports
                        ? 'The imported module only exports types — use `import type` and place the type in a layer both sides may share.'
                        : 'This is a type-only import — move the type to a layer both sides may share, or relocate the file to match its role.';
            }
            else if (violation.peerIsolation) {
                enriched.fixClass = 'cross-slice-boundary';
                enriched.effort = 'medium';
                enriched.enthusiastHint =
                    'Cross-slice import blocked (peerIsolation). Do not import another feature/context directly — extract shared code to a shared layer, or coordinate via events/ports. Moving code across slices is a judgment call, not a mechanical auto-fix.';
            }
            else {
                enriched.fixClass = 'port-inversion';
                enriched.effort = 'medium';
                enriched.enthusiastHint = `${violation.fromLayer ?? 'This layer'} must not import ${violation.toLayer ?? 'that layer'} directly. Define an interface (port) where you need the capability and inject the implementation from the outer layer.`;
            }
            break;
        case 'FORBIDDEN_GLOBAL':
            enriched.fixClass = 'inject-port';
            enriched.effort = 'small';
            enriched.enthusiastHint = `Do not call "${violation.target ?? 'that global'}" here. Pass the capability in through a small interface (for example a Clock, HttpPort, or Config provider).`;
            break;
        case 'RAW_EVENT_PUBLISH':
            enriched.fixClass = 'registered-intent';
            enriched.effort = 'small';
            enriched.enthusiastHint =
                'Register the event intent first, then publish through the creator returned by the registry — not a raw string or object.';
            break;
        case 'PUBLISH_MISSING_SOURCE':
            enriched.fixClass = 'add-source-metadata';
            enriched.effort = 'small';
            enriched.enthusiastHint =
                'Add metadata.source to the publish call so Structrail knows which layer is publishing the event.';
            break;
        case 'PUBLISH_SOURCE_LAYER_MISMATCH':
            enriched.fixClass = 'fix-source-layer';
            enriched.effort = 'small';
            enriched.enthusiastHint =
                'Use a source intent that belongs to the same layer as this file, or move the publish call to the layer that owns the source.';
            break;
        case 'LAYER_INTENT_REFERENCE_VIOLATION':
            enriched.fixClass = 'intent-relocation';
            enriched.effort = 'small';
            enriched.enthusiastHint =
                'Reference that intent from a layer allowed to know about it — usually an adapter or application layer, not the domain core.';
            break;
        case 'CIRCULAR_DEPENDENCY':
            enriched.fixClass = 'break-cycle';
            enriched.effort = 'medium';
            enriched.enthusiastHint =
                'Two modules import each other in a loop. Extract shared code, invert one dependency behind a port, or merge them if they are really one unit.';
            break;
        default:
            enriched.fixClass = 'review-contract';
            enriched.effort = 'small';
            enriched.enthusiastHint =
                'Read the violation message and the layer rules in structrail.config.json, then adjust imports or move code to the correct layer.';
    }
    return enriched;
}
