// client/src/components/matrix/CompletedSection.tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { RotateCcw, Trash2 } from "lucide-react";
import { QUADRANT_MAP, type Quadrant } from "@/lib/quadrants";
import { ConfirmDeleteDialog } from "@/components/matrix/ConfirmDeleteDialog";

export interface CompletedTask {
  id: number;
  title: string;
  quadrant: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
}

interface CompletedSectionProps {
  tasks: CompletedTask[];
  /** Week this section is scoped to, e.g. "07/27 - 08/02". The quadrants above
   *  are not week-scoped, so without this the week arrows look like a no-op. */
  weekLabel: string;
  onRestore: (id: number) => void;
  onDelete: (task: CompletedTask) => void;
  busyId?: number | null;
}

export function CompletedSection({ tasks, weekLabel, onRestore, onDelete, busyId = null }: CompletedSectionProps) {
  const [pendingDelete, setPendingDelete] = useState<CompletedTask | null>(null);

  const sorted = [...tasks].sort(
    (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
  );

  return (
    <Card className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        已完成{tasks.length > 0 ? `（${tasks.length}）` : ""}
        <span className="ml-2 text-xs font-normal text-gray-400">{weekLabel}</span>
      </h3>

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">尚無已完成任務</p>
      ) : (
        <div className="space-y-1">
          {sorted.map((task) => {
            const meta = task.quadrant ? QUADRANT_MAP[task.quadrant as Quadrant] : undefined;
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded p-2 text-xs group hover:bg-gray-50"
              >
                {meta && (
                  <span className="flex items-center gap-1 shrink-0 text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                    {meta.label}
                  </span>
                )}
                <span className="flex-1 line-through text-gray-400 truncate">{task.title}</span>
                {task.completedAt ? (
                  <span className="shrink-0 text-gray-300">
                    {new Date(task.completedAt).toLocaleDateString("zh-TW", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </span>
                ) : null}
                <button
                  onClick={() => onRestore(task.id)}
                  disabled={busyId === task.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="復原"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                </button>
                <button
                  onClick={() => setPendingDelete(task)}
                  disabled={busyId === task.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="刪除"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        taskTitle={pendingDelete?.title ?? null}
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </Card>
  );
}
