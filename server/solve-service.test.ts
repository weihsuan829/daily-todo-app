import { describe, expect, it } from "vitest";
import { analyzeProblem, discussProblem } from "./solve-service";

const fakeFrameworks = [
  { slug: "issue-tree", name: "議題樹", type: "框架", tags: "龐大課題,結構化拆解", steps: "1. 拆解", oneLiner: "拆成樹" },
];

function makeDeps(chatReturns: string[]) {
  let i = 0;
  return {
    listFrameworks: async () => fakeFrameworks as any,
    getFrameworkBySlug: async (s: string) => fakeFrameworks.find((f) => f.slug === s) as any,
    chat: async () => chatReturns[i++] ?? "",
  };
}

describe("analyzeProblem", () => {
  it("returns chosen frameworks and a diagram", async () => {
    const deps = makeDeps([
      JSON.stringify({ chosenFrameworks: ["issue-tree"], reasoning: "適合拆解" }),
      JSON.stringify({ analysis: "逐步分析…", diagram: "flowchart TD\n A-->B", diagramType: "flowchart" }),
    ]);
    const r = await analyzeProblem({ problemText: "我有個大問題" }, deps);
    expect(r.chosenFrameworks).toContain("issue-tree");
    expect(r.diagram).toContain("flowchart");
    expect(r.diagramType).toBe("flowchart");
  });

  it("respects pre-specified frameworkSlugs (skips matching)", async () => {
    const deps = makeDeps([
      JSON.stringify({ analysis: "x", diagram: "mindmap\n root", diagramType: "mindmap" }),
    ]);
    const r = await analyzeProblem({ problemText: "p", frameworkSlugs: ["issue-tree"] }, deps);
    expect(r.chosenFrameworks).toEqual(["issue-tree"]);
  });
});

describe("discussProblem", () => {
  it("passes context + history to chat and returns the reply", async () => {
    let seenPrompt = "";
    const deps = { chat: async (p: string) => { seenPrompt = p; return "我的建議是先做 A。"; } };
    const reply = await discussProblem({
      problemText: "交期一直delay",
      frameworksText: "5 Whys, 議題樹",
      analysis: "根因是保養不足",
      history: [{ role: "user", content: "那從哪開始?" }, { role: "assistant", content: "先看保養" }],
      message: "保養具體怎麼排?",
    }, deps);
    expect(reply).toContain("建議");
    expect(seenPrompt).toContain("交期一直delay");
    expect(seenPrompt).toContain("保養具體怎麼排?");
  });
});
