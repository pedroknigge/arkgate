import { onlyTested } from '../src/lib/only-tested';

if (!onlyTested()) throw new Error('only-tested');
