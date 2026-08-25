/**
 * ArkRun requestGraph slices (RN13). Tooling only — never a gate verdict.
 * Consumes the information package so factories and live instances cannot leak.
 */
import {
  buildDependencyInformationPackage,
  type ArkRunComponentLifetime,
  type ArkRunInformationPackageComponent,
  type DependencyInformationPackage,
} from './arkRunInformationPackage';

export const ARK_RUN_GRAPH_SCHEMA_VERSION = '1.0' as const;
export const ARK_RUN_GRAPH_DEFAULT_SLICE = 'process' as const;
export const ARK_RUN_GRAPH_SLICES = ['process', 'technical'] as const;
export const ARK_RUN_GRAPH_NODE_KINDS = ['component', 'interaction'] as const;
export const ARK_RUN_GRAPH_PROCESS_EDGE_KINDS = ['raises', 'reactsTo', 'sends'] as const;
export const ARK_RUN_GRAPH_TECHNICAL_EDGE_KINDS = ['uses'] as const;

export type ArkRunGraphSlice = (typeof ARK_RUN_GRAPH_SLICES)[number];
export type ArkRunGraphNodeKind = (typeof ARK_RUN_GRAPH_NODE_KINDS)[number];
export type ArkRunGraphProcessEdgeKind =
  (typeof ARK_RUN_GRAPH_PROCESS_EDGE_KINDS)[number];
export type ArkRunGraphTechnicalEdgeKind =
  (typeof ARK_RUN_GRAPH_TECHNICAL_EDGE_KINDS)[number];
export type ArkRunGraphEdgeKind =
  | ArkRunGraphProcessEdgeKind
  | ArkRunGraphTechnicalEdgeKind;

export class InvalidArkRunGraphQueryError extends Error {
  readonly option:
    | 'slice'
    | 'degreesOfSeparation'
    | 'nodeIds'
    | 'include'
    | 'exclude';

  constructor(
    option: InvalidArkRunGraphQueryError['option'],
    detail?: string
  ) {
    super(
      detail ??
        (option === 'slice'
          ? 'ArkRun graph slice must be "process" or "technical".'
          : option === 'degreesOfSeparation'
            ? 'ArkRun graph degreesOfSeparation must be a non-negative integer.'
            : `ArkRun graph ${option} is not a closed query.`)
    );
    this.name = 'InvalidArkRunGraphQueryError';
    this.option = option;
  }
}

export type ArkRunGraphMatch = {
  tokens: string[];
  ids: string[];
  labels: string[];
  tags: string[];
  groups: string[];
  architectureKinds: string[];
};

export type ArkRunGraphResolvedQuery = {
  slice: ArkRunGraphSlice;
  nodeIds: string[];
  degreesOfSeparation: number | null;
  include: ArkRunGraphMatch;
  exclude: ArkRunGraphMatch;
};

export type ArkRunGraphQuery = {
  slice?: ArkRunGraphSlice;
  nodeIds?: readonly string[];
  degreesOfSeparation?: number;
  include?: string | readonly string[] | ArkRunGraphMatchInput;
  exclude?: string | readonly string[] | ArkRunGraphMatchInput;
};

export type ArkRunGraphMatchInput = {
  ids?: readonly string[];
  labels?: readonly string[];
  tags?: readonly string[];
  groups?: readonly string[];
  architectureKinds?: readonly string[];
};

export type ArkRunGraphNode = {
  id: string;
  kind: ArkRunGraphNodeKind;
  lifetime?: ArkRunComponentLifetime;
  label?: string;
  group?: string;
  architectureKind?: string;
  tags?: string[];
};

export type ArkRunGraphEdge = {
  from: string;
  to: string;
  kind: ArkRunGraphEdgeKind;
};

export type ArkRunGraph = {
  schemaVersion: typeof ARK_RUN_GRAPH_SCHEMA_VERSION;
  kernelInstanceId: string;
  slice: ArkRunGraphSlice;
  query: ArkRunGraphResolvedQuery;
  nodes: ArkRunGraphNode[];
  edges: ArkRunGraphEdge[];
  mermaid: string;
};

