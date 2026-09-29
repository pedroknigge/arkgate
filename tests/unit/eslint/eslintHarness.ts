/**
 * Minimal ESLint-9-shaped runner for the Ark plugin (eslint itself is not a repo dependency).
 *
 * Mirrors what matters for editor parity: rules from `configs.recommended` with their
 * configured severity, one per-run file context (shared SourceCode, buffer text) that every
 * rule context inherits from, ESTree nodes with
 * `parent` + `loc`, messageId validation, ESLint's `{{placeholder}}` interpolation, and
 * ESLint's 1-based column (`loc.start.column + 1`).
 */
import { parse } from 'acorn';

type Listener = Record<string, (node: any) => void>;
type Rule = {
  meta: { messages: Record<string, string> };
  create(context: Record<string, unknown>): Listener;
};
type Plugin = { rules: Record<string, Rule>; configs?: Record<string, any> };

export type LintMessage = {
  ruleId: string;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  messageId: string;
  diagnostic?: Record<string, any>;
};

/** ESLint's interpolate(): unknown placeholders stay verbatim. */
export function interpolate(text: string, data: Record<string, unknown> | undefined): string {
  return text.replace(/\{\{([^{}]+?)\}\}/gu, (whole, term: string) => {
    const key = term.trim();
    return data && key in data ? String(data[key]) : whole;
  });
}

function walk(node: any, parent: any, visit: (node: any) => void): void {
  if (!node || typeof node.type !== 'string') return;
  node.parent = parent;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, node, visit);
    } else if (value && typeof value === 'object' && typeof (value as any).type === 'string') {
      walk(value, node, visit);
    }
  }
}

export function lintText(
  plugin: Plugin,
  filename: string,
  text: string,
  opts: { rules?: Record<string, 'error' | 'warn'> } = {}
): LintMessage[] {
  const configured =
    opts.rules ??
    (plugin.configs?.recommended?.rules as Record<string, 'error' | 'warn'> | undefined) ??
    {};
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const sourceCode = { text, getText: () => text };
  const fileContext = Object.freeze({ filename, physicalFilename: filename, sourceCode });
  const messages: LintMessage[] = [];
  const listeners: Array<{ ruleId: string; listener: Listener }> = [];

  for (const [qualified, level] of Object.entries(configured)) {
    const name = qualified.replace(/^ark\//, '');
    const rule = plugin.rules[name];
    if (!rule) throw new Error(`unknown rule ${qualified}`);
    const severity = level === 'error' ? 2 : 1;
    // ESLint 9/10 build every rule context on one per-run FileContext (`fileContext.extend`).
    const context = Object.assign(Object.create(fileContext), {
      id: qualified,
      options: [],
      report(descriptor: Record<string, any>) {
        const messageId = descriptor.messageId as string;
        const template = rule.meta.messages[messageId];
        if (template === undefined) {
          throw new TypeError(`${qualified}: unknown messageId '${messageId}'`);
        }
        const loc = descriptor.loc ?? descriptor.node?.loc;
        const start = loc?.start ?? loc;
        messages.push({
          ruleId: qualified,
          severity,
          message: interpolate(template, descriptor.data),
          line: start?.line,
          column: start?.column + 1,
          messageId,
          diagnostic: descriptor.diagnostic,
        });
      },
    });
    listeners.push({ ruleId: qualified, listener: rule.create(context) });
  }

  walk(ast, null, (node) => {
    for (const { listener } of listeners) listener[node.type]?.(node);
  });
  return messages;
}

export function errorCount(messages: LintMessage[]): number {
  return messages.filter((message) => message.severity === 2).length;
}
