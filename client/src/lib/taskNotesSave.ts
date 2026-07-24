export interface TaskNotesTarget {
  id: number;
  title: string;
  category: string | null;
}

export interface TaskNotesFormInput {
  title: string;
  notes: string;
  priority: string;
}

export interface TaskNotesUpdate {
  id: number;
  description: string;
  title?: string;
  priority?: "low" | "medium" | "high";
}

export function buildTaskNotesUpdate(
  task: TaskNotesTarget,
  form: TaskNotesFormInput
): TaskNotesUpdate | null {
  const trimmed = form.title.trim().slice(0, 255);
  if (!trimmed) return null;

  const update: TaskNotesUpdate = { id: task.id, description: form.notes };
  if (trimmed !== task.title) update.title = trimmed;
  if (task.category !== "eisenhower") {
    update.priority = form.priority as TaskNotesUpdate["priority"];
  }
  return update;
}
