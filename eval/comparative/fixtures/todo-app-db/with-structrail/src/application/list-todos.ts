import type { Todo, TodoRepository } from '../domain/todo.js';

export function listTodos(repo: TodoRepository): Promise<Todo[]> {
  return repo.list();
}