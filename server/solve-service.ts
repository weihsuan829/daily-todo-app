export interface AnalyzeInput { problemText: string; frameworkSlugs?: string[]; }
export interface SolveDeps {
  listFrameworks: () => Promise<any[]>;
  getFrameworkBySlug: (slug: string) => Promise<any | null>;
  chat: (prompt: string, opts?: { model?: string; system?: string }) => Promise<string>;
}
export interface AnalyzeResult {
  chosenFrameworks: string[]; reasoning: string; analysis: string; diagram: string; diagramType: string;
}

function parseJSON(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : s;
  return JSON.parse(raw.trim());
}

export async function analyzeProblem(input: AnalyzeInput, deps: SolveDeps): Promise<AnalyzeResult> {
  let chosen = input.frameworkSlugs ?? [];
  let reasoning = "";

  if (chosen.length === 0) {
    const all = await deps.listFrameworks();
    const index = all.map((f) => `- ${f.slug} | ${f.type} | ${f.name} | 適用:${f.tags ?? ""}`).join("\n");
    const matchPrompt =
      `你是問題解決教練。以下是可用框架索引:\n${index}\n\n` +
      `使用者問題:「${input.problemText}」\n\n` +
      `挑出 1-3 個最適合的框架。只回 JSON:{"chosenFrameworks":["slug",...],"reasoning":"為什麼選這些"}`;
    const parsed = parseJSON(await deps.chat(matchPrompt));
    chosen = parsed.chosenFrameworks ?? [];
    reasoning = parsed.reasoning ?? "";
  }

  const details = (await Promise.all(chosen.map((s) => deps.getFrameworkBySlug(s))))
    .filter(Boolean)
    .map((f: any) => `### ${f.name}(${f.type})\n一句話:${f.oneLiner ?? ""}\n操作步驟:\n${f.steps ?? ""}`)
    .join("\n\n");

  const solvePrompt =
    `使用者問題:「${input.problemText}」\n\n選用框架:\n${details}\n\n` +
    `請依框架操作步驟逐步分析這個實際問題,並產出一張對應的圖(Mermaid 語法,依問題自選最合適的圖種:` +
    `flowchart/決策樹用 flowchart、心智圖用 mindmap、流程用 flowchart 等)。\n` +
    `只回 JSON:{"analysis":"逐步分析(markdown)","diagram":"完整 Mermaid 語法","diagramType":"flowchart|mindmap|..."}`;
  const solved = parseJSON(await deps.chat(solvePrompt));

  return {
    chosenFrameworks: chosen,
    reasoning,
    analysis: solved.analysis ?? "",
    diagram: solved.diagram ?? "",
    diagramType: solved.diagramType ?? "flowchart",
  };
}
