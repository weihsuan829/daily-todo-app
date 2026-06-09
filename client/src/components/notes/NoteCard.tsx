import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pin } from "lucide-react";
import { htmlToPlainText, parseTags } from "@/lib/noteText";
import type { Note } from "../../../../drizzle/schema";

function firstImageSrc(html: string | null): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

export default function NoteCard({
  note,
  projectName,
  onOpen,
}: {
  note: Note;
  projectName?: string;
  onOpen: (note: Note) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  const preview = htmlToPlainText(note.content).slice(0, 160);
  const img = firstImageSrc(note.content);
  const tags = parseTags(note.tags);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderLeft: note.color ? `4px solid ${note.color}` : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(note)}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-sm break-words"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm truncate">{note.title || "（無標題）"}</h3>
        {note.isPinned && <Pin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      </div>
      {preview && <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{preview}</p>}
      {img && <img src={img} alt="" className="mt-2 rounded max-h-32 w-full object-cover" />}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">#{t}</span>)}
        {projectName && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">▸ {projectName}</span>}
      </div>
    </div>
  );
}
