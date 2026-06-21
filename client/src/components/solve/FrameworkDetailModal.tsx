import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { trpc } from "@/lib/trpc";

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
        <DialogHeader><DialogTitle>{f.name} <span className="text-xs text-muted-foreground">({f.type})</span></DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{f.sourceBook}</p>
          <p><b>一句話：</b>{f.oneLiner}</p>
          <div><b>何時用：</b><pre className="whitespace-pre-wrap font-sans">{f.whenUse}</pre></div>
          <div><b>操作步驟：</b><pre className="whitespace-pre-wrap font-sans">{f.steps}</pre></div>
          <div><b>關鍵問題：</b><pre className="whitespace-pre-wrap font-sans">{f.keyQuestions}</pre></div>
          <div><b>產出：</b><pre className="whitespace-pre-wrap font-sans">{f.output}</pre></div>
          <div><b>範例：</b><pre className="whitespace-pre-wrap font-sans">{f.example}</pre></div>
          {f.diagram && <div><b>示意圖：</b><MermaidDiagram code={f.diagram} /></div>}
          <button
            className="px-3 py-1.5 rounded bg-destructive text-destructive-foreground text-sm disabled:opacity-50"
            disabled={del.isPending}
            onClick={() => { if (confirm("確定刪除這個框架?")) del.mutate({ id: f.id }); }}
          >
            {del.isPending ? "刪除中…" : "刪除"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
