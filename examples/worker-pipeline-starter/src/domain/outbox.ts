export type OutboxItem = { id: string; payload: string };

export interface OutboxStore {
  claim(limit: number): Promise<OutboxItem[]>;
  markDone(id: string): Promise<void>;
}