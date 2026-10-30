import { readFlag } from '../../utils/env';
import { parseId } from '../../lib/parse';
import { readParam } from '../../utils/params';

export function preview() {
  return { id: parseId(readParam('p')), on: readFlag('preview') };
}