const SLICES = new Set<string>(ARK_RUN_GRAPH_SLICES);
const QUERY_KEYS = new Set([
  'slice',
  'nodeIds',
  'degreesOfSeparation',
  'include',
  'exclude',
]);
const MATCH_KEYS = new Set([
  'ids',
  'labels',
  'tags',
  'groups',
  'architectureKinds',
]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function emptyMatch(): ArkRunGraphMatch {
  return {
    tokens: [],
    ids: [],
    labels: [],
    tags: [],
    groups: [],
    architectureKinds: [],
  };
}

function matchHasCriteria(match: ArkRunGraphMatch): boolean {
  return (
    match.tokens.length +
      match.ids.length +
      match.labels.length +
      match.tags.length +
      match.groups.length +
      match.architectureKinds.length >
    0
  );
}

function nameList(value: unknown, option: 'nodeIds' | 'include' | 'exclude'): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    return uniqueSorted(
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    );
  }
  if (!Array.isArray(value)) {
    throw new InvalidArkRunGraphQueryError(option);
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new InvalidArkRunGraphQueryError(option);
    const trimmed = item.trim();
    if (trimmed.length > 0) names.push(trimmed);
  }
  return uniqueSorted(names);
}

function globMatch(value: string, pattern: string): boolean {
  if (pattern === '*') return value.length > 0;
  if (!pattern.includes('*')) return value === pattern;
  let out = '^';
  for (const ch of pattern) {
    if (ch === '*') out += '.*';
    else if (/[.*+?^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  out += '$';
  return new RegExp(out).test(value);
}

function anyGlob(value: string | undefined, patterns: readonly string[]): boolean {
  if (!value) return false;
  return patterns.some((pattern) => globMatch(value, pattern));
}

function closedSlice(value: unknown): ArkRunGraphSlice {
  if (value === undefined || value === null || value === '') {
    return ARK_RUN_GRAPH_DEFAULT_SLICE;
  }
  if (typeof value === 'string' && SLICES.has(value)) {
    return value as ArkRunGraphSlice;
  }
  throw new InvalidArkRunGraphQueryError('slice');
}

function closedDegrees(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new InvalidArkRunGraphQueryError('degreesOfSeparation');
}

function closedMatch(value: unknown, option: 'include' | 'exclude'): ArkRunGraphMatch {
  if (value === undefined || value === null || value === '') return emptyMatch();
  if (typeof value === 'string' || Array.isArray(value)) {
    return { ...emptyMatch(), tokens: nameList(value, option) };
  }
  if (typeof value !== 'object') throw new InvalidArkRunGraphQueryError(option);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!MATCH_KEYS.has(key)) throw new InvalidArkRunGraphQueryError(option);
  }
  return {
    tokens: [],
    ids: nameList(record.ids, option),
    labels: nameList(record.labels, option),
    tags: nameList(record.tags, option),
    groups: nameList(record.groups, option),
    architectureKinds: nameList(record.architectureKinds, option),
  };
}

export function closeArkRunGraphQuery(input: unknown = {}): ArkRunGraphResolvedQuery {
  if (input === undefined || input === null || input === '') {
    return closeArkRunGraphQuery({});
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidArkRunGraphQueryError('slice', 'ArkRun graph query must be an object.');
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!QUERY_KEYS.has(key)) {
      throw new InvalidArkRunGraphQueryError(
        'slice',
        `ArkRun graph query key "${key}" is not closed.`
      );
    }
  }
  return {
    slice: closedSlice(record.slice),
    nodeIds: nameList(record.nodeIds, 'nodeIds'),
    degreesOfSeparation: closedDegrees(record.degreesOfSeparation),
    include: closedMatch(record.include, 'include'),
    exclude: closedMatch(record.exclude, 'exclude'),
  };
}

export function arkRunGraphQueryFromSearchParams(params: {
  slice?: string | null;
  nodeIds?: string | null;
  degreesOfSeparation?: string | null;
  include?: string | null;
  exclude?: string | null;
}): ArkRunGraphQuery {
  const query: ArkRunGraphQuery = {};
  if (params.slice) query.slice = closedSlice(params.slice);
  const nodeIds = nameList(params.nodeIds ?? undefined, 'nodeIds');
  if (nodeIds.length > 0) query.nodeIds = nodeIds;
  const degrees = closedDegrees(params.degreesOfSeparation ?? undefined);
  if (degrees !== null) query.degreesOfSeparation = degrees;
  const include = nameList(params.include ?? undefined, 'include');
  if (include.length > 0) query.include = include;
  const exclude = nameList(params.exclude ?? undefined, 'exclude');
  if (exclude.length > 0) query.exclude = exclude;
  return query;
}

