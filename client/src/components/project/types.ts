import type { Task } from "../../../../drizzle/schema";
import type { FilterState } from "@/lib/filterSort";
import type { TagLike } from "./TagChips";

export interface ProjectViewProps {
  projectId: number;
  tasks: Task[];
  filterState?: FilterState;
  tagsById?: Record<number, TagLike>;
  tagIdsByTask?: Map<number, number[]>;
}
