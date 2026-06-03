# 全域配色改為 PMS 風 — 設計規格

日期:2026-06-03

## 目標

把 daily-todo-app 的亮色主題底色換成原本 Project_management_system(PMS)的配色感:純白頁面、淡灰欄底、白卡片配較明顯的灰邊框。使用者偏好 PMS 的層次感。

## 範圍與原則

- **只改 UI 顏色,不動任何功能。** 純 CSS 變數替換,不碰 TypeScript、邏輯、元件行為、資料。
- 範圍:**整個 app 全域統一**(改全域 token,專案 4 個 view + daily-todo 主畫面一起生效)。
- **維持不變**:重點色(accent/primary,維持灰階低彩)、文字色(foreground)、側邊欄維持淺色、整個 dark mode(PMS 僅亮色)。
- **不加卡片陰影**(本次明確排除)。

## 改動位置

唯一檔案:`client/src/index.css`,只改 `:root { ... }` 區塊內的下列 token。`.dark { ... }` 完全不動。

## Token 對應表

| Token | 現值 | 新值(PMS) | 用途 |
|---|---|---|---|
| `--background` | `oklch(0.97 0.003 0)` | `#ffffff` | 頁面/看板主區底 |
| `--card` | `oklch(0.98 0.002 0)` | `#ffffff` | 卡片底 |
| `--popover` | `oklch(0.98 0.002 0)` | `#ffffff` | 彈窗/下拉底 |
| `--secondary` | `oklch(0.94 0.005 0)` | `#f3f4f6` | 次要按鈕/標籤底(gray-100) |
| `--muted` | `oklch(0.91 0.008 0)` | `#f9fafb` | 看板欄底、淡灰表面(gray-50) |
| `--input` | `oklch(0.94 0.005 0)` | `#ffffff` | 輸入框底(白底+灰邊) |
| `--border` | `oklch(0.89 0.005 0)` | `#e5e7eb` | 邊框(gray-200,較明顯) |
| `--sidebar` | `oklch(0.98 0.002 0)` | `#ffffff` | 側邊欄底(維持淺色) |
| `--sidebar-accent` | `oklch(0.91 0.008 0)` | `#f3f4f6` | 側邊欄 hover/選取底 |
| `--sidebar-border` | `oklch(0.89 0.005 0)` | `#e5e7eb` | 側邊欄邊框 |

### 明確維持不變的 token
`--primary`、`--primary-foreground`、`--accent`、`--accent-foreground`、`--ring`、`--foreground`、`--card-foreground`、`--popover-foreground`、`--secondary-foreground`、`--muted-foreground`、`--destructive`、`--destructive-foreground`、`--sidebar-foreground`、`--sidebar-primary*`、`--sidebar-accent-foreground`、`--sidebar-ring`、`--chart-*`、`--radius`,以及整個 `.dark` 區塊。

## 預期效果

- 頁面與卡片皆為純白,卡片靠 gray-200 邊框與淡灰(gray-50)欄底分層 → 接近 PMS 的「白卡浮在淡灰欄上」觀感。
- daily-todo 主畫面同步變成白底+較明顯邊框。
- 重點/選取狀態仍是灰階(沿用現有 accent),不出現藍色。

## 風險與不在範圍

- 風險極低:僅改 10 個 CSS 變數,無邏輯改動。
- 不在範圍:卡片陰影、文字色加深、accent 換藍、深色側邊欄、dark mode 調整、任何元件 className 結構變更。

## 驗證方式(取代 TDD)

此為純 CSS token 替換,無可寫的單元測試。驗證以下列為準:
1. `pnpm check` 通過(確認沒有破壞建置/型別)。
2. 啟動 dev,用瀏覽器逐一檢視:清單 / 看板 / 行事曆 / 甘特圖 / daily-todo 主畫面,確認
   - 底色已變為 PMS 風(白底、灰欄、明顯邊框);
   - 沒有任何元件破版、文字看不清、或對比過低;
   - 功能(拖曳、篩選、開抽屜等)行為不變。
3. 不進行任何破壞性 / 資料庫操作;不在使用者真實專案上做測試。
