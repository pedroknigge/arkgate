/**
 * Unique starter ArkRules ids. Rule ids must be unique across arkrules/*.json
 * (`ark-check --promote <id> --apply` refuses an id declared in two documents), and several
 * project layers can clone the same archetype template. A clone for a layer other than the
 * archetype's own therefore gets its ids prefixed with the kebab-cased layer name
 * (`INV-*` invariants keep their prefix: `INV-<LAYER>-…`).
 */

export function kebabLayerName(layerName) {
  return String(layerName)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * @param {{ layer?: string, structure?: unknown[], invariants?: unknown[] }} archetype parsed template
 * @param {string} layerName target project layer
 */
export function cloneArchetypeForLayer(archetype, layerName) {
  const prefix =
    archetype.layer && archetype.layer !== layerName ? `${kebabLayerName(layerName)}-` : '';
  const prefixedId = (id) =>
    id.startsWith('INV-') ? `INV-${prefix.toUpperCase()}${id.slice('INV-'.length)}` : `${prefix}${id}`;
  const withPrefix = (rules) =>
    Array.isArray(rules)
      ? rules.map((rule) =>
          prefix && rule && typeof rule.id === 'string' ? { ...rule, id: prefixedId(rule.id) } : rule
        )
      : rules;
  return {
    ...archetype,
    layer: layerName,
    structure: withPrefix(archetype.structure),
    invariants: withPrefix(archetype.invariants),
  };
}
