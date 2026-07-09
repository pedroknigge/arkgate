/**
 * Pure payload-patch merge for interceptors.
 * Interceptors may only fill missing keys/indices — never overwrite existing values.
 */
import type { EventPayloadPatch } from './types';

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function clonePatchValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePatchValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clonePatchValue(child)])
    );
  }
  return value;
}

export function mergeRecordPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  path = 'payload'
): Record<string, unknown> {
  const next = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    const childPath = `${path}.${key}`;
    if (!(key in next) || next[key] === undefined) {
      next[key] = clonePatchValue(value);
      continue;
    }

    if (isPlainRecord(next[key]) && isPlainRecord(value)) {
      next[key] = mergeRecordPatch(next[key] as Record<string, unknown>, value, childPath);
      continue;
    }

    if (Array.isArray(next[key]) && Array.isArray(value)) {
      next[key] = mergeArrayPatch(next[key] as unknown[], value, childPath);
      continue;
    }

    throw new Error(`Interceptor patch cannot overwrite existing ${childPath}.`);
  }

  return next;
}

export function mergeArrayPatch(
  target: unknown[],
  patch: unknown[],
  path = 'payload'
): unknown[] {
  const next = [...target];

  patch.forEach((value, index) => {
    const childPath = `${path}[${index}]`;
    if (index >= next.length || next[index] === undefined) {
      next[index] = clonePatchValue(value);
      return;
    }

    if (isPlainRecord(next[index]) && isPlainRecord(value)) {
      next[index] = mergeRecordPatch(next[index] as Record<string, unknown>, value, childPath);
      return;
    }

    if (Array.isArray(next[index]) && Array.isArray(value)) {
      next[index] = mergeArrayPatch(next[index] as unknown[], value, childPath);
      return;
    }

    throw new Error(`Interceptor patch cannot overwrite existing ${childPath}.`);
  });

  return next;
}

export function applyPayloadPatch(payload: unknown, patch: EventPayloadPatch): unknown {
  if (Array.isArray(patch)) {
    if (payload === undefined) return clonePatchValue(patch);
    if (!Array.isArray(payload)) {
      throw new Error('Array interceptor patch requires an array payload.');
    }
    return mergeArrayPatch(payload, patch);
  }

  if (payload === undefined) return clonePatchValue(patch);
  if (!isPlainRecord(payload)) {
    throw new Error('Object interceptor patch requires an object payload.');
  }
  return mergeRecordPatch(payload, patch);
}
