export const store = new Map<string, string>();
export function put(k: string, v: string) {
  store.set(k, v);
}

