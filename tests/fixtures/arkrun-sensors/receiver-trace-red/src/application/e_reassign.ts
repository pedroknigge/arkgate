import { ark } from '../main';

const kernel = ark;

export async function viaReassign(): Promise<void> {
  await kernel.send('Undeclared.ViaReassign', {});
}
