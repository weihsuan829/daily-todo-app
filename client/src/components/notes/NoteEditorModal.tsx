import { useEffect, useRef, useState } from "react";
import { X, Pin, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ColorPicker from "@/components/project/ColorPicker";
import NoteEditor from "./NoteEditor";
import { parseTags } from "@/lib/noteText";
import type { Note } from "../../../../drizzle/schema";

export default function NoteEditorModal({
  note,
  onClose,
}: {
  note: Note;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.notes.list.invalidate();
  const update = trpc.notes.update.useMutation({ onSuccess: invalidate });
  const del = trpc.notes.delete.useMutation({ onSuccess: invalidate });
  const { data: projects = [] } = trpc.projects.list.useQuery();

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const [color, setColor] = useState<string | null>(note.color);
  const [tags, setTags] = useState<string[]>(parseTags(note.tags));
  const [tagInput, setTagInput] = useState("");
  const [projectId, setProjectId] = useState<number | null>(note.projectId);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const firstRun = useRef(true);

  // debounced autosave of title/content
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => {
      update.mutate({ id: note.id, title, content });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  const save = (patch: { color?: string | null; isPinned?: boolean; projectId?: number | null; tags?: string }) =>
    update.mutate({ id: note.id, ...patch });

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    const next = [...tags, t];
    setTags(next); setTagInput("");
    save({ tags: JSON.stringify(next) });
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next); save({ tags: JSON.stringify(next) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
        style={color ? { borderTop: `4px solid ${color}` } : undefined}
      >
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { const v = !isPinned; setIsPinned(v); save({ isPinned: v }); }}
            className={`p-1.5 rounded hover:bg-accent ${isPinned ? "text-foreground" : "text-muted-foreground"}`}
            title="釘選"
          >
            <Pin className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <ColorPicker value={color} onChange={(c) => { setColor(c); save({ color: c }); }} />
            <button
              onClick={() => { if (confirm("刪除這則筆記?")) { del.mutate({ id: note.id }); onClose(); } }}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="刪除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="標題"
          className="w-full text-lg font-semibold bg-transparent outline-none mb-2"
        />

        <NoteEditor content={content} onChange={setContent} />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground inline-flex items-center gap-1">
              #{t}
              <button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground">×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="加標籤…"
            className="text-xs bg-transparent outline-none w-20"
          />
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">關聯專案</span>
          <select
            value={projectId ?? ""}
            onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setProjectId(v); save({ projectId: v }); }}
            className="border border-border rounded px-2 py-1 text-sm bg-background"
          >
            <option value="">（無）</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
