import { describe, expect, it } from "vitest";
import { parseFramework } from "./parse-framework";

const SAMPLE = `# 議題樹

- **來源書**:《某書》第3章(p.10)
- **類型**:框架
- **一句話定義**:把大議題拆成子議題的樹狀圖。
- **適用問題類型**:龐大課題、結構化拆解

## 何時用 / 何時別用
- 適合:大課題
- 不適合:小問題

## 操作步驟
1. 第一步
2. 第二步

## 每步要問的關鍵問題
- 步驟一:問題?

## 產出 / 你會得到什麼
一棵樹

## 範例
某案例走一遍
`;

describe("parseFramework", () => {
  const f = parseFramework(SAMPLE, "issue-tree");
  it("extracts name and slug", () => {
    expect(f.name).toBe("議題樹");
    expect(f.slug).toBe("issue-tree");
  });
  it("extracts type", () => { expect(f.type).toBe("框架"); });
  it("extracts oneLiner", () => { expect(f.oneLiner).toContain("樹狀圖"); });
  it("extracts steps block (multi-line)", () => {
    expect(f.steps).toContain("第一步");
    expect(f.steps).toContain("第二步");
  });
  it("extracts example", () => { expect(f.example).toContain("某案例"); });
});
