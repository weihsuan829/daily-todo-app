import type { InsertFramework } from "../../drizzle/schema";

function metaValue(md: string, label: string): string | undefined {
  const re = new RegExp(`^- \\*\\*${label}\\*\\*[:：]\\s*(.+)$`, "m");
  return md.match(re)?.[1]?.trim();
}

function section(md: string, heading: string): string | undefined {
  // 抓 "## heading" 到下一個 "## " 或檔尾
  const re = new RegExp(`^##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "m");
  return md.match(re)?.[1]?.trim();
}

const VALID_TYPES = ["框架", "方法", "原則", "流程"] as const;

export function parseFramework(md: string, slug: string): InsertFramework {
  const name = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
  const rawType = metaValue(md, "類型") ?? "框架";
  const type = (VALID_TYPES as readonly string[]).includes(rawType)
    ? (rawType as InsertFramework["type"]) : "框架";
  return {
    slug,
    name,
    type,
    sourceBook: metaValue(md, "來源書"),
    oneLiner: metaValue(md, "一句話定義"),
    tags: metaValue(md, "適用問題類型"),
    whenUse: section(md, "何時用"),
    steps: section(md, "操作步驟"),
    keyQuestions: section(md, "每步要問的關鍵問題"),
    output: section(md, "產出"),
    example: section(md, "範例"),
  };
}
