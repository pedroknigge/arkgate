export function withEnv(process: { env: Record<string, string | undefined> }): string | undefined {
  return process.env.NODE_ENV;
}
