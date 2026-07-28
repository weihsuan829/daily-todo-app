// client/src/components/matrix/CompletedSection.tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { RotateCcw, Trash2 } from "lucide-react";
import { QUADRANT_MAP, type Quadrant } from "@/lib/quadrants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface CompletedTask {
  id: number;
  title: string;
  quadrant: string | null;
  dueDate: Date | null;
}

interface CompletedSectionProps {
  tasks: CompletedTask[];
  onRestore: (id: number) => void;
  onDelete: (task: CompletedTask) => void;
  isBusy?: boolean;
}

export function CompletedSection({ tasks, onRestore, onDelete, isBusy = false }: CompletedSectionProps) {
  const [pendingDelete, setPendingDelete] = useState<CompletedTask | null>(null);

  return (
    <Card className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        已完成{tasks.length > 0 ? `（${tasks.length}）` : ""}
      </h3>

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">尚無已完成任務</p>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => {
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
                <button
                  onClick={() => onRestore(task.id)}
                  disabled={isBusy}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="復原"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                </button>
                <button
                  onClick={() => setPendingDelete(task)}
                  disabled={isBusy}
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要永久刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.title}」將被永久刪除，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
