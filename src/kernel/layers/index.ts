export * from './types';
export {
  createArchitectureProfile,
  createArchitectureProfileFromStructrailConfig,
  createElevenLayerStructrailConfig,
  elevenLayerProfile,
} from './ArchitectureProfile';

/** @deprecated Use the Structrail-named config exports. Removal target: v4. */
export {
  createArchitectureProfileFromArkConfig,
  createElevenLayerArkConfig,
} from './ArchitectureProfile';
