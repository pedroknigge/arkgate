/**
 * Policy types for the Structrail kernel.
 *
 * Policies allow declaring architectural rules that can be checked at runtime.
 * Supports both hard policies (must never be violated) and soft policies (warnings).
 */

export type PolicySeverity = 'hard' | 'soft';
export type PolicyEnforcementMode = 'runtime' | 'static' | 'runtime-and-static' | 'advisory';

/**
 * Represents a single violation of a policy.
 */
export interface PolicyViolation {
  /** Name of the policy that was violated */
  policyName: string;
  /** Severity level of the policy */
  severity: PolicySeverity;
  /** Human-readable explanation of the violation */
  message: string;
  /** Optional additional structured details */
  details?: unknown;
}

/**
 * A Policy defines a rule that can be evaluated against a context.
 *
 * @template Context - The shape of data the policy evaluates (e.g. { registry, events })
 */
export interface Policy<Context = unknown> {
  /** Unique name of the policy (used in violations and reporting) */
  readonly name: string;
  /** Whether this is a hard rule (enforced strictly) or soft (advisory) */
  readonly severity: PolicySeverity;
  /** Optional tags for policy classification (e.g. 'layer', 'naming') */
  readonly tags?: readonly string[];
  readonly owner?: string;
  readonly version?: string;
  readonly rationale?: string;
  readonly enforcementMode?: PolicyEnforcementMode;
  readonly deprecated?: boolean | string;
  readonly replacedBy?: string;
  /**
   * Evaluates the policy against the given context.
   * Return true / [] for pass, false / single violation / array for failure.
   */
  check(context: Context): boolean | PolicyViolation | PolicyViolation[];
}
