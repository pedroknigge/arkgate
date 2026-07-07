/** DomainModel — business rules and ports. No database or UI imports here. */

export type TodoId = string;

export type Todo = {
  id: TodoId;
  title: string;
  done: boolean;
};

export interface IdGenerator {
  next(): TodoId;
}

export interface TodoRepository {
  list(): Promise<Todo[]>;
  save(todo: Todo): Promise<void>;
}

export function createTodo(title: string, ids: IdGenerator): Todo {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error('Todo title is required');
  }
  return { id: ids.next(), title: trimmed, done: false };
}