export type Team = { id: string; name: string };

export function teamLabel(team: Team): string {
  return team.name;
}
