/**
 * Preferred package entry for the **optional** Structrail runtime kernel.
 *
 * ```ts
 * import { createStrictStructrailKernelFromConfig } from 'structrail/runtime';
 * ```
 *
 * Architecture gates (CLI / MCP / eslint) do **not** require this entry.
 * legacy-identity:start v3-compatibility removal=v4
 * The `arkgate` compatibility package still re-exports the same symbols for v3;
 * legacy-identity:end
 * prefer this subpath for new code. See `docs/package-surface.md`.
 *
 * @packageDocumentation
 */

// Full public library surface (kernel + domain types + version).
// Dedicated export path so consumers can opt into runtime without implying
// that the product wedge is a runtime framework.
export * from '../index';
