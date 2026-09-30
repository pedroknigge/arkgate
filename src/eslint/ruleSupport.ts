/**
 * Shared ESLint adapter plumbing: context shapes, filename / source helpers, and the
 * adapter-diagnostic report path. Channel routing lives in reportChannels.ts.
 */
import {
  toAdapterDiagnostic,
  type AdapterDiagnostic,
  type AdapterViolationInput,
} from '../domain/adapterContract';
import { deliverReport } from './reportChannels';

export type AstNode = {
  type?: string;
  name?: string;
  value?: unknown;
  source?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  key?: AstNode;
  arguments?: AstNode[];
  properties?: AstNode[];
  body?: AstNode[];
  declaration?: AstNode;
  importKind?: string;
  exportKind?: string;
  specifiers?: AstNode[];
  parent?: AstNode;
  init?: AstNode;
  id?: AstNode;
  left?: AstNode;
  argument?: AstNode;
  expression?: AstNode;
  quasis?: Array<{ value?: { cooked?: string | null } }>;
  expressions?: unknown[];
  computed?: boolean;
  optional?: boolean;
  loc?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  };
};

type ScopeVariable = { defs?: unknown[] };
export type ScopeReference = {
  identifier?: AstNode;
  resolved?: ScopeVariable | null;
  isValueReference?: boolean;
};
type Scope = {
  set?: Map<string, ScopeVariable>;
  references?: ScopeReference[];
  upper?: Scope | null;
};
export type SourceCode = {
  getScope?: (node: AstNode) => Scope;
  getText?: () => string;
  text?: string;
};

export type RuleContext = {
  report(descriptor: Record<string, unknown>): void;
  /** ESLint 9+ / 10: preferred path on the context object. */
  filename?: string;
  /** ESLint 8-style physical path when linting with processors / virtual files. */
  physicalFilename?: string;
  /** ESLint ≤8 API — still present on some hosts; removed in ESLint 10. */
  getFilename?: () => string;
  /** ESLint 9+ source/scope API. */
  sourceCode?: SourceCode;
  /** ESLint ≤8 source/scope API. */
  getSourceCode?: () => SourceCode;
  options?: unknown[];
};

export type RuleListener = Record<string, (node: AstNode) => void>;

export type ArkRule = {
  meta: {
    type: 'problem';
    docs: { description: string };
    messages: Record<string, string>;
    schema: unknown[];
  };
  create(context: RuleContext): RuleListener;
};

/** Resolve the file path being linted across ESLint 8–10 context shapes. */
export function lintedFilename(context: RuleContext): string {
  if (typeof context.physicalFilename === 'string' && context.physicalFilename.length > 0) {
    return context.physicalFilename;
  }
  if (typeof context.filename === 'string' && context.filename.length > 0) {
    return context.filename;
  }
  if (typeof context.getFilename === 'function') {
    try {
      const name = context.getFilename();
      if (typeof name === 'string' && name.length > 0) return name;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function sourceCodeFor(context: RuleContext): SourceCode | undefined {
  try {
    return context.sourceCode ?? context.getSourceCode?.();
  } catch {
    return undefined;
  }
}

/**
 * Text ESLint is linting (editor buffer / stdin), or null when the host exposes no
 * SourceCode API. Callers fall back to disk only in that case.
 */
export function editorSourceText(context: RuleContext): string | null {
  const sourceCode = sourceCodeFor(context);
  if (!sourceCode) return null;
  if (typeof sourceCode.getText === 'function') {
    const text = sourceCode.getText();
    if (typeof text === 'string') return text;
  }
  return typeof sourceCode.text === 'string' ? sourceCode.text : null;
}

// ── Reporting ──────────────────────────────────────────────────────────────

function reportLocation(
  node: AstNode,
  line: number
): { node: AstNode } | { loc: { line: number; column: number } } {
  const start = node.loc?.start;
  if (typeof start?.line === 'number' && typeof start.column === 'number') return { node };
  return { loc: { line: typeof start?.line === 'number' ? start.line : line, column: 0 } };
}

/**
 * Build the adapter diagnostic and deliver it to the rule id that owns it: blocking
 * findings to the evaluating rule, non-blocking ones to `ark/architecture-advisory`
 * (see reportChannels.ts).
 */
export function reportAdapterDiagnostic(
  context: RuleContext,
  node: AstNode,
  messageId: string,
  violation: AdapterViolationInput,
  data?: Record<string, unknown>
): AdapterDiagnostic {
  const diagnostic = toAdapterDiagnostic({
    ...violation,
    line: violation.line ?? node.loc?.start?.line,
    column:
      violation.column ??
      (typeof node.loc?.start?.column === 'number' ? node.loc.start.column + 1 : undefined),
  });
  deliverReport(context, {
    nonBlocking: diagnostic.severity === 'warning',
    location: reportLocation(node, diagnostic.location.line),
    messageId,
    ...(data ? { data } : {}),
    advisoryData: { message: diagnostic.message, ruleId: diagnostic.ruleId },
    diagnostic,
  });
  return diagnostic;
}

/** Combine several listener maps; each selector runs every contributing handler in order. */
export function mergeListeners(listeners: RuleListener[]): RuleListener {
  const merged: Record<string, Array<(node: AstNode) => void>> = {};
  for (const listener of listeners) {
    for (const [selector, handler] of Object.entries(listener)) {
      (merged[selector] ??= []).push(handler);
    }
  }
  const out: RuleListener = {};
  for (const [selector, handlers] of Object.entries(merged)) {
    out[selector] =
      handlers.length === 1
        ? handlers[0]!
        : (node: AstNode) => {
            for (const handler of handlers) handler(node);
          };
  }
  return out;
}
