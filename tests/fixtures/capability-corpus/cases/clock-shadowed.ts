export function withClock(Date: { now(): number }): number {
  return Date.now();
}
