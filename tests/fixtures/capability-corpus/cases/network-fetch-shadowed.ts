export function withTransport(fetch: (url: string) => Promise<unknown>): Promise<unknown> {
  return fetch('https://example.invalid');
}
