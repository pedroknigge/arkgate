export function newId(prefix: string, sequence: number): string {
  return `${prefix}-${sequence.toString(36)}`;
}
