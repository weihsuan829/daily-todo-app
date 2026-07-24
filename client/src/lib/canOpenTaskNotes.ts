export function canOpenTaskNotes(task: { id: number; isRecurring?: boolean }): boolean {
  return task.id > 0 && !task.isRecurring;
}
