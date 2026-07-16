export function withMath(Math: { random(): number }): number {
  return Math.random();
}
