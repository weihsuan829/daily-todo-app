import { useMemo, useState } from "react";
import { Ban, Plus, Search, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import Avatar from "./Avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: number;
  name: string | null;
  email: string | null;
}

interface PlaceholderMember {
  id: number;
  workspaceId: number;
  name: string;
  color: string | null;
  createdAt: Date;
}

interface TaskAssignee {
  id: number;
  assigneeId: number | null;
  assigneePlaceholderId: number | null;
}

// ─── UnassignedTrigger ────────────────────────────────────────────────────────

function UnassignedTrigger({ size = 22 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400"
      style={{ width: size, height: size }}
      title="未指派"
    >
      <UserPlus style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

// ─── AssigneePicker ────────────────────────────────────────────────────────────

export function AssigneePicker({
  projectId,
  task,
  onChanged,
}: {
  projectId: number;
  task: TaskAssignee;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Fetch members + placeholders when popover is open or when a task already has an assignee
  const hasAssignment = task.assigneeId != null || task.assigneePlaceholderId != null;

  const { data: members = [] } = trpc.members.list.useQuery(
    { projectId },
    { enabled: open || hasAssignment }
  );

  const { data: placeholders = [] } = trpc.placeholders.list.useQuery(
    { projectId },
    { enabled: open || (task.assigneePlaceholderId != null) }
  );

  const assignMutation = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      onChanged?.();
    },
  });

  const createPlaceholder = trpc.placeholders.create.useMutation({
    onSuccess: () => {
      utils.placeholders.list.invalidate({ projectId });
    },
  });

  // Resolve current assignee for display
  const currentMember = useMemo(
    () => (task.assigneeId != null ? members.find((m) => m.id === task.assigneeId) ?? null : null),
    [members, task.assigneeId]
  );

  const currentPlaceholder = useMemo(
    () =>
      task.assigneePlaceholderId != null
        ? placeholders.find((p) => p.id === task.assigneePlaceholderId) ?? null
        : null,
    [placeholders, task.assigneePlaceholderId]
  );

  const isAssigned = task.assigneeId != null || task.assigneePlaceholderId != null;

  // Filter by query
  const q = query.trim().toLowerCase();

  const filteredMembers = useMemo<Member[]>(() => {
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.name?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false)
    );
  }, [members, q]);

  const filteredPlaceholders = useMemo<PlaceholderMember[]>(() => {
    if (!q) return placeholders;
    return placeholders.filter((p) => p.name.toLowerCase().includes(q));
  }, [placeholders, q]);

  const exactPlaceholderMatch = useMemo(() => {
    if (!q) return null;
    return placeholders.find((p) => p.name.toLowerCase() === q) ?? null;
  }, [placeholders, q]);

  const showAddGuest = q.length > 0 && !exactPlaceholderMatch;

  const handleSelectMember = (member: Member) => {
    assignMutation.mutate({ id: task.id, assigneeId: member.id });
    setQuery("");
    setOpen(false);
  };

  const handleSelectPlaceholder = (ph: PlaceholderMember) => {
    assignMutation.mutate({ id: task.id, assigneePlaceholderId: ph.id });
    setQuery("");
    setOpen(false);
  };

  const handleUnassign = () => {
    assignMutation.mutate({ id: task.id, assigneeId: null, assigneePlaceholderId: null });
    setQuery("");
    setOpen(false);
  };

  const handleCreateAndAssign = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // Create placeholder then re-fetch list to find the new one
      await createPlaceholder.mutateAsync({ projectId, name });
      // Re-fetch placeholders list to get the new placeholder with its id
      const freshPlaceholders = await utils.placeholders.list.fetch({ projectId });
      const newPh = freshPlaceholders?.find((p) => p.name === name);
      if (newPh) {
        assignMutation.mutate({ id: task.id, assigneePlaceholderId: newPh.id });
      }
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  // Determine trigger display
  let triggerContent: React.ReactNode;
  if (currentMember) {
    triggerContent = <Avatar name={currentMember.name ?? "?"} size={22} />;
  } else if (currentPlaceholder) {
    triggerContent = (
      <Avatar name={currentPlaceholder.name} color={currentPlaceholder.color} size={22} />
    );
  } else {
    triggerContent = <UnassignedTrigger size={22} />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center rounded-full hover:opacity-80"
          title="指派"
        >
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 py-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="px-2 pb-1.5">
          <div className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-md focus-within:ring-2 focus-within:ring-blue-300">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋或輸入新訪客名稱"
              className="flex-1 outline-none text-sm bg-transparent"
            />
          </div>
        </div>

        {/* MEMBERS section */}
        {filteredMembers.length > 0 && (
          <>
            <div className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wider text-gray-400">
              Members
            </div>
            <div className="max-h-[160px] overflow-y-auto">
              {filteredMembers.map((m) => {
                const isSelected = task.assigneeId === m.id;
                return (
                  <button
                    key={`u-${m.id}`}
                    onClick={() => handleSelectMember(m)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
                  >
                    <Avatar name={m.name ?? "?"} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 truncate">Me</div>
                      <div className="text-[10px] text-gray-400 truncate">{m.email}</div>
                    </div>
                    {isSelected && <span className="text-blue-600 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Guests (placeholder members) */}
        {filteredPlaceholders.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-0.5 text-[11px] uppercase tracking-wider text-gray-400">
              Guests
            </div>
            <div className="max-h-[160px] overflow-y-auto">
              {filteredPlaceholders.map((p) => {
                const isSelected = task.assigneePlaceholderId === p.id;
                return (
                  <button
                    key={`p-${p.id}`}
                    onClick={() => handleSelectPlaceholder(p)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
                  >
                    <Avatar name={p.name} color={p.color} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 truncate">{p.name}</div>
                    </div>
                    {isSelected && <span className="text-blue-600 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Empty hint */}
        {filteredMembers.length === 0 &&
          filteredPlaceholders.length === 0 &&
          !showAddGuest && (
            <div className="px-3 py-2 text-xs text-gray-500">沒有相符的成員</div>
          )}

        {/* Add new guest */}
        {showAddGuest && (
          <button
            onClick={() => void handleCreateAndAssign()}
            disabled={creating}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 text-left border-t border-gray-100 mt-1 pt-1.5 disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-blue-50 text-blue-600 shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </span>
            <span className="text-sm text-blue-700 truncate">
              新增訪客：「{query.trim()}」
            </span>
          </button>
        )}

        {/* Unassign */}
        {isAssigned && (
          <button
            onClick={handleUnassign}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left border-t border-gray-100 mt-1 pt-1.5"
          >
            <Ban className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-600">取消指派</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
