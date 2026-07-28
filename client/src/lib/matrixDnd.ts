import { QUADRANT_MAP, type Quadrant } from "./quadrants";

export function splitByCompletion<T extends { completed: boolean }>(
  tasks: T[]
): { active: T[]; completed: T[] } {
  return {
    active: tasks.filter((t) => !t.completed),
    completed: tasks.filter((t) => t.completed),
  };
}

export function computeQuadrantReorder<T extends { id: number }>(
  quadrantTasks: T[],
  activeId: number,
  overId: number
): number[] | null {
  const oldIndex = quadrantTasks.findIndex((t) => t.id === activeId);
  const newIndex = quadrantTasks.findIndex((t) => t.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
  const ids = quadrantTasks.map((t) => t.id);
  ids.splice(oldIndex, 1);
  ids.splice(newIndex, 0, activeId);
  return ids;
}

export function quadrantDefaultPriority(quadrant: Quadrant): "high" | "medium" | "low" {
  return QUADRANT_MAP[quadrant].priority;
}

export function computeCrossQuadrantMove(
  activeId: number,
  targetQuadrant: Quadrant,
  targetTaskIds: number[],
  overId: number | null
): {
  update: { id: number; quadrant: Quadrant; priority: "high" | "medium" | "low" };
  orderedIds: number[];
} {
  const ids = targetTaskIds.filter((id) => id !== activeId);
  let insertAt = ids.length;
  if (overId !== null) {
    const overIndex = ids.indexOf(overId);
    if (overIndex !== -1) insertAt = overIndex;
  }
  ids.splice(insertAt, 0, activeId);
  return {
    update: { id: activeId, quadrant: targetQuadrant, priority: quadrantDefaultPriority(targetQuadrant) },
    orderedIds: ids,
  };
}
