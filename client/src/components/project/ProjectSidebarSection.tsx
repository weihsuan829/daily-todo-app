import { Link, useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function ProjectSidebarSection() {
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const [location, setLocation] = useLocation();

  const del = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Projects</span>
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">＋</Link>
      </div>
      <ul className="space-y-1">
        {projects.map((p) => (
          <li key={p.id} className="group flex items-center">
            <Link href={`/projects/${p.id}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent text-sm flex-1 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label={`刪除專案「${p.name}」`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>刪除專案「{p.name}」?</AlertDialogTitle>
                  <AlertDialogDescription>
                    此動作會永久刪除這個專案及其所有任務、標籤、留言與附件,且無法復原。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      del.mutate({ id: p.id });
                      if (location === `/projects/${p.id}`) {
                        setLocation("/");
                      }
                    }}
                  >
                    刪除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
      </ul>
    </div>
  );
}
