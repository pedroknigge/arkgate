import type { Clock } from '../../application/ports/clock';

export class SystemClock implements Clock {
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