function nodeFields(node: ArkRunGraphNode): string[] {
  const fields = [node.id];
  if (node.label) fields.push(node.label);
  if (node.group) fields.push(node.group);
  if (node.architectureKind) fields.push(node.architectureKind);
  if (node.tags) fields.push(...node.tags);
  return fields;
}

function nodeMatches(node: ArkRunGraphNode, match: ArkRunGraphMatch): boolean {
  if (!matchHasCriteria(match)) return true;
  const fields = nodeFields(node);
  if (match.tokens.some((token) => fields.some((field) => globMatch(field, token)))) {
    return true;
  }
  if (anyGlob(node.id, match.ids)) return true;
  if (anyGlob(node.label, match.labels)) return true;
  if (node.tags?.some((tag) => anyGlob(tag, match.tags))) return true;
  if (anyGlob(node.group, match.groups)) return true;
  return anyGlob(node.architectureKind, match.architectureKinds);
}

function asPackage(input: unknown): DependencyInformationPackage {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    return buildDependencyInformationPackage({
      kernelInstanceId: record.kernelInstanceId,
      components: record.components,
    });
  }
  return buildDependencyInformationPackage({});
}

function componentNode(component: ArkRunInformationPackageComponent): ArkRunGraphNode {
  const node: ArkRunGraphNode = {
    id: component.id,
    kind: 'component',
    lifetime: component.lifetime,
  };
  const info = component.extendedInfo;
  if (info?.label) node.label = info.label;
  if (info?.group) node.group = info.group;
  if (info?.architectureKind) node.architectureKind = info.architectureKind;
  if (info?.tags && info.tags.length > 0) node.tags = [...info.tags];
  return node;
}

function interactionNode(id: string): ArkRunGraphNode {
  return { id, kind: 'interaction' };
}

function addNode(nodes: Map<string, ArkRunGraphNode>, node: ArkRunGraphNode): void {
  const existing = nodes.get(node.id);
  if (!existing || (existing.kind === 'interaction' && node.kind === 'component')) {
    nodes.set(node.id, node);
  }
}

