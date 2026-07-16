export function withProcess(process: { cwd(): string }): string {
  return process.cwd();
}
