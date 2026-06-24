import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type PreviewResult = Awaited<
  ReturnType<ReturnType<typeof trpc.projectImport.preview.useMutation>["mutateAsync"]>
>;

// The router returns either { error, summary, rows } or ImportPreview (also summary+rows)
// We narrow to a successful preview by checking absence of a truthy error string
type SuccessPreview = Extract<PreviewResult, { summary: { create: number } }>;

export function ImportExcelDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [preview, setPreview] = useState<SuccessPreview | null>(null);
  const templateQuery = trpc.projectImport.template.useQuery(undefined, { enabled: false });
  const previewMut = trpc.projectImport.preview.useMutation();
  const commitMut = trpc.projectImport.commit.useMutation();

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setPreview(null);
  }

  async function downloadTemplate() {
    const res = await templateQuery.refetch();
    if (!res.data) return;
    const bytes = Uint8Array.from(atob(res.data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    const result = await previewMut.mutateAsync({ projectId, base64 });
    if ((result as { error?: string }).error) {
      toast.error((result as { error: string }).error);
      return;
    }
    setPreview(result as SuccessPreview);
  }

  async function confirmImport() {
    if (!preview) return;
    const res = await commitMut.mutateAsync({
      projectId,
      rows: preview.rows,
    });
    toast.success(`新增 ${res.created}、更新 ${res.updated}、略過 ${res.skipped}`);
    if (res.warnings.length) {
      toast.message(`提醒：${res.warnings.length} 筆`, {
        description: res.warnings.slice(0, 5).join("\n"),
      });
    }
    await utils.tasks.listByProject.invalidate({ projectId });
    handleClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[800px]">
        <DialogHeader>
          <DialogTitle>匯入 Excel 任務</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadTemplate} disabled={templateQuery.isFetching}>
            下載範本
          </Button>
          <input type="file" accept=".xlsx" onChange={onFile} />
        </div>

        {previewMut.isPending && (
          <p className="text-sm text-muted-foreground">解析中…</p>
        )}

        {preview && (
          <div className="mt-3">
            <p className="text-sm">
              新增 {preview.summary.create}、更新 {preview.summary.update}、錯誤{" "}
              {preview.summary.error}、提醒 {preview.summary.warning}
            </p>
            <div className="max-h-[320px] overflow-auto border rounded mt-2 text-sm">
              <table className="w-full">
                <thead>
                  <tr className="text-left bg-muted">
                    <th className="p-1">列</th>
                    <th className="p-1">動作</th>
                    <th className="p-1">任務</th>
                    <th className="p-1">訊息</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr
                      key={r.rowNum}
                      className={r.action === "error" ? "text-destructive" : ""}
                    >
                      <td className="p-1">{r.rowNum}</td>
                      <td className="p-1">
                        {r.action === "create"
                          ? "新增"
                          : r.action === "update"
                          ? "更新"
                          : "錯誤"}
                      </td>
                      <td className="p-1">{r.task.title || "(空)"}</td>
                      <td className="p-1">{r.messages.join("；")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            取消
          </Button>
          <Button
            onClick={confirmImport}
            disabled={
              !preview ||
              preview.summary.create + preview.summary.update === 0 ||
              commitMut.isPending
            }
          >
            確認匯入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
