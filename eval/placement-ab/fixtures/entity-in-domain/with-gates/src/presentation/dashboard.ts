import type { Team } from '../domain/team.js';
import { teamLabel } from '../domain/team.js';

export function renderDashboard(teams: Team[]) {
  return teams.map(teamLabel);
}
