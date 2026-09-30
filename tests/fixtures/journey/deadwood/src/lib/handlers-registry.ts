const handlers = import.meta.glob('./handlers/*.ts');

export function loadHandler(name: string) {
  return handlers[`./handlers/${name}.ts`]?.();
}
