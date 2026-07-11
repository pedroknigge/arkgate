export { createStructrailTestHarness } from './ArkTestHarness';

/** @deprecated Use createStructrailTestHarness. Removal target: v4. */
export { createArkTestHarness } from './ArkTestHarness';

export type {
  StructrailTestHarness,
  StructrailTestSnapshot,
} from './types';

/** @deprecated Use the Structrail-named testing types. Removal target: v4. */
export type {
  ArkTestHarness,
  ArkTestSnapshot,
} from './types';
