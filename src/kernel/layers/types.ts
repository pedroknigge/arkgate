/**
 * Architecture layer profiles.
 *
 * A profile turns semantic names such as `Domain.Order.Placed` into governed
 * layer names and dependency rules.
 */

export interface ArchitectureLayer {
  name: string;
  prefixes: string[];
  /**
   * Custom matcher for teams whose intent names don't follow prefix conventions.
   * Checked before any prefix matching, in layer declaration order. A layer may
   * use `match` alone (with `prefixes: []`), prefixes alone, or both.
   */
  match?: (name: string) => boolean;
  description?: string;
  order?: number;
}

export interface ArchitectureRule {
  from: string;
  to: string;
  allowed: boolean;
  message?: string;
}

export interface ArchitectureProfile {
  name: string;
  layers: ArchitectureLayer[];
  rules: ArchitectureRule[];
  resolveLayer(name: string): string | undefined;
}

export interface CreateArchitectureProfileOptions {
  name: string;
  layers: ArchitectureLayer[];
  rules?: ArchitectureRule[];
}

export interface CreateArchitectureProfileFromArkConfigOptions {
  /** Runtime profile name. Default: config.name or "ark.config.json". */
  name?: string;
}

export interface ArchitectureLayerConfig {
  name: string;
  patterns: string[];
  intentPrefixes?: string[];
  description?: string;
  forbiddenGlobals?: string[];
  mayImportInfrastructure?: boolean;
  /** Optional layers do not warn when their patterns match no files. */
  optional?: boolean;
}

export interface ArkCheckConfig {
  name?: string;
  include: string[];
  layers: ArchitectureLayerConfig[];
  rules?: ArchitectureRule[];
}

export interface CreateElevenLayerArkConfigOptions {
  /** Source root used in generated file patterns. Default: "src". */
  rootDir?: string;
  /** Include entries for ark-check. Default: [rootDir]. */
  include?: string[];
  /** Mark generated layers optional. Default: true. */
  optionalLayers?: boolean;
}
