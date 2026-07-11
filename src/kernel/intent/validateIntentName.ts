/**
 * Runtime validation for semantic intent naming conventions.
 */

const ALLOWED_PREFIXES = [
  'Domain.',
  'Application.',
  'Adapter.',
  'Workflow.',
  'Job.',
  'Presentation.',
  'Reporting.',
  'Metadata.',
  'Security.',
  'Audit.',
  'Observability.',
  'Kernel.',
] as const;

export interface IntentNameValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that an intent name follows Structrail naming conventions.
 */
export function validateIntentName(name: string): IntentNameValidation {
  if (!name || typeof name !== 'string') {
    return { valid: false, reason: 'Intent name must be a non-empty string' };
  }

  if (!ALLOWED_PREFIXES.some((p) => name.startsWith(p))) {
    return {
      valid: false,
      reason: `Intent "${name}" must start with one of: ${ALLOWED_PREFIXES.join(', ')}`,
    };
  }

  const rest = name.slice(name.indexOf('.') + 1);
  if (!rest || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(rest)) {
    return {
      valid: false,
      reason: `Intent "${name}" has an invalid segment after the layer prefix`,
    };
  }

  return { valid: true };
}
