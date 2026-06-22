import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { SolveResult } from "./SolveResult";
import { toast } from "sonner";

export function SolveTab() {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const analyze = trpc.solveProblems.analyze.useMutation({
    onSuccess: () => utils.solveProblems.history.invalidate(),
    onError: () => toast.error("解題失敗,請重試"),
  });
  const { data: history = [] } = trpc.solveProblems.history.useQuery();
  const del = trpc.solveProblems.delete.useMutation({
    onSuccess: (_data, variables) => {
      utils.solveProblems.history.invalidate();
      if (variables.id === selectedId) setSelectedId(null);
    },
    onError: () => toast.error("刪除失敗,請重試"),
  });
  const { data: selectedData } = trpc.solveProblems.get.useQuery(
    { id: selectedId! },
    { enabled: selectedId != null },
  );
  const r = analyze.data;

  const mappedSelected = selectedData?.solution
    ? {
        id: selectedData.solution.id,
        chosenFrameworks: (selectedData.solution.chosenFrameworks ?? "").split(",").filter(Boolean),
        reasoning: selectedData.solution.reasoning ?? "",
        analysis: selectedData.solution.analysis ?? "",
        diagram: selectedData.solution.diagram ?? "",
        diagramType: selectedData.solution.diagramType ?? undefined,
        nextSteps: (() => { try { return JSON.parse(selectedData.solution.nextSteps ?? "[]"); } catch { return []; } })(),
      }
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">描述你的問題</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) {
                setSelectedId(null);
                analyze.mutate({ problemText: text.trim() });
              }
            }}
            className="space-y-3"
          >
            <textarea
              className="w-full border border-border bg-input rounded-md px-3 py-2 min-h-[100px] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="描述你的工作問題，例如：團隊溝通不順、專案優先順序混亂…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" disabled={analyze.isPending || !text.trim()}>
              {analyze.isPending ? "分析中…" : "開始解題"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {analyze.error && (
        <p className="text-destructive text-sm px-1">{analyze.error.message}</p>
      )}

      {/* Show latest analyze result (with discussion thread when id is available) */}
      {r && !selectedId && (
        <SolveResult
          result={r}
          problemSolutionId={typeof r.id === "number" ? r.id : undefined}
        />
      )}

      {/* Show reopened history item */}
      {selectedId != null && mappedSelected && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="text-muted-foreground">
            ← 返回
          </Button>
          <SolveResult result={mappedSelected} problemSolutionId={selectedId} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">歷史記錄</h3>
        <ul className="space-y-2">
          {history.map((h) => (
            <li
              key={h.id}
              className="group flex items-center gap-2 p-3 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors cursor-pointer"
              onClick={() => {
                setSelectedId(h.id);
                analyze.reset();
              }}
            >
              <span className="flex-1 truncate">{h.problemText}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                onClick={(e) => { e.stopPropagation(); del.mutate({ id: h.id }); }}
                aria-label="刪除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
          {history.length === 0 && <p className="text-muted-foreground text-sm">尚無記錄。</p>}
        </ul>
      </div>
    </div>
  );
}
