/**
 * Structrail Intent module
 * Semantic naming and relationship declaration for architectural governance.
 */

export * from './types';
export * from './IntentRegistry';
export { defineIntent, createIntentRegistry, defaultIntentRegistry } from './defineIntent';
export { validateIntentName, type IntentNameValidation } from './validateIntentName';
