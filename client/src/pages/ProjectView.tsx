import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { BarChart3, Calendar as CalendarIcon, Columns3, List } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ProjectListView from "@/components/project/ProjectListView";
import ProjectKanbanView from "@/components/project/ProjectKanbanView";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import ProjectGanttView from "@/components/project/ProjectGanttView";

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
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const project = projects.find((p) => p.id === projectId);
  const { data: tasks = [], isLoading } = trpc.tasks.listByProject.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });

  if (!project) return <div className="p-8 text-muted-foreground">找不到這個專案。</div>;
  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <header className="px-8 py-5 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
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
      <div className="flex-1 overflow-auto">
        {isLoading ? <div className="p-8 text-muted-foreground text-sm">載入中…</div> : (
          <>
            {view === "list" && <ProjectListView projectId={projectId} tasks={tasks} />}
            {view === "kanban" && <ProjectKanbanView projectId={projectId} tasks={tasks} />}
            {view === "calendar" && <ProjectCalendarView projectId={projectId} tasks={tasks} />}
            {view === "gantt" && <ProjectGanttView projectId={projectId} tasks={tasks} />}
          </>
        )}
      </div>
    </div>
  );
}
