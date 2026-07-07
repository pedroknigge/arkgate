/** ApplicationOrchestration — creates a todo through injected ports. */

import { createTodo, type IdGenerator, type Todo, type TodoRepository } from '../domain/todo.js';

export async function addTodo(
  repo: TodoRepository,
  ids: IdGenerator,
  title: string
): Promise<Todo> {
  const todo = createTodo(title, ids);
  await repo.save(todo);
  return todo;
}