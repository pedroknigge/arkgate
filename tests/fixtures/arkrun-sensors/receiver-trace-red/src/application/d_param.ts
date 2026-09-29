// Untyped parameter: the trace cannot follow it, but the name is kernel-valid.
export async function viaParam(k: { send(name: string, payload: unknown): Promise<unknown> }) {
  await k.send('Application.Undeclared.ViaParam', {});
}
