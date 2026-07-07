/** PresentationAdapters — HTTP handlers call application use cases only. */

import { getUser } from '../application/get-user.js';
import type { UserRepository } from '../application/user-repository-port.js';

export type RouteRequest = { params: { id: string } };

export async function handleGetUser(repo: UserRepository, req: RouteRequest) {
  const body = await getUser(repo, req.params.id);
  if (!body) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body };
}