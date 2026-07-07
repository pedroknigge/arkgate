import type { Todo, TodoRepository } from '../domain/todo.js';

export function createRepo(seed: Todo[] = []): TodoRepository {
  return { async list() { return [...seed]; } };
}