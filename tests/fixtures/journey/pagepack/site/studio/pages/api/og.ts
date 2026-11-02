import { fetchFont } from '../../utils/fetchFont';
import { readFlag } from '../../utils/env';

export function og() {
  return { font: fetchFont('mono'), on: readFlag('og') };
}
