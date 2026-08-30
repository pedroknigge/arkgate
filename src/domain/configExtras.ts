/**
 * Opt-in extra fragments for ark.config.json (ArkRun + ArkOrder).
 *
 * DF03 split from configContract.ts so the generated CLI artifact stays under
 * the Q6 ceiling when a new extra is added. Absence of either extra is silent;
 * this module only default/validate a present object.
 */

import type { ArkConfigIssue } from './configTypes';

const stringArraySchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  uniqueItems: true,
} as const;

export const ARK_RUN_SCHEMA_DEF = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: {
      type: 'string',
      enum: ['advisory', 'enforced'],
      default: 'advisory',
    },
    compositionRoots: { ...stringArraySchema, default: [] },
    kernelRoots: { ...stringArraySchema },
    managedLayers: { ...stringArraySchema, default: [] },
    requireDeclarations: { type: 'boolean', default: true },
    ignoreDirectNewForErrors: { type: 'boolean', default: true },
  },
} as const;

export const ARK_ORDER_SCHEMA_DEF = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: {
      type: 'string',
      enum: ['advisory', 'enforced'],
      default: 'advisory',
    },
    planeRoots: { ...stringArraySchema, default: [] },
    managedLayers: { ...stringArraySchema, default: [] },
    maxXiKeys: { type: 'integer', minimum: 1, default: 7 },
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function declaredLayerNames(config: Record<string, unknown>): Set<string> {
  const layerNames = new Set<string>();
  if (!Array.isArray(config.layers)) return layerNames;
  for (const layer of config.layers) {
    if (isObject(layer) && typeof layer.name === 'string' && layer.name.length > 0) {
      layerNames.add(layer.name);
    }
  }
  return layerNames;
}

export function defaultedArkRun(value: unknown): unknown {
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {
    mode: value.mode === undefined ? 'advisory' : value.mode,
    compositionRoots: value.compositionRoots === undefined ? [] : value.compositionRoots,
    managedLayers: value.managedLayers === undefined ? [] : value.managedLayers,
    requireDeclarations: value.requireDeclarations === undefined ? true : value.requireDeclarations,
  };
  if (value.kernelRoots !== undefined) out.kernelRoots = value.kernelRoots;
  if (value.ignoreDirectNewForErrors !== undefined) {
    out.ignoreDirectNewForErrors = value.ignoreDirectNewForErrors;
  }
  return { ...value, ...out };
}

export function defaultedArkOrder(value: unknown): Record<string, unknown> {
  if (!isObject(value)) return value as Record<string, unknown>;
  const max = typeof value.maxXiKeys === 'number' && value.maxXiKeys > 0 ? value.maxXiKeys : 7;
  return {
    ...value,
    mode: value.mode === undefined ? 'advisory' : value.mode,
    planeRoots: value.planeRoots === undefined ? [] : value.planeRoots,
    managedLayers: value.managedLayers === undefined ? [] : value.managedLayers,
    maxXiKeys: max,
  };
}

export function validateArkRunExtra(
  config: Record<string, unknown>,
  issues: ArkConfigIssue[]
): void {
  const extra = config.arkRun;
  if (extra === undefined || !isObject(extra)) return;

  const layerNames = declaredLayerNames(config);
  const managed = extra.managedLayers;
  if (Array.isArray(managed)) {
    managed.forEach((name, index) => {
      if (typeof name === 'string' && name.length > 0 && !layerNames.has(name)) {
        issues.push({
          path: `$.arkRun.managedLayers[${index}]`,
          message: `layer ${JSON.stringify(name)} is not declared in layers[]`,
        });
      }
    });
  }

  if (extra.mode === 'enforced') {
    const roots = extra.kernelRoots ?? extra.compositionRoots;
    if (!Array.isArray(roots) || roots.length === 0) {
      issues.push({
        path: extra.kernelRoots !== undefined ? '$.arkRun.kernelRoots' : '$.arkRun.compositionRoots',
        message: 'ARKRUN_MISSING_ROOT: enforced mode requires at least one kernel root',
      });
    }
    if (!Array.isArray(managed) || managed.length === 0) {
      issues.push({
        path: '$.arkRun.managedLayers',
        message: 'enforced mode requires at least one managed layer',
      });
    }
  }
}

export function validateArkOrderExtra(
  config: Record<string, unknown>,
  issues: ArkConfigIssue[]
): void {
  const extra = config.arkOrder;
  if (extra === undefined || !isObject(extra)) return;

  const layerNames = declaredLayerNames(config);
  const managed = extra.managedLayers;
  if (Array.isArray(managed)) {
    managed.forEach((name, index) => {
      if (typeof name === 'string' && name.length > 0 && !layerNames.has(name)) {
        issues.push({
          path: `$.arkOrder.managedLayers[${index}]`,
          message: `layer ${JSON.stringify(name)} is not declared in layers[]`,
        });
      }
    });
  }

  if (extra.mode === 'enforced') {
    const roots = extra.planeRoots;
    if (!Array.isArray(roots) || roots.length === 0) {
      issues.push({
        path: '$.arkOrder.planeRoots',
        message: 'ARKORDER_MISSING_PLANE: enforced mode requires at least one plane root',
      });
    }
    if (!Array.isArray(managed) || managed.length === 0) {
      issues.push({
        path: '$.arkOrder.managedLayers',
        message: 'enforced mode requires at least one managed layer',
      });
    }
  }
}
