import { teams } from '../adapters/db.js';

/** Misplaced: presentation loads persistence and owns entity shape. */
export function renderDashboard() {
  return teams.map((t) => t.name);
}
