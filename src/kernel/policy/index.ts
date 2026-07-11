/**
 * Structrail Policy module
 * Declarative hard and soft policy engine for architectural governance.
 */

export * from './types';
export * from './PolicyEngine';
export { PolicyViolationError } from './PolicyViolationError';
export { definePolicy, type DefinePolicyOptions } from './definePolicy';
export {
  defineLayerPolicy,
  defineArchitectureProfilePolicy,
  architecturalPolicies,
  isLayerPolicy,
  type LayerPolicyOptions,
  type LayerFlowRule,
} from './builtins';
