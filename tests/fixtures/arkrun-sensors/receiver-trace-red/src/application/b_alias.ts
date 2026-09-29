import { ark } from '@/main';

export async function viaPathAlias(): Promise<void> {
  await ark.send('Undeclared.ViaAlias', {});
}
