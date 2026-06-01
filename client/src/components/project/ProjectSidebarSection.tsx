import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
export default function ProjectSidebarSection() {
  const { data: projects = [] } = trpc.projects.list.useQuery();
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Projects</span>
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">＋</Link>
      </div>
      <ul className="space-y-1">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent text-sm">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />{p.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
