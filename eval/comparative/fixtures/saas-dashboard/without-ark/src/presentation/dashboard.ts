import { teamName } from '../domain/team.js';

export function render(teams: { id: string; name: string }[]) {
  return teams.map(teamName).join(',');
}
