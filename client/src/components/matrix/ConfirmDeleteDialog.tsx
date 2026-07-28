// client/src/components/matrix/ConfirmDeleteDialog.tsx
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

interface ConfirmDeleteDialogProps {
  taskTitle: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ taskTitle, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog
      open={taskTitle !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確定要永久刪除？</AlertDialogTitle>
          <AlertDialogDescription>
            「{taskTitle}」將被永久刪除，此操作無法復原。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={onConfirm}>
            刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
