import type { Team } from '../domain/team.js';

export function listTeams(teams: Team[]) {
  return teams.map((t) => t.name);
}