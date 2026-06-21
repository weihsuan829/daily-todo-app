import { describe, expect, it } from "vitest";
import { analyzeProblem } from "./solve-service";

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
