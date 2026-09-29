/**
 * AI Code Gate (basic).
 *
 * Allows validation of generated source code against the defined architecture.
 */

export interface AICodeGateViolation {
  /** Stable rule identifier for agents and CI pipelines. */
  ruleId: string;
  /** @deprecated Use ruleId — kept for backward compatibility. */
  code: string;
  message: string;
  line?: number;
  suggestion?: string;
  source?: string;
  filePath?: string;
  target?: string;
  fromLayer?: string;
  toLayer?: string;
  /** Nested-wall reason. Absent on a classic layer deny and on a child-only parent import. */
  reasonId?: string;
  /** Last segment of the importer universe id, with a reasonId. */
  universeFrom?: string;
  /** Last segment of the importee universe id, with a reasonId. */
  universeTo?: string;
  /** True when a peerIsolation rule produced this finding (also mirrored in details). */
  peerIsolation?: boolean;
  /** False for an advisory sibling crossing. Omitted findings still block the snippet. */
  failsStrict?: boolean;
  details?: unknown;
}

/** Extension point for external analyzers (AST, semantic, etc.). */
export interface AIGateExtension<Context = unknown> {
  readonly name: string;
  analyze(source: string, context?: Context): AICodeGateViolation[];
}

export interface AICodeGateContext {
  filePath?: string;
  agentId?: string;
  layer?: string;
  [key: string]: unknown;
}

export interface AICodeGateResult {
  /** Single-source snippets do not carry project-wide resolver evidence. */
  mode: 'lexical-compatibility';
  /** A snippet result is intentionally never an authoritative complete verdict. */
  completeness: 'partial';
  completenessReasons: string[];
  /** Authoritative verdict. Always false until the complete candidate is resolved. */
  valid: boolean;
  /** Compatibility signal for the bounded lexical checks performed here. */
  lexicalValid: boolean;
  violations: AICodeGateViolation[];
}

export interface AICodeGate<Context = AICodeGateContext> {
  validate(source: string, context?: Context): AICodeGateResult;
}
