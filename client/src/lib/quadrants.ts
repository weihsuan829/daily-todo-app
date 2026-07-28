export type Quadrant =
  | "urgent-important"
  | "not-urgent-important"
  | "urgent-not-important"
  | "not-urgent-not-important";

export interface QuadrantConfig {
  key: Quadrant;
  label: string;
  description: string;
  bgColor: string;
  borderColor: string;
  topBarColor: string;
  priority: "high" | "medium" | "low";
  dotClass: string;
}

export const QUADRANTS: QuadrantConfig[] = [
  {
    key: "urgent-important",
    label: "緊急且重要",
    description: "立即處理",
    bgColor: "bg-white",
    borderColor: "border-rose-200",
    topBarColor: "bg-rose-200",
    priority: "high",
    dotClass: "bg-rose-400",
  },
  {
    key: "not-urgent-important",
    label: "不緊急但重要",
    description: "計劃安排",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "medium",
    dotClass: "bg-slate-400",
  },
  {
    key: "urgent-not-important",
    label: "緊急但不重要",
    description: "委派處理",
    bgColor: "bg-white",
    borderColor: "border-blue-200",
    topBarColor: "bg-blue-300",
    priority: "medium",
    dotClass: "bg-blue-400",
  },
  {
    key: "not-urgent-not-important",
    label: "既不緊急也不重要",
    description: "消除浪費",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "low",
    dotClass: "bg-slate-300",
  },
];

export const QUADRANT_MAP = Object.fromEntries(
  QUADRANTS.map((q) => [q.key, q])
) as Record<Quadrant, QuadrantConfig>;
