export class Order {
  private total: number;
  private constructor(total: number) {
    this.total = total;
    this.ensureInvariants();
  }
  static create(total: number): Order {
    return new Order(total);
  }
  ensureInvariants(): void {
    if (this.total < 0) throw new Error('INV-ORDER-TOTAL-NON-NEGATIVE');
  }
  applyDiscount(amount: number): void {
    this.total = this.total - amount;
    this.ensureInvariants();
  }
}
