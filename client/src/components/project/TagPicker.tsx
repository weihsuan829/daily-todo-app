import { useState } from "react";
import { Tag as TagIcon, Plus, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import type { TagLike } from "./TagChips";

// A small fixed palette for new tags
const DEFAULT_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function randomColor(): string {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

interface TagPickerProps {
  taskId: number;
  projectId: number;
  tags: TagLike[];
  selectedTagIds: number[];
  onChanged: () => void;
}

export default function TagPicker({
  taskId,
  projectId,
  tags,
  selectedTagIds,
  onChanged,
}: TagPickerProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(() => randomColor());
  const [creating, setCreating] = useState(false);

  const setTags = trpc.tasks.setTags.useMutation({
    onSuccess: () => {
      utils.tags.taskMap.invalidate({ projectId });
      onChanged();
    },
  });

  const createTag = trpc.tags.create.useMutation({
    onSuccess: () => {
      utils.tags.list.invalidate({ projectId });
      utils.tags.taskMap.invalidate({ projectId });
      setNewName("");
      setNewColor(randomColor());
      setCreating(false);
      onChanged();
    },
  });

  const handleToggle = (tagId: number) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setTags.mutate({ id: taskId, tagIds: next });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createTag.mutate({ projectId, name, color: newColor });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
          title="Manage tags"
        >
          <TagIcon className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Tags</p>

        {/* existing tags list */}
        {tags.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 py-1">No tags yet.</p>
        )}
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {tags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            const hex = tag.color.startsWith("#") ? tag.color : "#6366f1";
            return (
              <button
                key={tag.id}
                onClick={() => handleToggle(tag.id)}
                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-xs flex-1 truncate">{tag.name}</span>
                {selected && (
                  <Check className="w-3 h-3 text-primary flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* create new tag */}
        <div className="mt-2 border-t border-border pt-2">
          {creating ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1 px-1">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-4 h-4 rounded-full border-2 transition"
                    style={{
                      backgroundColor: c,
                      borderColor: newColor === c ? c : "transparent",
                      outline: newColor === c ? `2px solid ${c}55` : "none",
                    }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    } else if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Tag name…"
                  className="flex-1 text-xs border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring bg-background"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createTag.isPending}
                  className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" />
              <span className="text-xs">New tag</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
