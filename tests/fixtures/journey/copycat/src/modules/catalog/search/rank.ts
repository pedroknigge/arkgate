export type Scored = { id: string; title: string; score: number; updatedAt: number };

export function rankResults(items: readonly Scored[], query: string, limit: number): Scored[] {
  const needle = query.trim().toLowerCase();
  const boosted = items.map((item) => {
    const hit = item.title.toLowerCase().includes(needle) ? 2 : 1;
    return { ...item, score: item.score * hit };
  });
  boosted.sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);
  return boosted.slice(0, limit);
}
