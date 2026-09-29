import { ark } from '../main';

export async function viaTypeof(bus: typeof ark): Promise<void> {
  await bus.send('Undeclared.ViaTypeof', {});
}
