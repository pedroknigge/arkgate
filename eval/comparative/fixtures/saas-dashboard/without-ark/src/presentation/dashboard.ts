import type { Team } from '../domain/team.js';

export function render(teams: Team[]) {
  return teams.map((t) => t.name).join(',');
}