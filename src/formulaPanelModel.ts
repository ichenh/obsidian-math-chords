import { shortcutMatchesSearch } from "./shortcutPresentation";
import type { MathEnvironment, Shortcut } from "./types";

export interface FormulaPanelGroup {
  id: string;
  name: string;
  shortcuts: Shortcut[];
}

export function groupFormulaPanelShortcuts(
  shortcuts: Iterable<Shortcut>,
  ungroupedLabel: string,
  preferredOrder: string[] = [],
): FormulaPanelGroup[] {
  const grouped = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts) {
    const id = shortcut.group?.trim() || "";
    const entries = grouped.get(id) ?? [];
    entries.push(shortcut);
    grouped.set(id, entries);
  }
  return orderFormulaPanelGroups(
    [...grouped].map(([id, entries], sourceIndex) => ({
      id,
      name: id || ungroupedLabel,
      shortcuts: entries,
      sourceIndex,
    })),
    preferredOrder,
  ).map(({ id, name, shortcuts }) => ({ id, name, shortcuts }));
}

export function orderFormulaPanelGroups<T extends { id: string }>(
  groups: T[],
  preferredOrder: string[],
): T[] {
  const order = new Map(preferredOrder.map((id, index) => [id, index]));
  return groups
    .map((group, sourceIndex) => ({ group, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = order.get(left.group.id);
      const rightOrder = order.get(right.group.id);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ group }) => group);
}

export function countFormulaPanelMatches(
  groups: FormulaPanelGroup[],
  query: string,
): number {
  return groups.reduce(
    (total, group) =>
      total + group.shortcuts.filter((shortcut) => shortcutMatchesSearch(shortcut, query)).length,
    0,
  );
}

export function mathEnvironmentMatchesSearch(
  environment: MathEnvironment,
  groupName: string,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return [environment.name, environment.begin, environment.end, groupName]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function areAllFormulaPanelGroupsCollapsed(
  groupIds: string[],
  collapsedGroupIds: Iterable<string>,
): boolean {
  if (groupIds.length === 0) return false;
  const collapsed = new Set(collapsedGroupIds);
  return groupIds.every((groupId) => collapsed.has(groupId));
}

export function reorderFormulaPanelGroups<T extends string>(
  groupIds: T[],
  from: number,
  to: number,
): T[] {
  const reordered = [...groupIds];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= reordered.length ||
    to >= reordered.length
  ) {
    return reordered;
  }
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}