function addEdge(
  edges: ArkRunGraphEdge[],
  seen: Set<string>,
  from: string,
  to: string,
  kind: ArkRunGraphEdgeKind
): void {
  const key = `${from}\0${kind}\0${to}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ from, to, kind });
}

function buildSlice(
  components: readonly ArkRunInformationPackageComponent[],
  slice: ArkRunGraphSlice
): { nodes: Map<string, ArkRunGraphNode>; edges: ArkRunGraphEdge[] } {
  const nodes = new Map<string, ArkRunGraphNode>();
  const edges: ArkRunGraphEdge[] = [];
  const seen = new Set<string>();
  for (const component of components) {
    addNode(nodes, componentNode(component));
    if (slice === 'technical') {
      for (const target of component.uses) {
        addNode(nodes, nodes.get(target) ?? interactionNode(target));
        addEdge(edges, seen, component.id, target, 'uses');
      }
      continue;
    }
    for (const event of component.raises) {
      addNode(nodes, nodes.get(event) ?? interactionNode(event));
      addEdge(edges, seen, component.id, event, 'raises');
    }
    for (const event of component.reactsTo) {
      addNode(nodes, nodes.get(event) ?? interactionNode(event));
      addEdge(edges, seen, event, component.id, 'reactsTo');
    }
    for (const target of component.sends) {
      addNode(nodes, nodes.get(target) ?? interactionNode(target));
      addEdge(edges, seen, component.id, target, 'sends');
    }
  }
  return { nodes, edges };
}

function adjacency(edges: readonly ArkRunGraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const edge of edges) {
    push(edge.from, edge.to);
    push(edge.to, edge.from);
  }
  return map;
}

function neighborhood(
  available: ReadonlySet<string>,
  seeds: readonly string[],
  degrees: number | null,
  neighbors: ReadonlyMap<string, readonly string[]>
): Set<string> {
  const present = seeds.filter((id) => available.has(id));
  if (present.length === 0) return new Set();
  const keep = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = present.map((id) => ({
    id,
    depth: 0,
  }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || keep.has(next.id)) continue;
    keep.add(next.id);
    if (degrees !== null && next.depth >= degrees) continue;
    for (const neighbor of neighbors.get(next.id) ?? []) {
      if (!keep.has(neighbor) && available.has(neighbor)) {
        queue.push({ id: neighbor, depth: next.depth + 1 });
      }
    }
  }
  return keep;
}

function mermaidSafeId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(safe) ? safe : `n_${safe}`;
}

function mermaidLabel(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '#quot;').replace(/]/g, '#93;');
}

function uniqueMermaidIds(ids: readonly string[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const id of ids) {
    const base = mermaidSafeId(id);
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    used.add(candidate);
    map.set(id, candidate);
  }
  return map;
}

/**
 * Render a closed ArkRun graph as Mermaid flowchart text.
 * Process slices are left-to-right; technical slices are top-down.
 */
export function formatArkRunGraphMermaid(
  graph: Pick<ArkRunGraph, 'slice' | 'nodes' | 'edges'>
): string {
  const direction = graph.slice === 'technical' ? 'TD' : 'LR';
  const ids = graph.nodes.map((node) => node.id);
  const mermaidIds = uniqueMermaidIds(ids);
  const groups = uniqueSorted(
    graph.nodes.map((node) => node.group).filter((group): group is string => Boolean(group))
  );
  const lines = [`flowchart ${direction}`];
  const emitNode = (node: ArkRunGraphNode, indent: string) => {
    const id = mermaidIds.get(node.id) ?? mermaidSafeId(node.id);
    const label = mermaidLabel(node.label ?? node.id);
    lines.push(`${indent}${id}["${label}"]`);
  };
  for (const group of groups) {
    const groupId = mermaidSafeId(`group_${group}`);
    lines.push(`  subgraph ${groupId}["${mermaidLabel(group)}"]`);
    for (const node of graph.nodes) {
      if (node.group === group) emitNode(node, '    ');
    }
    lines.push('  end');
  }
  for (const node of graph.nodes) {
    if (!node.group) emitNode(node, '  ');
  }
  for (const edge of graph.edges) {
    const from = mermaidIds.get(edge.from) ?? mermaidSafeId(edge.from);
    const to = mermaidIds.get(edge.to) ?? mermaidSafeId(edge.to);
    lines.push(`  ${from} -->|${edge.kind}| ${to}`);
  }
  return lines.join('\n');
}

function filterGraph(
  nodes: Map<string, ArkRunGraphNode>,
  edges: readonly ArkRunGraphEdge[],
  query: ArkRunGraphResolvedQuery
): { nodes: ArkRunGraphNode[]; edges: ArkRunGraphEdge[] } {
  let keep = new Set(nodes.keys());
  if (matchHasCriteria(query.include)) {
    keep = new Set(
      [...keep].filter((id) => {
        const node = nodes.get(id);
        return node !== undefined && nodeMatches(node, query.include);
      })
    );
  }
  if (matchHasCriteria(query.exclude)) {
    for (const id of [...keep]) {
      const node = nodes.get(id);
      if (node && nodeMatches(node, query.exclude)) keep.delete(id);
    }
  }
  const remainingEdges = edges.filter(
    (edge) => keep.has(edge.from) && keep.has(edge.to)
  );
  if (query.nodeIds.length > 0) {
    keep = neighborhood(
      keep,
      query.nodeIds,
      query.degreesOfSeparation,
      adjacency(remainingEdges)
    );
  }
  const nodeList = [...keep]
    .sort(compare)
    .map((id) => nodes.get(id))
    .filter((node): node is ArkRunGraphNode => Boolean(node));
  const edgeList = remainingEdges
    .filter((edge) => keep.has(edge.from) && keep.has(edge.to))
    .sort(
      (left, right) =>
        compare(left.from, right.from) ||
        compare(left.kind, right.kind) ||
        compare(left.to, right.to)
    );
  return { nodes: nodeList, edges: edgeList };
}

/**
 * Slice the information package into a process or technical graph.
 * Optional nodeIds + degreesOfSeparation keep a neighborhood; include/exclude
 * are closed token or field queries. Never a score.
 */
export function requestArkRunGraph(
  pkgInput: unknown = {},
  queryInput: unknown = {}
): ArkRunGraph {
  const pkg = asPackage(pkgInput);
  const query = closeArkRunGraphQuery(queryInput);
  const built = buildSlice(pkg.components, query.slice);
  const sliced = filterGraph(built.nodes, built.edges, query);
  const graph: ArkRunGraph = {
    schemaVersion: ARK_RUN_GRAPH_SCHEMA_VERSION,
    kernelInstanceId: pkg.kernelInstanceId,
    slice: query.slice,
    query,
    nodes: sliced.nodes,
    edges: sliced.edges,
    mermaid: '',
  };
  graph.mermaid = formatArkRunGraphMermaid(graph);
  return graph;
}
