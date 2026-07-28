# Matrix 按週分期 + 象限刪除確認

日期:2026-07-28
狀態:已與使用者確認設計
分支:`feature/matrix-week-scope`(**只在本地 git,不 push、不開 PR**——使用者明確指示)

## 背景

前一輪功能(Matrix 已完成歷史區 + 拖拉排序)的最終審查留下兩個產品決策,使用者決定兩個都做:

1. **Matrix 沒有按日期分期**:`getUserTasks(userId, category, date)` 接受 `date` 參數但**從未使用**——`conditions` 只有 `userId` + `category`(server/db.ts:100-106)。因此 Matrix 顯示使用者所有 eisenhower 任務,不分週別:已完成歷史區無限累積;跨日期拖拉排序會被伺服器的 `ORDER BY dueDate, order` 推回原本日期群組,使用者的拖拉被靜默丟棄。
2. **象限列的 X 刪除鍵沒有確認框**,而歷史區的刪除有——未完成任務比已完成任務更容易誤刪,風險梯度顛倒。

## 範圍決策(已確認)

- 週別過濾:**四象限與已完成區都按週**(切週時兩者同步)。
- 實作方式:**方案 A —— 修好後端的 date 週窗過濾**(有測試),而非前端過濾。
- 象限 X 刪除加確認框,文案與歷史區一致。

## 設計

### 1. 後端週窗過濾(server/db.ts)

`getUserTasks` 在 `date` 有值時追加條件:

```
dueDate >= date  AND  dueDate < date + 7 天
```

- `date` 為週起始日(前端傳入 `weekStartDate`,即該週週一 00:00)。
- 未傳 `date` 的呼叫端(Work/Life 的 `tasks.list`、Admin 等)行為完全不變——條件不追加。
- 虛擬循環任務生成邏輯不動;Matrix 本來就因 `recurring_tasks` 無 quadrant 欄位而不會顯示它們。
- `tasks.list` 的 zod input 已有 `date: z.date().optional()`,無需改動 router。

### 2. 前端

**零改動**。Matrix 的 query 已是 `trpc.tasks.list.useQuery({ category: "eisenhower", date: selectedDate })`,query key 含日期,切週即自動重抓;`activeTasks` / `completedTasks` 皆由該 query 導出,後端修好後兩區同時按週。新增任務的 `dueDate: selectedDate` 亦已正確。

### 3. 象限刪除確認(client/src/pages/EisenhowerMatrix.tsx)

- 頁面新增 `pendingDeleteTask` state 與一個 AlertDialog(與 CompletedSection 同款文案):
  - 標題「確定要永久刪除?」
  - 說明「「<任務名稱>」將被永久刪除,此操作無法復原。」
  - 取消 / 刪除(紅色)
- 象限列的 X 按鈕改為 `setPendingDeleteTask(task)`;確認後才 `deleteTaskMutation.mutate({ id, dueDate })`。
- 歷史區的確認流程不動(已在 CompletedSection 內部)。

### 4. 測試

- **後端(TDD)**:`server/weekScope.test.ts` 或既有 tasks 測試檔內新增——建立跨兩週的 eisenhower 任務,驗證帶 `date` 只回當週、不帶 `date` 回全部;Work/Life 呼叫不受影響。
- **E2E**(dev, port 4179):切上一週/下一週看任務與歷史區隨之變化;象限 X 出現確認框(取消保留、確認刪除);歷史區刪除確認仍正常。

## 不做的事(YAGNI)

- 不改 tasks.list router、不改前端 query。
- 不做「跨週搬移任務」功能。
- 不動 Work/Life 頁與專案頁的任何行為。
