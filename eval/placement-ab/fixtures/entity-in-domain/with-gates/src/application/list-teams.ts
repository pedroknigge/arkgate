import type { Team } from '../domain/team.js';

export type TeamSource = { list(): Promise<Team[]> };

export function listTeams(source: TeamSource): Promise<Team[]> {
  return source.list();
}
