/** PersistenceAdapters — implements TodoRepository with in-memory storage. */

import type { Todo, TodoRepository } from '../domain/todo.js';

export function createInMemoryTodoRepository(seed: Todo[] = []): TodoRepository {
  const store = [...seed];
  return {
    async list() {
      return [...store];
    },
    async save(todo) {
      const index = store.findIndex((item) => item.id === todo.id);
      if (index >= 0) store[index] = todo;
      else store.push(todo);
    },
  };
}