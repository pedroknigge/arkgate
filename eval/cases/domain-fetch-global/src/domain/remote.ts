export async function loadRemote(url: string): Promise<string> {
  // Ambient fetch is forbidden in DomainModel.
  const res = await fetch(url);
  return res.text();
}

