/** PresentationAdapters — UI entry; calls application use cases, never the database. */

import { addTodo } from '../application/add-todo.js';
import { listTodos } from '../application/list-todos.js';
import type { IdGenerator, TodoRepository } from '../application/todo-repository-port.js';

export async function renderTodoPage(
  repo: TodoRepository,
  ids: IdGenerator,
  newTitle?: string
): Promise<string> {
  if (newTitle) {
    await addTodo(repo, ids, newTitle);
  }
  const todos = await listTodos(repo);
  const lines = todos.map((todo) => `- [${todo.done ? 'x' : ' '}] ${todo.title}`);
  return ['Todos', ...lines].join('\n');
}