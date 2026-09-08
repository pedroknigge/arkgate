/**
 * App-context caption, optional trust tag, and optional owners from layer metadata.
 * Metadata only — callers project it; policyHash strips it elsewhere.
 * Present values are returned; absence/empty/invalid is omitted.
 */

export const LAYER_TRUST_BOUNDARIES = Object.freeze(['public', 'auth', 'admin', 'internal']);

/**
 * @param {{ description?: unknown } | null | undefined} layerOrPlacement
 * @returns {string | undefined}
 */
export function layerDescriptionCaption(layerOrPlacement) {
  const caption =
    layerOrPlacement && typeof layerOrPlacement === 'object'
      ? layerOrPlacement.description
      : undefined;
  return typeof caption === 'string' && caption.length > 0 ? caption : undefined;
}

/**
 * @param {{ trustBoundary?: unknown } | null | undefined} layerOrPlacement
 * @returns {'public' | 'auth' | 'admin' | 'internal' | undefined}
 */
export function layerTrustBoundary(layerOrPlacement) {
  const tag =
    layerOrPlacement && typeof layerOrPlacement === 'object'
      ? layerOrPlacement.trustBoundary
      : undefined;
  return typeof tag === 'string' && LAYER_TRUST_BOUNDARIES.includes(tag) ? tag : undefined;
}

/**
 * @param {{ owners?: unknown } | null | undefined} layerOrPlacement
 * @returns {string[] | undefined}
 */
export function layerOwners(layerOrPlacement) {
  const raw =
    layerOrPlacement && typeof layerOrPlacement === 'object' ? layerOrPlacement.owners : undefined;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const ids = raw.filter((entry) => typeof entry === 'string' && entry.length > 0);
  return ids.length > 0 ? ids : undefined;
}

function formatOwnerMention(id) {
  return id.includes('@') ? id : `@${id}`;
}

/**
 * One guidance fragment: caption and/or `trust: public` and/or `owner: @handle`.
 * @param {{ description?: unknown, trustBoundary?: unknown, owners?: unknown } | null | undefined} layerOrPlacement
 * @returns {string | undefined}
 */
export function layerGuidanceLine(layerOrPlacement) {
  const caption = layerDescriptionCaption(layerOrPlacement);
  const trust = layerTrustBoundary(layerOrPlacement);
  const owners = layerOwners(layerOrPlacement);
  const ownerBit = owners ? `owner: ${owners.map(formatOwnerMention).join(', ')}` : undefined;
  const bits = [caption, trust ? `trust: ${trust}` : undefined, ownerBit].filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : undefined;
}

/**
 * Project caption + trust tag + owners onto place / prepare-write / coverage / doctor JSON.
 * Absence omits the field (never empty string / empty array).
 *
 * @param {{ description?: unknown, trustBoundary?: unknown, owners?: unknown } | null | undefined} layerOrPlacement
 * @returns {{ description?: string, trustBoundary?: string, owners?: string[] }}
 */
export function placementDescriptionFields(layerOrPlacement) {
  const caption = layerDescriptionCaption(layerOrPlacement);
  const trust = layerTrustBoundary(layerOrPlacement);
  const owners = layerOwners(layerOrPlacement);
  return {
    ...(caption ? { description: caption } : {}),
    ...(trust ? { trustBoundary: trust } : {}),
    ...(owners ? { owners } : {}),
  };
}

/**
 * Doctor residual when requireLayerOwners is on and a live house has no owners.
 * Absent/false require → null (silent). Not a computeDoctorAdvisories key.
 *
 * @param {{ requireLayerOwners?: unknown, layers?: Array<{ name?: string, owners?: unknown, optional?: boolean, reserved?: boolean, allowEmpty?: boolean }> } | null | undefined} config
 * @returns {{ required: true, missingLayers: string[], ask: string, nextAction: string } | null}
 */
export function collectLayerOwnerResidual(config) {
  if (config?.requireLayerOwners !== true || !Array.isArray(config.layers)) return null;
  const missing = config.layers
    .filter(
      (layer) =>
        layer &&
        layer.optional !== true &&
        layer.reserved !== true &&
        layer.allowEmpty !== true &&
        !layerOwners(layer)
    )
    .map((layer) => layer.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
  if (missing.length === 0) return null;
  const named = missing[0];
  return {
    required: true,
    missingLayers: missing,
    ask: `${named} has no owner. Add a GitHub handle or email to layers[].owners.`,
    nextAction: `Add a GitHub handle or email to ${named}'s owners in ark.config.json (/ark-adopt).`,
  };
}
