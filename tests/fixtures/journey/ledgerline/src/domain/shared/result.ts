export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; reason: string };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(reason: string): Err {
  return { ok: false, reason };
}
