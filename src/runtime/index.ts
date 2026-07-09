/**
 * Preferred package entry for the **optional** ArkGate runtime kernel.
 *
 * ```ts
 * import { createStrictArkKernelFromConfig } from 'arkgate/runtime';
 * ```
 *
 * Architecture gates (CLI / MCP / eslint) do **not** require this entry.
 * The root package `arkgate` still re-exports the same symbols for compatibility;
 * prefer this subpath for new code. See `docs/package-surface.md`.
 *
 * @packageDocumentation
 */

// Full public library surface (kernel + domain types + version).
// Dedicated export path so consumers can opt into runtime without implying
// that the product wedge is a runtime framework.
export * from '../index';
