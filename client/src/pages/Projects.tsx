import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const create = trpc.projects.create.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const [name, setName] = useState("");
  return (
    <div className="max-w-2xl mx-auto p-6 text-foreground">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <h1 className="text-2xl font-bold mb-4">Projects</h1>
      <form className="flex gap-2 mb-6" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { create.mutate({ name: name.trim() }); setName(""); } }}>
        <input className="flex-1 border border-border bg-input rounded px-3 py-2" placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" type="submit" disabled={create.isPending}>+ Add</button>
      </form>
      {isLoading ? <p>Loading…</p> : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex items-center gap-2 p-3 rounded border border-border bg-card hover:bg-accent">
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />{p.name}
              </Link>
            </li>
          ))}
          {projects.length === 0 && <p className="text-muted-foreground">No projects yet.</p>}
        </ul>
      )}
    </div>
  );
}
