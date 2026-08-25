/**
 * Preferred package entry for the **ArkRun** kernel (`@arkgate/runtime`).
 *
 * ```ts
 * import { createStrictArkKernel } from '@arkgate/runtime';
 *
 * const ark = createStrictArkKernel();
 * ```
 *
 * `createStrictArkKernel` is the factory: each call is a new isolated instance.
 * There is no process-wide singleton. Architecture gates (CLI / MCP / eslint) do
 * **not** require this entry. The stable `arkgate` tarball does not bundle this
 * experimental implementation.
 *
 * @packageDocumentation
 */

// Full public library surface (kernel + domain types + version).
// Dedicated export path so consumers can opt into runtime without implying
// that the product wedge is a runtime framework.
export * from '../index';
