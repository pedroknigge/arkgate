const AmbientDate = globalThis.Date;
export function stamp(): number {
  return AmbientDate.now();
}
