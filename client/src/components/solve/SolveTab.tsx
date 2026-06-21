import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { MermaidDiagram } from "@/components/MermaidDiagram";

export function SolveTab() {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const analyze = trpc.solveProblems.analyze.useMutation({ onSuccess: () => utils.solveProblems.history.invalidate() });
  const { data: history = [] } = trpc.solveProblems.history.useQuery();
  const del = trpc.solveProblems.delete.useMutation({ onSuccess: () => utils.solveProblems.history.invalidate() });
  const r = analyze.data;
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) analyze.mutate({ problemText: text.trim() }); }}>
        <textarea className="w-full border border-border bg-input rounded px-3 py-2 min-h-[90px]"
          placeholder="描述你的工作問題…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="mt-2 px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
          disabled={analyze.isPending}>{analyze.isPending ? "分析中…" : "開始解題"}</button>
      </form>
      {analyze.error && <p className="text-destructive text-sm">{analyze.error.message}</p>}
      {r && (
        <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
          <div className="text-sm"><b>選用框架:</b>{r.chosenFrameworks.join("、")}</div>
          {r.reasoning && <div className="text-sm text-muted-foreground"><b>為什麼:</b>{r.reasoning}</div>}
          <div className="text-sm"><b>分析:</b><pre className="whitespace-pre-wrap font-sans">{r.analysis}</pre></div>
          {r.diagram && <MermaidDiagram code={r.diagram} />}
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">歷史</h3>
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="p-3 rounded border border-border bg-card text-sm flex justify-between gap-2">
              <span className="truncate">{h.problemText}</span>
              <button className="text-destructive text-xs" onClick={() => del.mutate({ id: h.id })}>刪除</button>
            </li>
          ))}
          {history.length === 0 && <p className="text-muted-foreground text-sm">尚無記錄。</p>}
        </ul>
      </div>
    </div>
  );
}
