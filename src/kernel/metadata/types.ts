/**
 * Metadata System (basic) for extensibility.
 *
 * Allows declaring entities, fields and simple rules/behaviors as data.
 * This can be used by tools, codegen, or AI to understand the domain without hardcoding.
 */

export interface FieldMeta {
  type: string;
  identity?: boolean;
  required?: boolean;
  description?: string;
  relation?: {
    entity: string;
    kind?: 'one' | 'many';
  };
  readonly?: boolean;
  deprecated?: boolean | string;
  tags?: string[];
  [key: string]: unknown;
}

interface EntityRuleMeta {
  name: string;
  description?: string;
  severity?: 'hard' | 'soft';
}

export interface EntityMeta {
  name: string;
  version?: string;
  owner?: string;
  layer?: string;
  tags?: string[];
  fields: Record<string, FieldMeta>;
  rules?: EntityRuleMeta[];
  /** Intent names this entity emits (domain events). */
  emits?: string[];
  /** Intent names this entity consumes / reacts to. */
  consumes?: string[];
  /** Read-model or projection names that derive from this entity. */
  projections?: string[];
  deprecated?: boolean | string;
  [key: string]: unknown;
}

export interface MetadataRegistrationOptions {
  allowOverwrite?: boolean;
}

export interface MetadataIssue {
  entity: string;
  field?: string;
  message: string;
}

export interface MetadataValidationResult {
  ok: boolean;
  issues: MetadataIssue[];
}

export interface MetadataRegistry {
  entity(
    name: string,
    meta: Omit<EntityMeta, 'name'>,
    options?: MetadataRegistrationOptions
  ): EntityMeta;
  getEntity(name: string): EntityMeta | undefined;
  listEntities(): EntityMeta[];
  findEntitiesByIntent(intentName: string): EntityMeta[];
  validate(): MetadataValidationResult;
  toJSON(): EntityMeta[];
}
