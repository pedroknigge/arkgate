/**
 * Transaction handle for feature A. The driver package stays in this adapter;
 * use cases import the type, not `postgres`.
 */
export type ATx = {
  (strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<unknown[]>;
};
