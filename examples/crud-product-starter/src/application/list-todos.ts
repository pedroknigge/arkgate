/** ApplicationOrchestration — coordinates domain through ports only. */

import type { Todo, TodoRepository } from '../domain/todo.js';

export type TodoView = { title: string; done: boolean };

export async function listTodos(repo: TodoRepository): Promise<TodoView[]> {
  const todos = await repo.list();
  return todos.map((todo) => ({ title: todo.title, done: todo.done }));
}