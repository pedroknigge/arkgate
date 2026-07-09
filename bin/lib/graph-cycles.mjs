/**
 * Import-graph cycle detection (Tarjan) for ark-check.
 * Extracted from ark-check entry (R3).
 */
export function detectCycles(graph) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  // ponytail: recursive Tarjan; make it iterative only if a real repo blows the stack.
  const strongconnect = (v) => {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(graph.get(v) ?? [])].sort()) {
      if (!graph.has(w)) continue;
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) components.push(comp.sort());
    }
  };

  for (const v of [...graph.keys()].sort()) {
    if (!indices.has(v)) strongconnect(v);
  }

  return components
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((members) => ({
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: members[0],
      line: 1,
      target: members.join(' → '),
      message: `Circular dependency among ${members.length} files: ${members.join(' → ')} → ${members[0]}.`,
      // Graph is value/runtime edges only (type-only imports omitted).
      cycleKind: 'value',
    }));
}
