const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: string): { ok: boolean; reason?: string } {
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (value.length > 254) {
    return { ok: false, reason: 'too-long' };
  }
  if (!EMAIL_SHAPE.test(value)) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true };
}
