import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, BarChart3, Calendar as CalendarIcon, Columns3, List } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ProjectListView from "@/components/project/ProjectListView";
import ProjectKanbanView from "@/components/project/ProjectKanbanView";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import ProjectGanttView from "@/components/project/ProjectGanttView";
import TaskDetailDrawer from "@/components/project/TaskDetailDrawer";
import { ProjectToolbar } from "@/components/project/ProjectToolbar";
import type { TagLike } from "@/components/project/TagChips";
import {
  DEFAULT_FILTER_STATE,
  applyFilterSort,
  type FilterState,
  type FilterSortCtx,
} from "@/lib/filterSort";

type ViewMode = "list" | "kanban" | "calendar" | "gantt";
const VIEW_META: Record<ViewMode, { label: string; Icon: typeof List }> = {
  list: { label: "清單", Icon: List },
  kanban: { label: "看板", Icon: Columns3 },
  calendar: { label: "行事曆", Icon: CalendarIcon },
  gantt: { label: "甘特圖", Icon: BarChart3 },
};

export default function ProjectView() {
  const [, params] = useRoute("/projects/:id");
  const projectId = Number(params?.id);
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("projectView") as ViewMode) || "list");
  useEffect(() => { localStorage.setItem("projectView", view); }, [view]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const project = projects.find((p) => p.id === projectId);
  const { data: tasks = [], isLoading } = trpc.tasks.listByProject.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });

  // ─── Filter state (persisted per project) ────────────────────────────────────
  const filterStorageKey = `projectFilter_${projectId}`;
  const [filterState, setFilterState] = useState<FilterState>(() => {
    try {
      const raw = localStorage.getItem(filterStorageKey);
      if (!raw) return DEFAULT_FILTER_STATE;
      const parsed = JSON.parse(raw) as Partial<FilterState>;
      return {
        ...DEFAULT_FILTER_STATE,
        ...parsed,
        assigneeQuick: parsed.assigneeQuick ?? "all",
      };
    } catch {
      return DEFAULT_FILTER_STATE;
    }
  });

  const handleFilterChange = (next: FilterState) => {
    setFilterState(next);
    try {
      localStorage.setItem(filterStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // ─── Current user (for "Only me" filter) ─────────────────────────────────────
  const { data: me } = trpc.auth.me.useQuery();
  const currentUserId = me?.id ?? null;

  // ─── Tags ─────────────────────────────────────────────────────────────────────
  const { data: allTags = [] } = trpc.tags.list.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });
  const { data: taskTagRows = [] } = trpc.tags.taskMap.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });

  const tagsById = useMemo<Record<number, TagLike>>(() => {
    const m: Record<number, TagLike> = {};
    for (const t of allTags) m[t.id] = t;
    return m;
  }, [allTags]);

  const tagIdsByTask = useMemo<Map<number, number[]>>(() => {
    const m = new Map<number, number[]>();
    for (const { taskId, tagId } of taskTagRows) {
      const arr = m.get(taskId) ?? [];
      arr.push(tagId);
      m.set(taskId, arr);
    }
    return m;
  }, [taskTagRows]);

  // ─── Filtered tasks ───────────────────────────────────────────────────────────
  const rootTasks = useMemo(() => tasks.filter((t) => t.parentTaskId == null), [tasks]);

  const filterCtx = useMemo<FilterSortCtx>(
    () => ({
      currentUserId,
      tagIdsOf: (t) => tagIdsByTask.get(t.id) ?? [],
    }),
    [currentUserId, tagIdsByTask]
  );

  const survivingRoots = useMemo(
    () => applyFilterSort(rootTasks, filterState, filterCtx),
    [rootTasks, filterState, filterCtx]
  );

  const survivingRootIds = useMemo(
    () => new Set(survivingRoots.map((t) => t.id)),
    [survivingRoots]
  );

  const filteredTasks = useMemo(() => {
    // Surviving roots + every subtask whose parent survived
    const subtasks = tasks.filter(
      (t) => t.parentTaskId != null && survivingRootIds.has(t.parentTaskId)
    );
    return [...survivingRoots, ...subtasks];
  }, [tasks, survivingRoots, survivingRootIds]);

  if (!project)
    return (
      <div className="p-8 text-muted-foreground">
        <Link href="/" className="inline-flex items-center gap-1 text-sm hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <p>找不到這個專案。</p>
      </div>
    );
  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <header className="px-8 py-5 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-md px-2 py-1 hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-xl font-semibold">{project.name}</h1>
        </div>
        <div className="inline-flex bg-muted rounded-lg p-1 text-sm">
          {(["list","kanban","calendar","gantt"] as ViewMode[]).map((v) => {
            const { Icon, label } = VIEW_META[v]; const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition ${active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Shared filter/sort toolbar — visible for ALL views */}
      <div className="px-8 py-3 border-b border-border bg-card">
        <ProjectToolbar
          state={filterState}
          onChange={handleFilterChange}
          tags={allTags}
          projectId={projectId}
          totalCount={rootTasks.length}
          visibleCount={survivingRoots.length}
        />
      </div>

      <div className="flex-1 overflow-auto relative">
        {isLoading ? <div className="p-8 text-muted-foreground text-sm">載入中…</div> : (
          <>
            {view === "list" && (
              <ProjectListView
                projectId={projectId}
                tasks={filteredTasks}
                filterState={filterState}
                tagsById={tagsById}
                tagIdsByTask={tagIdsByTask}
                onOpenTask={setSelectedTaskId}
              />
            )}
            {view === "kanban" && (
              <ProjectKanbanView
                projectId={projectId}
                tasks={filteredTasks}
                filterState={filterState}
                tagsById={tagsById}
                tagIdsByTask={tagIdsByTask}
                onOpenTask={setSelectedTaskId}
              />
            )}
            {view === "calendar" && (
              <ProjectCalendarView
                projectId={projectId}
                tasks={filteredTasks}
                filterState={filterState}
                tagsById={tagsById}
                tagIdsByTask={tagIdsByTask}
                onOpenTask={setSelectedTaskId}
              />
            )}
            {view === "gantt" && (
              <ProjectGanttView
                projectId={projectId}
                tasks={filteredTasks}
                filterState={filterState}
                tagsById={tagsById}
                tagIdsByTask={tagIdsByTask}
                onOpenTask={setSelectedTaskId}
              />
            )}
          </>
        )}
        {selectedTaskId != null && (() => {
          const t = tasks.find((x) => x.id === selectedTaskId);
          return t ? (
            <TaskDetailDrawer
              task={t}
              projectId={projectId}
              allTasks={tasks}
              tagsById={tagsById}
              tagIdsByTask={tagIdsByTask}
              onClose={() => setSelectedTaskId(null)}
            />
          ) : null;
        })()}
      </div>
    </div>
  );
}
