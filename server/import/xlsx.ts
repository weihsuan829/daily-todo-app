import ExcelJS from "exceljs";
import { COLUMNS, HEADER_ORDER, type RawRow } from "./types";

const MAX_ROWS = 2000;

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tasks");
  ws.addRow(HEADER_ORDER);
  ws.getRow(1).font = { bold: true };
  // example row
  ws.addRow([
    "範例:採購10台server的料", "需求單已開,等供應商報價",
    "高", "進行中", "2026/6/30", "2026/7/15", "阿明", "購料,急件", "",
  ]);
  ws.columns.forEach((c) => (c.width = 18));

  const help = wb.addWorksheet("說明");
  const lines: string[][] = [
    ["欄位", "必填", "接受值"],
    [COLUMNS.title, "是", "任意文字"],
    [COLUMNS.description, "否", "任意文字"],
    [COLUMNS.priority, "否", "低 / 中 / 高 / 緊急(或 low/medium/high/urgent);空白=中"],
    [COLUMNS.status, "否", "待辦 / 進行中 / 完成 / 封存(或 todo/in_progress/done/archived);空白=待辦"],
    [COLUMNS.startDate, "否", "2026/6/30 或 2026-06-30"],
    [COLUMNS.dueDate, "否", "同開始日"],
    [COLUMNS.assignee, "否", "人名;不存在自動建立掛名成員"],
    [COLUMNS.tags, "否", "逗號分隔,如 購料,急件;不存在自動建立"],
    [COLUMNS.parent, "否", "填同表/同專案另一任務名稱 → 設為其子任務"],
  ];
  lines.forEach((l) => help.addRow(l));
  help.getRow(1).font = { bold: true };
  help.columns.forEach((c) => (c.width = 30));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function parseWorkbook(buf: Buffer): Promise<{ rows: RawRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
  } catch {
    return { rows: [], error: "無法讀取檔案,請確認是有效的 .xlsx" };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], error: "找不到工作表" };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: RawRow = {};
    let hasAny = false;
    headerRow.eachCell({ includeEmpty: true }, (_c, col) => {
      const key = headers[col];
      if (!key) return;
      let v = row.getCell(col).value as unknown;
      // exceljs may return { text } for rich text / hyperlinks
      if (v && typeof v === "object" && !(v instanceof Date) && "text" in (v as Record<string, unknown>)) {
        v = (v as Record<string, unknown>).text;
      }
      if (v != null && String(v).trim() !== "") hasAny = true;
      obj[key] = (v as RawRow[string]) ?? null;
    });
    if (hasAny) rows.push(obj);
    if (rows.length > MAX_ROWS) return { rows: [], error: `列數超過上限 ${MAX_ROWS}` };
  }
  return { rows };
}
