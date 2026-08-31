/**
 * App-context caption from `layers[].description`.
 * Metadata only — callers project it; policyHash strips it elsewhere.
 * Present non-empty string is returned; absence/empty/non-string is undefined.
 *
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
 * Project the caption onto place / prepare-write / coverage / doctor JSON.
 * Absence omits the field (never empty string).
 *
 * @param {{ description?: unknown } | null | undefined} layerOrPlacement
 * @returns {{ description: string } | {}}
 */
export function placementDescriptionFields(layerOrPlacement) {
  const caption = layerDescriptionCaption(layerOrPlacement);
  return caption ? { description: caption } : {};
}
