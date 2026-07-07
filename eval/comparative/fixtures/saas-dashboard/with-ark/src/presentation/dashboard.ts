import { listTeams } from '../application/list-teams.js';
import type { Team } from '../application/team-view.js';

export function render(teams: Team[]) {
  return listTeams(teams).join(',');
}