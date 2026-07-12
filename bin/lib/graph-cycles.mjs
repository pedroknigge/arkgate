/** Compatibility adapter; canonical Tarjan evaluation lives in the bundled Kernel engine. */
import { detectArchitectureCycles } from './analysis-engine.mjs';

export function detectCycles(graph) {
  return detectArchitectureCycles(graph);
}
