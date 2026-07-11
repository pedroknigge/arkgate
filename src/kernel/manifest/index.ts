export * from './types';
export { MANIFEST_SCHEMA_VERSION } from './constants';
export {
  createStructrailManifest,
  type CreateStructrailManifestOptions,
} from './createArkManifest';

/** @deprecated Use the Structrail-named manifest exports. Removal target: v4. */
export {
  createArkManifest,
  type CreateArkManifestOptions,
} from './createArkManifest';
