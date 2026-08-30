/**
 * Preferred package entry for the **ArkRun** kernel (`arkgate/runtime`).
 *
 * ```ts
 * import { createStrictArkKernel } from 'arkgate/runtime';
 *
 * const ark = createStrictArkKernel();
 * ```
 *
 * `createStrictArkKernel` is the factory: each call is a new isolated instance.
 * There is no process-wide singleton. Architecture gates (CLI / MCP / eslint) do
 * **not** require this entry. Opt-in extra of package `arkgate` (ADR 0031).
 * `@arkgate/runtime` is deprecated.
 *
 * @packageDocumentation
 */

// Full public library surface (kernel + domain types + version).
// Dedicated export path so consumers can opt into runtime without implying
// that the product wedge is a runtime framework.
export * from '../index';
