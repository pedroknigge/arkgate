export type Email = string & { readonly brand: 'Email' };

export function normalizeEmail(raw: string): Email {
  return raw.trim().toLowerCase() as Email;
}
