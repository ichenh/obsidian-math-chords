export function namespaceTikzSvgIds(root: Element, prefix: string): void {
  const ids = new Map<string, string>();
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[id]"))) {
    const id = element.id;
    if (!id) continue;
    const namespaced = `${prefix}${id}`;
    ids.set(id, namespaced);
    element.id = namespaced;
  }
  if (ids.size === 0) return;

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const rewritten = rewriteTikzSvgLocalReferences(attribute.value, ids);
      if (rewritten !== attribute.value) {
        element.setAttribute(attribute.name, rewritten);
      }
    }
  }
}

export function rewriteTikzSvgLocalReferences(
  value: string,
  ids: ReadonlyMap<string, string>,
): string {
  const direct = /^#([A-Za-z0-9_.:-]+)$/.exec(value.trim());
  if (direct) {
    const replacement = ids.get(direct[1]);
    return replacement ? `#${replacement}` : value;
  }
  return value.replace(
    /url\(\s*(["']?)#([A-Za-z0-9_.:-]+)\1\s*\)/gi,
    (reference, quote: string, id: string) => {
      const replacement = ids.get(id);
      return replacement
        ? `url(${quote}#${replacement}${quote})`
        : reference;
    },
  );
}
