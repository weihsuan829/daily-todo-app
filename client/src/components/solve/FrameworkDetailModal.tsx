import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Trash2 } from "lucide-react";

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{value}</pre>
    </div>
  );
}

export function FrameworkDetailModal({ id, open, onOpenChange }:
  { id: number | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: f } = trpc.frameworks.get.useQuery({ id: id! }, { enabled: open && id != null });
  const del = trpc.frameworks.delete.useMutation({ onSuccess: () => { utils.frameworks.list.invalidate(); onOpenChange(false); } });
  if (!f) return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent /></Dialog>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {f.name}
            <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{f.type}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {f.sourceBook && (
            <p className="text-xs text-muted-foreground border-b border-border pb-3">{f.sourceBook}</p>
          )}
          <Field label="一句話" value={f.oneLiner} />
          <Field label="何時用" value={f.whenUse} />
          <Field label="操作步驟" value={f.steps} />
          <Field label="關鍵問題" value={f.keyQuestions} />
          <Field label="產出" value={f.output} />
          <Field label="範例" value={f.example} />
          {f.diagram && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">示意圖</p>
              <MermaidDiagram code={f.diagram} />
            </div>
          )}
          <div className="pt-2 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              disabled={del.isPending}
              onClick={() => { if (confirm("確定刪除這個框架?")) del.mutate({ id: f.id }); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {del.isPending ? "刪除中…" : "刪除框架"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
