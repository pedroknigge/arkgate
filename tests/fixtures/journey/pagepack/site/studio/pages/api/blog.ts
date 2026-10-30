import { fetchFont } from '../../utils/fetchFont';
import { readParam } from '../../utils/params';

export function blog() {
  return { font: fetchFont('serif'), id: readParam('a') };
}
