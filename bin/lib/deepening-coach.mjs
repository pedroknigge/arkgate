/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/deepeningCoach.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/deepening-coach.mjs). Zero Node I/O.
 */

export const ARK_DEEPENING_COACH_SCHEMA_VERSION = '1.0';
/** Cap on listed deepening candidates (agent-legible; not a ranking score). */
export const DEEPENING_CANDIDATE_CAP = 5;
function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function firstEvidencePath(evidence) {
    if (!Array.isArray(evidence))
        return '';
    for (const row of evidence) {
        if (typeof row === 'string' && row.trim())
            return row.trim().replace(/\\/g, '/');
        if (row && typeof row === 'object') {
            const path = asString(row.path)
                || asString(row.file);
            if (path)
                return path.replace(/\\/g, '/');
        }
    }
    return '';
}
function evidenceList(source, refs, detail) {
    const out = [];
    for (const ref of refs) {
        const r = asString(ref);
        if (!r)
            continue;
        out.push(detail ? { source, ref: r, detail } : { source, ref: r });
    }
    return out;
}
/**
 * Project deepening candidates from existing doctor-side evidence only.
 * Empty input / no residual → empty `candidates` (honesty: no fake list).
 */
export function buildDeepeningCandidates(input = {}) {
    const candidates = [];
    const seen = new Set();
    const push = (candidate) => {
        if (candidates.length >= DEEPENING_CANDIDATE_CAP)
            return;
        const key = `${candidate.target}|${candidate.friction}`.toLowerCase();
        if (seen.has(key))
            return;
        if (!asString(candidate.target) || !asString(candidate.friction))
            return;
        seen.add(key);
        candidates.push(candidate);
    };
    const pilot = input.pilotLoop?.active === true && input.pilotLoop.nextPilot
        ? input.pilotLoop.nextPilot
        : null;
    if (pilot) {
        // Require a real pilot identity — empty shells are not evidence.
        const target = asString(pilot.pilotTarget) || asString(pilot.pilot) || asString(pilot.smellId);
        if (target) {
            push({
                target,
                friction: asString(pilot.smellId)
                    ? `Shape pilot residual (${pilot.smellId}) — one extraction at a time`
                    : 'Shape pilot residual — one extraction at a time',
                intent: asString(pilot.move) ||
                    'Deepen the public seam; hide implementation behind a small interface',
                benefit: asString(pilot.successSignal) ||
                    'Locality: change and tests concentrate at the public interface',
                evidence: evidenceList('pilotLoop', [target], 'nextPilot'),
            });
        }
    }
    const smells = Array.isArray(input.designSmells) ? input.designSmells : [];
    for (const smell of smells) {
        if (!smell || typeof smell !== 'object')
            continue;
        const id = asString(smell.id);
        const path = firstEvidencePath(smell.evidence);
        // Require non-empty smell id or evidence path — whitespace shells are not evidence.
        if (!id && !path)
            continue;
        const target = path || id;
        const friction = asString(smell.outcome) || asString(smell.message) || `Design residual (${id || target})`;
        push({
            target,
            friction,
            intent: asString(smell.fix) ||
                'Prefer a deep module at a named seam; apply the deletion test before pass-through extracts',
            benefit: 'Leverage: callers learn a smaller interface; locality of change improves',
            evidence: evidenceList('designSmells', path ? [path, id].filter(Boolean) : [id], id || undefined),
        });
    }
    const pc = input.physicalCohesion;
    const reshape = pc?.reshapePilot?.nextPilot;
    if (reshape) {
        const target = asString(reshape.pilotTarget) || asString(reshape.pilot);
        if (target) {
            push({
                target,
                friction: 'Physical cohesion residual — concept concentration across anchors',
                intent: asString(reshape.move) ||
                    'One reshape pilot toward locality; never mechanical-safe multi-file batch',
                benefit: asString(reshape.successSignal) ||
                    'Related behavior co-located; public seams stay small',
                evidence: evidenceList('physicalCohesion', [target], 'reshapePilot'),
            });
        }
    }
    const findings = Array.isArray(pc?.findings) ? pc.findings : [];
    for (const finding of findings) {
        if (!finding || typeof finding !== 'object')
            continue;
        const concept = asString(finding.concept);
        const anchors = Array.isArray(finding.anchors)
            ? finding.anchors.map((a) => asString(a)).filter(Boolean)
            : [];
        const target = anchors[0] || concept;
        if (!target)
            continue;
        push({
            target,
            friction: asString(finding.message) ||
                (concept
                    ? `Concept "${concept}" concentrated across physical anchors`
                    : 'Physical cohesion residual'),
            intent: 'Deepen by colocating behavior behind one public interface per concern',
            benefit: 'Locality of change; fewer cross-anchor edits for one concept',
            evidence: evidenceList('physicalCohesion', anchors.length > 0 ? anchors.slice(0, 3) : [target], concept || undefined),
        });
    }
    const compass = input.improvementCompass;
    if (compass && compass.notAScore === true) {
        const residualIds = Array.isArray(compass.topResidual)
            ? compass.topResidual.map((id) => asString(id)).filter(Boolean)
            : [];
        const lensById = new Map();
        if (Array.isArray(compass.lenses)) {
            for (const lens of compass.lenses) {
                if (lens && typeof lens === 'object' && asString(lens.id)) {
                    lensById.set(asString(lens.id), { summary: asString(lens.summary) || undefined });
                }
            }
        }
        for (const id of residualIds) {
            // Each residual lens id is independent evidence. Cap + target|friction dedupe may
            // still list both a smell card and lens:<id> — no cross-source suppression.
            const summary = lensById.get(id)?.summary;
            push({
                target: `lens:${id}`,
                friction: summary
                    ? `Residual lens ${id}: ${summary}`
                    : `Residual architecture lens ${id} (not a score)`,
                intent: 'Process judgment: deepen modules / name seams that clear this lens residual',
                benefit: 'Clear residual without inventing a depth score or gate fail',
                evidence: evidenceList('improvementCompass', [id], 'topResidual'),
            });
        }
    }
    return {
        schemaVersion: ARK_DEEPENING_COACH_SCHEMA_VERSION,
        notAScore: true,
        candidates,
    };
}
/**
 * True when the pure projection would list zero candidates (honesty helper for tests).
 */
export function hasNoDeepeningEvidence(input) {
    return buildDeepeningCandidates(input).candidates.length === 0;
}
