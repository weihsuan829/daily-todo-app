import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Search } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { trpc } from "@/lib/trpc";
import { noteMatchesQuery, parseTags } from "@/lib/noteText";
import NoteCard from "@/components/notes/NoteCard";
import NoteEditorModal from "@/components/notes/NoteEditorModal";
import type { Note } from "../../../drizzle/schema";

function NotesGrid({
  items, projectName, onOpen,
}: {
  items: Note[];
  projectName: (id: number | null) => string | undefined;
  onOpen: (note: Note) => void;
}) {
  return (
    <SortableContext items={items.map((n) => n.id)} strategy={rectSortingStrategy}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {items.map((n) => (
          <NoteCard key={n.id} note={n} projectName={projectName(n.projectId)} onOpen={onOpen} />
        ))}
      </div>
    </SortableContext>
  );
}

export default function Notes() {
  const utils = trpc.useUtils();
  const { data: notes = [] } = trpc.notes.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const create = trpc.notes.create.useMutation({ onSuccess: () => utils.notes.list.invalidate() });
  const reorder = trpc.notes.reorder.useMutation({ onSuccess: () => utils.notes.list.invalidate() });

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const projectName = (id: number | null) => projects.find((p) => p.id === id)?.name;

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => parseTags(n.tags).forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  const filtered = useMemo(() =>
    notes.filter((n) =>
      noteMatchesQuery(n, search) &&
      (!activeTag || parseTags(n.tags).includes(activeTag))
    ), [notes, search, activeTag]);

  const pinned = filtered.filter((n) => n.isPinned);
  const normal = filtered.filter((n) => !n.isPinned);

  const onDragEnd = (group: Note[]) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = group.map((n) => n.id);
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    reorder.mutate({ orderedIds: next });
  };

  const openNote = notes.find((n) => n.id === openId) ?? null;

  return (
    <div className="max-w-5xl mx-auto p-6 text-foreground">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">Notes</h1>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋筆記…"
                 className="pl-8 pr-3 py-1.5 border border-border rounded-md bg-background text-sm w-56" />
        </div>
        <button onClick={() => create.mutate({ title: "" })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">
          <Plus className="w-4 h-4" /> 新增筆記
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setActiveTag(null)}
                  className={`text-xs px-2 py-0.5 rounded ${!activeTag ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>全部</button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setActiveTag(t)}
                    className={`text-xs px-2 py-0.5 rounded ${activeTag === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>#{t}</button>
          ))}
        </div>
      )}

      {pinned.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground mb-2">📌 釘選</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(pinned)}>
            <NotesGrid items={pinned} projectName={projectName} onOpen={(nn) => setOpenId(nn.id)} />
          </DndContext>
          <div className="h-5" />
        </>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(normal)}>
        <NotesGrid items={normal} projectName={projectName} onOpen={(nn) => setOpenId(nn.id)} />
      </DndContext>

      {filtered.length === 0 && <p className="text-muted-foreground mt-6">沒有筆記。按「新增筆記」開始。</p>}

      {openNote && <NoteEditorModal note={openNote} onClose={() => setOpenId(null)} />}
    </div>
  );
}
