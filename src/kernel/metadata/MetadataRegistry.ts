/**
 * Basic MetadataRegistry implementation.
 */

import type {
  EntityMeta,
  MetadataIssue,
  MetadataRegistry,
  MetadataRegistrationOptions,
  MetadataValidationResult,
} from './types';

class MetadataRegistryImpl implements MetadataRegistry {
  private entities = new Map<string, EntityMeta>();

  entity(
    name: string,
    meta: Omit<EntityMeta, 'name'>,
    options: MetadataRegistrationOptions = {}
  ): EntityMeta {
    if (this.entities.has(name) && !options.allowOverwrite) {
      throw new Error(`Entity metadata "${name}" is already registered.`);
    }
    const full: EntityMeta = { name, fields: {}, ...meta };
    this.entities.set(name, full);
    return full;
  }

  getEntity(name: string): EntityMeta | undefined {
    return this.entities.get(name);
  }

  listEntities(): EntityMeta[] {
    return Array.from(this.entities.values());
  }

  findEntitiesByIntent(intentName: string): EntityMeta[] {
    return this.listEntities().filter(
      (entity) =>
        entity.emits?.includes(intentName) || entity.consumes?.includes(intentName)
    );
  }

  validate(): MetadataValidationResult {
    const issues: MetadataIssue[] = [];

    for (const entity of this.entities.values()) {
      if (!entity.name.trim()) {
        issues.push({ entity: entity.name, message: 'Entity name is required.' });
      }

      for (const [fieldName, field] of Object.entries(entity.fields)) {
        if (!fieldName.trim()) {
          issues.push({ entity: entity.name, field: fieldName, message: 'Field name is required.' });
        }
        if (!field.type || typeof field.type !== 'string') {
          issues.push({
            entity: entity.name,
            field: fieldName,
            message: 'Field type must be a non-empty string.',
          });
        }
        if (field.relation && !this.entities.has(field.relation.entity)) {
          issues.push({
            entity: entity.name,
            field: fieldName,
            message: `Related entity "${field.relation.entity}" is not registered.`,
          });
        }
      }
    }

    return { ok: issues.length === 0, issues };
  }

  toJSON(): EntityMeta[] {
    return this.listEntities();
  }
}

export function createMetadataRegistry(): MetadataRegistry {
  return new MetadataRegistryImpl();
}
