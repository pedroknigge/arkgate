export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}
