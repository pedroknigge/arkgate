import { ark } from '../kernel';

export async function viaBarrel(): Promise<void> {
  await ark.send('Undeclared.ViaBarrel', {});
}
