/**
 * App-context caption and optional trust tag from layer metadata.
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
 * One guidance fragment: caption and/or `trust: public`.
 * @param {{ description?: unknown, trustBoundary?: unknown } | null | undefined} layerOrPlacement
 * @returns {string | undefined}
 */
export function layerGuidanceLine(layerOrPlacement) {
  const caption = layerDescriptionCaption(layerOrPlacement);
  const trust = layerTrustBoundary(layerOrPlacement);
  const bits = [caption, trust ? `trust: ${trust}` : undefined].filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : undefined;
}

/**
 * Project caption + trust tag onto place / prepare-write / coverage / doctor JSON.
 * Absence omits the field (never empty string).
 *
 * @param {{ description?: unknown, trustBoundary?: unknown } | null | undefined} layerOrPlacement
 * @returns {{ description?: string, trustBoundary?: string }}
 */
export function placementDescriptionFields(layerOrPlacement) {
  const caption = layerDescriptionCaption(layerOrPlacement);
  const trust = layerTrustBoundary(layerOrPlacement);
  return {
    ...(caption ? { description: caption } : {}),
    ...(trust ? { trustBoundary: trust } : {}),
  };
}
