# Eisenhower Matrix:已完成歷史區(可復原)+ 拖拉排序

日期:2026-07-25
狀態:已與使用者確認設計
分支:`feature/task-notes-modal-upgrade`(使用者選擇與筆記視窗功能同分支堆疊)

## 背景與需求

Matrix 頁([EisenhowerMatrix.tsx](../../../client/src/pages/EisenhowerMatrix.tsx))目前:

- 打勾完成的任務留在象限內劃線顯示,畫面混亂且容易誤刪。
- 任務無法排序(TaskList 頁有拖拉,Matrix 沒接)。

使用者需求:

1. 打勾完成 → 任務移到矩陣**下方共用的歷史保存區**;歷史區有**復原鍵**(防誤操作),也要能**刪除**(需確認)。
2. 任務可**上下拖拉排序**;拖到別的象限則**改變象限歸屬**。

## 範圍決策(已確認)

- 歷史區:整個矩陣下方一個共用區(非每象限一個)。
- 歷史區操作:復原 + 刪除(刪除需確認對話框)。
- 拖拉:同象限內排序 + 跨象限移動。
- 方案:純前端重組 + 沿用現有 API。後端近零改動:`tasks.update` 的 zod schema 需補上 `quadrant` 欄位(一行,現只有 `tasks.create` 收此欄位);db 層 `updateTask` 已是 Partial 傳遞,不用改。資料庫 schema 不動。

## 現有基礎(全部沿用)

- `tasks` 表已有 `completed`、`completedAt`、`order`、`quadrant` 欄位。
- API 現成:`tasks.update`(完成/復原/改象限)、`tasks.delete`、`tasks.reorderDay`(orderedIds → 依索引寫 order)。
- @dnd-kit 已安裝且 TaskList 頁在用(DndContext / SortableContext / arrayMove / PointerSensor)。
- 循環任務的虛擬列(負數 id)**不會出現在 Matrix**(recurring_tasks 無 quadrant 欄位,象限過濾直接排除),歷史區與拖拉毋須處理虛擬列。

## 設計

### 1. 已完成區(client/src/pages/EisenhowerMatrix.tsx + 新元件)

- 新元件 `client/src/components/matrix/CompletedSection.tsx`:四象限 grid 下方一張卡片「已完成(N)」。
- 內容:目前查詢結果中 `completed === true` 的任務;每筆顯示來源象限彩色標籤、劃線任務名稱、復原鍵(RotateCcw 圖示)、刪除鍵(Trash 圖示)。
- 象限清單改為只渲染 `completed === false` 的任務(打勾即「移下去」)。
- 復原:`tasks.update({ id, completed: false })` → 回到原象限(quadrant 欄位未動)。
- 刪除:AlertDialog 確認(「確定要永久刪除『<標題>』?此操作無法復原。」)後 `tasks.delete`。
- 空狀態:「尚無已完成任務」淡色文字。
- 歷史區任務不開筆記視窗、不可拖拉(先復原再操作)。

### 2. 拖拉排序(client/src/pages/EisenhowerMatrix.tsx)

- DndContext(PointerSensor,activationConstraint distance 8px——保留點擊開筆記視窗與 checkbox 行為)+ 每象限一個 SortableContext(verticalListSortingStrategy)+ 每象限一個 droppable 容器(空象限也能接收拖入)。
- 同象限:arrayMove 計算新順序 → 樂觀更新 `utils.tasks.list.setData` → `tasks.reorderDay({ orderedIds })`。
- 跨象限:`tasks.update({ id, quadrant: 目標象限, priority: 目標象限預設優先級 })`(與新增任務規則一致:urgent-important→high、not-urgent-important→medium、urgent-not-important→medium、not-urgent-not-important→low)+ 對目標象限(含插入位置)呼叫 `tasks.reorderDay`。
- DragOverlay 顯示拖拉中的任務列。
- 各象限獨立排序,order 值跨象限重複無妨(顯示時已按象限過濾)。

### 3. 純邏輯抽取(client/src/lib/matrixDnd.ts,TDD)

- `splitByCompletion(tasks)`:分成 active / completed 兩組。
- `computeQuadrantReorder(quadrantTasks, activeId, overId)`:回傳同象限新的 orderedIds(或 null 表示無變化)。
- `computeCrossQuadrantMove(activeTask, targetQuadrant, targetTasks, overId)`:回傳 `{ update: { id, quadrant, priority }, orderedIds }`。
- 象限→預設優先級對照表由現有 QUADRANTS 設定導出,單一來源。

### 4. 後端

僅一行:`server/routers.ts` 的 `tasks.update` input 增加
`quadrant: z.enum(["urgent-important", "not-urgent-important", "urgent-not-important", "not-urgent-not-important"]).optional()`(與 `tasks.create` 的定義一致)。資料庫 schema 與 db 層函式不變。

### 5. 錯誤處理

- 所有 mutation onError → toast 錯誤 + invalidate 還原樂觀更新。
- 刪除必須經 AlertDialog 確認,無一鍵永久刪除路徑。

### 6. 測試策略

- `client/src/lib/matrixDnd.test.ts`(vitest node,TDD):分組、同象限 reorder(含首尾/無變化)、跨象限 move payload(priority 對照、插入位置)。
- UI 行為(拖拉、復原、刪除確認)在 dev 環境(port 4179)實測 + Work/Life 頁回歸不受影響。

## 不做的事(YAGNI)

- 不做 archived 狀態/資料庫遷移。
- 不做歷史區分頁、搜尋、批次清除。
- 不動 TaskList(Work/Life)頁的完成顯示邏輯。
- 歷史區不提供筆記視窗入口。
