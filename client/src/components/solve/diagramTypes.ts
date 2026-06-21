export const DIAGRAM_TYPES = [
  { key: "flowchart", label: "流程圖" },
  { key: "mindmap", label: "心智圖" },
  { key: "quadrantChart", label: "四象限" },
  { key: "timeline", label: "時間軸" },
  { key: "sequenceDiagram", label: "循序圖" },
] as const;
export type DiagramTypeKey = (typeof DIAGRAM_TYPES)[number]["key"];
