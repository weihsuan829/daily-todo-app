import { describe, it, expect } from "vitest";
import { buildTemplate, parseWorkbook } from "./xlsx";
import { COLUMNS, HEADER_ORDER } from "./types";

describe("xlsx io", () => {
  it("buildTemplate produces a parseable workbook whose headers match HEADER_ORDER", async () => {
    const buf = await buildTemplate();
    expect(buf.length).toBeGreaterThan(0);
    const { rows, error } = await parseWorkbook(buf);
    expect(error).toBeUndefined();
    // template has 1 example row; its keys must include all headers
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const h of HEADER_ORDER) expect(Object.keys(rows[0])).toContain(h);
  });

  it("parseWorkbook maps rows by header text", async () => {
    // round-trip: build a workbook via exceljs in-test, then parse
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tasks");
    ws.addRow([COLUMNS.title, COLUMNS.priority]);
    ws.addRow(["買料", "高"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows } = await parseWorkbook(buf);
    expect(rows[0][COLUMNS.title]).toBe("買料");
    expect(rows[0][COLUMNS.priority]).toBe("高");
  });
});
