/**
 * ArkOrder resolver-fact extraction (ADR 0029). Syntax only — no verdicts.
 */
export const ARKORDER_PLANE_FACTORY = 'createOrderPlane';

export const ARKORDER_FORBIDDEN_METHODS = ['update', 'patch', 'set', 'mutate'] as const;

export type ResolvedArkOrderPlaneCallFact = {
  file: string;
  line: number;
  callee: string;
};

export type ResolvedArkOrderGenericUpdateFact = {
  file: string;
  line: number;
  method: string;
};

export type ResolvedArkOrderRootHitFact = {
  file: string;
  matchedRoot: string;
  hasPlaneFactory: boolean;
};

export function isArkOrderModuleSpecifier(specifier: string): boolean {
  return specifier === 'arkgate/order' || specifier.startsWith('arkgate/order/');
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

function stripCommentsPreservingLines(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (c) => ' '.repeat(c.length)));
}

export function extractArkOrderPlaneCallsFromSource(
  file: string,
  content: string
): ResolvedArkOrderPlaneCallFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderPlaneCallFact[] = [];
  const re = /\bcreateOrderPlane\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    facts.push({ file, line: lineAt(content, match.index), callee: ARKORDER_PLANE_FACTORY });
  }
  return facts;
}

export function extractArkOrderGenericUpdatesFromSource(
  file: string,
  content: string
): ResolvedArkOrderGenericUpdateFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderGenericUpdateFact[] = [];
  const re = /\.((?:update|patch|set|mutate))\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const method = match[1]!;
    const before = source.slice(Math.max(0, match.index - 80), match.index);
    if (!/\b(?:plane|orderPlane|order)\s*$/.test(before) && !/\bcreateOrderPlane\b/.test(source)) {
      continue;
    }
    facts.push({ file, line: lineAt(content, match.index), method });
  }
  return facts;
}
