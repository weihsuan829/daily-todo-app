import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { SolveResult } from "./SolveResult";

export function SolveTab() {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const analyze = trpc.solveProblems.analyze.useMutation({ onSuccess: () => utils.solveProblems.history.invalidate() });
  const { data: history = [] } = trpc.solveProblems.history.useQuery();
  const del = trpc.solveProblems.delete.useMutation({ onSuccess: () => utils.solveProblems.history.invalidate() });
  const r = analyze.data;
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
              if (text.trim()) analyze.mutate({ problemText: text.trim() });
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

      {r && <SolveResult result={r} />}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">歷史記錄</h3>
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="group flex items-center gap-2 p-3 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors">
              <span className="flex-1 truncate">{h.problemText}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                onClick={() => del.mutate({ id: h.id })}
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
