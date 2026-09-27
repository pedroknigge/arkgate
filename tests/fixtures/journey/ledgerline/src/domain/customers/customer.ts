import type { CustomerId } from '../shared/ids';
import { normalizeEmail, type Email } from './email';

export class Customer {
  private constructor(
    readonly id: CustomerId,
    private email: Email
  ) {}

  static register(id: CustomerId, rawEmail: string): Customer {
    return new Customer(id, normalizeEmail(rawEmail));
  }

  changeEmail(rawEmail: string): void {
    this.email = normalizeEmail(rawEmail);
  }

  address(): Email {
    return this.email;
  }
}
