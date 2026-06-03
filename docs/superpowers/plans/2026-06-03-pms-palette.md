# 全域配色改為 PMS 風 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `client/src/index.css` 的亮色 `:root` 10 個顏色 token 換成 PMS 配色,讓全 app 變成白底/淡灰欄/明顯灰邊框,功能完全不動。

**Architecture:** 純 CSS 變數替換。只改 `:root` 區塊的 10 個 token,`.dark` 與所有 TS/元件/邏輯不動。因全 app 共用同一組 shadcn token,改完即全域生效。

**Tech Stack:** Tailwind v4 + shadcn CSS variables(OKLch / hex 皆可),Vite。

對應規格:`docs/superpowers/specs/2026-06-03-pms-palette-design.md`

---

### Task 1: 替換 `:root` 顏色 token

**Files:**
- Modify: `client/src/index.css`(只動 `:root { ... }` 內,約第 57–78 行範圍的 10 個 token)

說明:此為純 CSS 視覺改動,無單元測試可寫;驗證以 `pnpm check` + 目視為準(見 Task 2)。

- [ ] **Step 1: 改 background / card / popover → 純白**

把 `:root` 內這三行改為:

```css
  --background: #ffffff;
  --card: #ffffff;
  --popover: #ffffff;
```

(對應原本 `--background: oklch(0.97 0.003 0);`、`--card: oklch(0.98 0.002 0);`、`--popover: oklch(0.98 0.002 0);`)

- [ ] **Step 2: 改 secondary / muted / input**

```css
  --secondary: #f3f4f6;
  --muted: #f9fafb;
  --input: #ffffff;
```

(對應原本 `--secondary: oklch(0.94 0.005 0);`、`--muted: oklch(0.91 0.008 0);`、`--input: oklch(0.94 0.005 0);`)

- [ ] **Step 3: 改 border 與 sidebar 三個 token**

```css
  --border: #e5e7eb;
  --sidebar: #ffffff;
  --sidebar-accent: #f3f4f6;
  --sidebar-border: #e5e7eb;
```

(對應原本 `--border: oklch(0.89 0.005 0);`、`--sidebar: oklch(0.98 0.002 0);`、`--sidebar-accent: oklch(0.91 0.008 0);`、`--sidebar-border: oklch(0.89 0.005 0);`)

**不可更動**(維持原值):`--primary`、`--accent`、`--ring`、`--foreground`、`--card-foreground`、`--popover-foreground`、`--secondary-foreground`、`--muted-foreground`、`--destructive`、`--sidebar-foreground`、`--sidebar-primary*`、`--sidebar-accent-foreground`、`--sidebar-ring`、`--chart-*`、`--radius`,以及整個 `.dark { ... }` 區塊。

- [ ] **Step 4: typecheck/建置驗證**

Run: `pnpm check`
Expected: 通過,無新錯誤(CSS 改動不應影響型別)。

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "style(ui): swap light-mode tokens to PMS palette (white/gray-50/gray-200)"
```

---

### Task 2: 目視驗證五個畫面

**Files:** 無(僅檢視)

- [ ] **Step 1: 啟動 dev 環境**

確認 Docker MySQL 與 dev server 已起、可透過 dev-login 進入。

- [ ] **Step 2: 逐一檢視並截圖**

用瀏覽器逐一開:daily-todo 主畫面、專案的 清單 / 看板 / 行事曆 / 甘特圖。逐一確認:

- 底色已變:頁面/卡片白、看板欄淡灰、邊框較明顯;
- 無破版、無文字看不清、無對比過低;
- 重點/選取狀態仍為灰階(不出現藍)。

- [ ] **Step 3: 確認功能未受影響**

抽查:看板拖曳、篩選 toolbar、開 task 抽屜、行事曆橫條——行為與改動前一致。

**全程不在使用者真實專案上做破壞性操作;必要時用臨時測試專案。**
