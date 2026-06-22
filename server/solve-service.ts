export interface AnalyzeInput { problemText: string; frameworkSlugs?: string[]; }
export interface SolveDeps {
  listFrameworks: () => Promise<any[]>;
  getFrameworkBySlug: (slug: string) => Promise<any | null>;
  chat: (prompt: string, opts?: { model?: string; system?: string; json?: boolean }) => Promise<string>;
}
export interface AnalyzeResult {
  chosenFrameworks: string[]; reasoning: string; analysis: string; diagram: string; diagramType: string; nextSteps: string[];
}

function parseJSON(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : s;
  try {
    return JSON.parse(raw.trim());
  } catch {
    throw new Error("AI 回傳格式異常,請稍後重試");
  }
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
    const parsed = parseJSON(await deps.chat(matchPrompt, { json: true }));
    chosen = parsed.chosenFrameworks ?? [];
    reasoning = parsed.reasoning ?? "";
  }

  const details = (await Promise.all(chosen.map((s) => deps.getFrameworkBySlug(s))))
    .filter(Boolean)
    .map((f: any) => `### ${f.name}(${f.type})\n一句話:${f.oneLiner ?? ""}\n操作步驟:\n${f.steps ?? ""}`)
    .join("\n\n");

  const solvePrompt =
    `使用者問題:「${input.problemText}」\n\n選用框架:\n${details}\n\n` +
    `請依框架操作步驟逐步分析這個實際問題,並產出一張對應的圖(Mermaid 語法,依問題自選最合適的圖種:\n` +
    `flowchart(流程/決策樹/因果)、mindmap(發散整理)、quadrantChart(SWOT/2x2 四象限)、timeline(有時序)、sequenceDiagram(角色互動)。diagramType 填所選關鍵字)。\n` +
    `只回 JSON:{"analysis":"逐步分析(markdown)","diagram":"完整 Mermaid 語法","diagramType":"flowchart|mindmap|...","nextSteps":["3-5 個具體、可執行、動詞開頭的下一步"]}`;
  const solved = parseJSON(await deps.chat(solvePrompt, { json: true }));

  return {
    chosenFrameworks: chosen,
    reasoning,
    analysis: solved.analysis ?? "",
    diagram: solved.diagram ?? "",
    diagramType: solved.diagramType ?? "flowchart",
    nextSteps: Array.isArray(solved.nextSteps) ? solved.nextSteps : [],
  };
}

export interface DiscussInput {
  problemText: string;
  frameworksText: string;
  analysis: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}
export interface DiscussDeps {
  chat: (prompt: string, opts?: { model?: string; system?: string; json?: boolean }) => Promise<string>;
}

const DIAGRAM_HINTS: Record<string, string> = {
  flowchart: "flowchart TD(流程圖/決策樹,節點用 A[文字],箭頭 -->)",
  mindmap: "mindmap(心智圖,根 root((中心)),縮排表階層)",
  quadrantChart: "quadrantChart(四象限,需 x-axis/y-axis 與各象限標題,適合 SWOT/2x2)",
  timeline: "timeline(時間軸,title 後每列 '時期 : 事件')",
  sequenceDiagram: "sequenceDiagram(循序圖,participant 與 A->>B: 訊息)",
};

export interface RegenDiagramInput { problemText: string; frameworksText: string; analysis: string; diagramType: string; }
export interface RegenDiagramDeps { chat: (prompt: string, opts?: { model?: string; system?: string; json?: boolean }) => Promise<string>; }

export async function regenerateDiagram(input: RegenDiagramInput, deps: RegenDiagramDeps): Promise<{ diagram: string; diagramType: string }> {
  const hint = DIAGRAM_HINTS[input.diagramType] ?? input.diagramType;
  const prompt =
    `根據以下問題與分析,只產出一張「${input.diagramType}」類型的 Mermaid 圖。\n` +
    `【問題】${input.problemText}\n【框架】${input.frameworksText}\n【分析】\n${input.analysis}\n\n` +
    `圖種語法提示:${hint}\n` +
    `只回 JSON:{"diagram":"完整 Mermaid 語法(第一行為圖種關鍵字)","diagramType":"${input.diagramType}"}`;
  const parsed = parseJSON(await deps.chat(prompt, { json: true }));
  return { diagram: parsed.diagram ?? "", diagramType: parsed.diagramType ?? input.diagramType };
}

export async function discussProblem(input: DiscussInput, deps: DiscussDeps): Promise<string> {
  const historyText = input.history.map((m) => `${m.role === "user" ? "使用者" : "AI"}:${m.content}`).join("\n");
  const prompt =
    `你是問題解決顧問,正在針對某個問題與使用者深入討論。\n\n` +
    `【原問題】${input.problemText}\n` +
    `【選用框架】${input.frameworksText}\n` +
    `【先前的分析】\n${input.analysis}\n\n` +
    (historyText ? `【先前對話】\n${historyText}\n\n` : "") +
    `【使用者新訊息】${input.message}\n\n` +
    `請延續上下文,給出具體、可行動的回應(繁體中文)。`;
  return deps.chat(prompt);
}
