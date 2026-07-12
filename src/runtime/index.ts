/**
 * Preferred package entry for the **optional** ArkGate runtime kernel.
 *
 * ```ts
 * import { createStrictArkKernelFromConfig } from '@arkgate/runtime';
 * ```
 *
 * Architecture gates (CLI / MCP / eslint) do **not** require this entry.
 * The stable `arkgate` package does not bundle this experimental implementation.
 *
 * @packageDocumentation
 */

// Full public library surface (kernel + domain types + version).
// Dedicated export path so consumers can opt into runtime without implying
// that the product wedge is a runtime framework.
export * from '../index';
