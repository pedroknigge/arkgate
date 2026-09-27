export function assertNoRawFileInput(markup: string): boolean {
  return !markup.includes('<input') || !markup.includes('file');
}

export function attachmentName(original: string): string {
  const base = original.split('/').pop() ?? original;
  return base.replace(/[^A-Za-z0-9._-]/g, '_');
}
