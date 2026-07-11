export * from './types';
export {
  DEFAULT_MAX_HISTORY_SIZE,
  createStructrailKernel,
  createStructrailKernelFromConfig,
  createLenientStructrailKernel,
  createLenientStructrailKernelFromConfig,
  createStrictStructrailKernel,
  createStrictStructrailKernelFromConfig,
} from './createArkKernel';

/** @deprecated Use the Structrail-named runtime exports. Removal target: v4. */
export {
  createArkKernel,
  createArkKernelFromConfig,
  createLenientArkKernel,
  createLenientArkKernelFromConfig,
  createStrictArkKernel,
  createStrictArkKernelFromConfig,
} from './createArkKernel';
