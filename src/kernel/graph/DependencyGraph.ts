/**
 * DependencyGraph implementation.
 *
 * Collects declared and observed relationships.
 * Generates Mermaid diagrams and JSON.
 * Supports simple violation detection via rule functions.
 */

import type {
  DependencyGraph,
  GraphEdge,
  GraphNode,
} from './types';
import type { ArchitectureProfile } from '../layers';

class DependencyGraphImpl implements DependencyGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];

  registerDependency(
    from: string,
    to: string,
    kind: GraphEdge['kind'] = 'declared'
  ): void {
    this.ensureNode(from);
    this.ensureNode(to);
    this.addEdge({ from, to, kind });
  }

  registerEventFlow(producer: string, consumer: string): void {
    this.ensureNode(producer);
    this.ensureNode(consumer);
    this.addEdge({ from: producer, to: consumer, kind: 'observed' });
  }

  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): GraphEdge[] {
    return [...this.edges];
  }

  toJSON() {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  toMermaid(): string {
    let out = 'flowchart TD\n';
    for (const edge of this.edges) {
      // Valid Mermaid labeled edge syntax: A -->|label| B   (no spaces around |label|)
      const label = edge.kind ? `|${edge.kind}|` : '';
      out += `  ${this.safeId(edge.from)} -->${label} ${this.safeId(edge.to)}\n`;
    }
    // Also list isolated nodes if any
    const connected = new Set(
      this.edges.flatMap((e) => [e.from, e.to])
    );
    for (const node of this.nodes.keys()) {
      if (!connected.has(node)) {
        out += `  ${this.safeId(node)}\n`;
      }
    }
    return out.trim();
  }

  toLayerMermaid(profile: ArchitectureProfile): string {
    const nodesByLayer = new Map<string, string[]>();

    for (const node of this.nodes.keys()) {
      const layer = profile.resolveLayer(node) ?? 'Unclassified';
      const current = nodesByLayer.get(layer) ?? [];
      current.push(node);
      nodesByLayer.set(layer, current);
    }

    let out = 'flowchart TD\n';
    for (const layer of profile.layers) {
      const nodes = nodesByLayer.get(layer.name) ?? [];
      if (nodes.length === 0) continue;
      out += `  subgraph ${this.safeId(layer.name)}[${layer.name}]\n`;
      for (const node of nodes) {
        out += `    ${this.safeId(node)}[${node}]\n`;
      }
      out += '  end\n';
    }

    const unclassified = nodesByLayer.get('Unclassified') ?? [];
    if (unclassified.length > 0) {
      out += '  subgraph Unclassified[Unclassified]\n';
      for (const node of unclassified) {
        out += `    ${this.safeId(node)}[${node}]\n`;
      }
      out += '  end\n';
    }

    for (const edge of this.edges) {
      const label = edge.kind ? `|${edge.kind}|` : '';
      out += `  ${this.safeId(edge.from)} -->${label} ${this.safeId(edge.to)}\n`;
    }

    return out.trim();
  }

  detectViolations(
    rules: Array<(edges: GraphEdge[]) => string[]> = []
  ): string[] {
    const violations: string[] = [];

    // default simple rule: no cycles (basic)
    const cycles = this.findSimpleCycles();
    if (cycles.length > 0) {
      violations.push(`Cycle detected: ${cycles.map((c) => c.join('->')).join(', ')}`);
    }

    // user provided rules
    for (const rule of rules) {
      try {
        const res = rule(this.edges);
        if (res && res.length) violations.push(...res);
      } catch (e) {
        violations.push(`Rule error: ${(e as Error).message}`);
      }
    }

    return violations;
  }

  private ensureNode(id: string) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id });
    }
  }

  private addEdge(edge: GraphEdge) {
    // Avoid exact duplicates
    const exists = this.edges.some(
      (e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind
    );
    if (!exists) {
      this.edges.push(edge);
    }
  }

  // Very naive cycle detection for small graphs
  private findSimpleCycles(): string[][] {
    const graph = new Map<string, string[]>();
    for (const e of this.edges) {
      if (!graph.has(e.from)) graph.set(e.from, []);
      graph.get(e.from)!.push(e.to);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      stack.push(node);

      for (const nei of graph.get(node) || []) {
        if (!visited.has(nei)) {
          dfs(nei);
        } else if (stack.includes(nei)) {
          const cycleStart = stack.indexOf(nei);
          const cycle = stack.slice(cycleStart).concat(nei);
          cycles.push(cycle);
        }
      }

      stack.pop();
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) dfs(node);
    }

    // Dedup cycles (naive)
    const unique = new Set(cycles.map((c) => c.join('->')));
    return Array.from(unique).map((s) => s.split('->'));
  }

  private safeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}

export function createDependencyGraph(): DependencyGraph {
  return new DependencyGraphImpl();
}
