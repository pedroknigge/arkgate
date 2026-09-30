/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/schemaValidation.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/schema-validation.mjs). Zero Node I/O.
 */

export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function propertyPath(parent, key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
        ? `${parent}.${key}`
        : `${parent}[${JSON.stringify(key)}]`;
}
export function valueType(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
function resolveSchemaRef(ref, root) {
    const prefix = '#/$defs/';
    if (!ref.startsWith(prefix))
        return undefined;
    return root.$defs[ref.slice(prefix.length)];
}
/** Walk `value` against `schema`, appending every finding to `issues`. */
export function validateSchemaNode(value, schema, path, root, issues) {
    if (schema.$ref) {
        const referenced = resolveSchemaRef(schema.$ref, root);
        if (!referenced) {
            issues.push({ path, message: `schema reference ${schema.$ref} cannot be resolved` });
            return;
        }
        validateSchemaNode(value, referenced, path, root, issues);
        return;
    }
    if (schema.const !== undefined && !Object.is(value, schema.const)) {
        issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
        return;
    }
    if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
        issues.push({ path, message: `must be one of ${schema.enum.map(String).join(', ')}` });
        return;
    }
    if (schema.type === 'object') {
        if (!isObject(value)) {
            issues.push({ path, message: `must be an object; received ${valueType(value)}` });
            return;
        }
        const properties = schema.properties ?? {};
        for (const key of schema.required ?? []) {
            if (value[key] === undefined) {
                issues.push({ path: propertyPath(path, key), message: 'is required' });
            }
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    issues.push({ path: propertyPath(path, key), message: 'unknown field' });
                }
            }
        }
        else if (schema.additionalProperties !== undefined &&
            schema.additionalProperties !== true &&
            typeof schema.additionalProperties === 'object') {
            const additional = schema.additionalProperties;
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    validateSchemaNode(value[key], additional, propertyPath(path, key), root, issues);
                }
            }
        }
        for (const [key, childSchema] of Object.entries(properties)) {
            if (value[key] !== undefined) {
                validateSchemaNode(value[key], childSchema, propertyPath(path, key), root, issues);
            }
        }
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value)) {
            issues.push({ path, message: `must be an array; received ${valueType(value)}` });
            return;
        }
        if (schema.minItems !== undefined && value.length < schema.minItems) {
            issues.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
        }
        if (schema.uniqueItems) {
            const serialized = value.map((entry) => JSON.stringify(entry));
            if (new Set(serialized).size !== serialized.length) {
                issues.push({ path, message: 'must not contain duplicate items' });
            }
        }
        if (schema.items) {
            value.forEach((entry, index) => validateSchemaNode(entry, schema.items, `${path}[${index}]`, root, issues));
        }
        return;
    }
    if (schema.type === 'string') {
        if (typeof value !== 'string') {
            issues.push({ path, message: `must be a string; received ${valueType(value)}` });
            return;
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            issues.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
        }
        return;
    }
    if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') {
            issues.push({ path, message: `must be a boolean; received ${valueType(value)}` });
        }
        return;
    }
    if (schema.type === 'integer') {
        if (!Number.isInteger(value)) {
            issues.push({ path, message: `must be an integer; received ${valueType(value)}` });
            return;
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
            issues.push({ path, message: `must be at least ${schema.minimum}` });
        }
    }
}
