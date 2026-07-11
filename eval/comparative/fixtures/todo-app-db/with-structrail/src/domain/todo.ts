export type Todo = { title: string };
export interface TodoRepository {
  list(): Promise<Todo[]>;
}