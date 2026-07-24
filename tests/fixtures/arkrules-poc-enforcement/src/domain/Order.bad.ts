/** Bad aggregate — public mutable state + public ctor, no factory, no ensureInvariants */
export class Order {
  public total: number = 0;
  constructor(total: number) {
    this.total = total;
  }
  setTotal(n: number) {
    this.total = n;
  }
}
