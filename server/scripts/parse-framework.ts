import type { InsertFramework } from "../../drizzle/schema";

function metaValue(md: string, label: string): string | undefined {
  const re = new RegExp(`^- \\*\\*${label}\\*\\*[:：]\\s*(.+)$`, "m");
  return md.match(re)?.[1]?.trim();
}

function section(md: string, heading: string): string | undefined {
  // 抓 "## heading" 到下一個 "## " 或檔尾
  // 不用 "m" flag：$ 只能匹配整個字串結尾，不會在每行行尾截斷多行內容
  const re = new RegExp(`(?:^|\\n)##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
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
