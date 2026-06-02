import { useState } from "react";
import { ArrowDownUp, Filter as FilterIcon, RotateCcw, Eye, EyeOff, User, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DEFAULT_FILTER_STATE,
  isFilterStateDefault,
  type FilterState,
  type SortField,
  type SortDir,
  type FilterCondition,
  type AssigneeQuick,
} from "@/lib/filterSort";
import type { TagLike } from "./TagChips";
import { trpc } from "@/lib/trpc";

// ─── types ───────────────────────────────────────────────────────────────────

interface MemberLike {
  id: number;
  name: string | null;
  email: string | null;
}

export interface ProjectToolbarProps {
  state: FilterState;
  onChange: (s: FilterState) => void;
  tags: TagLike[];
  projectId: number;
  totalCount: number;
  visibleCount: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const SORT_FIELD_LABELS: Record<SortField, string> = {
  manual: "Manual",
  priority: "Priority",
  due_date: "Due Date",
  created_at: "Created",
  title: "Title",
};

const SORT_FIELDS: SortField[] = ["manual", "priority", "due_date", "created_at", "title"];

const PRIORITY_OPTIONS: { value: "low" | "medium" | "high" | "urgent"; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// ─── pill button ─────────────────────────────────────────────────────────────

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ─── SortControl ─────────────────────────────────────────────────────────────

function SortControl({
  state,
  onChange,
}: {
  state: FilterState;
  onChange: (s: FilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const isActive = state.sort.field !== "manual" || state.sort.dir !== "asc";

  const setField = (field: SortField) => {
    onChange({ ...state, sort: { field, dir: state.sort.dir } });
    setOpen(false);
  };

  const toggleDir = () => {
    onChange({
      ...state,
      sort: { ...state.sort, dir: state.sort.dir === "asc" ? "desc" : "asc" },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground"
          }`}
        >
          <ArrowDownUp className="w-3 h-3" />
          Sort
          {isActive && (
            <span className="opacity-80">{SORT_FIELD_LABELS[state.sort.field]}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1 mb-1">
          Sort by
        </div>
        {SORT_FIELDS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setField(f)}
            className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors ${
              state.sort.field === f ? "font-medium text-foreground" : "text-muted-foreground"
            }`}
          >
            {SORT_FIELD_LABELS[f]}
            {state.sort.field === f && <span className="ml-1 text-primary">✓</span>}
          </button>
        ))}
        <div className="border-t border-border mt-1 pt-1">
          <button
            type="button"
            onClick={toggleDir}
            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          >
            Direction: <span className="font-medium text-foreground">{state.sort.dir === "asc" ? "Ascending" : "Descending"}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── FilterControl ────────────────────────────────────────────────────────────

function FilterControl({
  state,
  onChange,
  tags,
  projectId,
}: {
  state: FilterState;
  onChange: (s: FilterState) => void;
  tags: TagLike[];
  projectId: number;
}) {
  const [open, setOpen] = useState(false);

  // Fetch members for assignee filter (only when popover is open)
  const { data: members = [] } = trpc.members.list.useQuery(
    { projectId },
    { enabled: open }
  );

  const priorityFilter = state.filters.find((f) => f.type === "priority") as
    | Extract<FilterCondition, { type: "priority" }>
    | undefined;
  const tagFilter = state.filters.find((f) => f.type === "tag") as
    | Extract<FilterCondition, { type: "tag" }>
    | undefined;
  const assigneeFilter = state.filters.find((f) => f.type === "assignee") as
    | Extract<FilterCondition, { type: "assignee" }>
    | undefined;

  const isActive = state.filters.length > 0;

  const togglePriority = (v: "low" | "medium" | "high" | "urgent") => {
    const current = priorityFilter?.values ?? [];
    const next = current.includes(v) ? current.filter((p) => p !== v) : [...current, v];
    const otherFilters = state.filters.filter((f) => f.type !== "priority");
    const newFilters: FilterCondition[] =
      next.length === 0
        ? otherFilters
        : [{ type: "priority", values: next }, ...otherFilters];
    onChange({ ...state, filters: newFilters });
  };

  const toggleTag = (id: number) => {
    const current = tagFilter?.values ?? [];
    const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
    const otherFilters = state.filters.filter((f) => f.type !== "tag");
    const newFilters: FilterCondition[] =
      next.length === 0
        ? otherFilters
        : [{ type: "tag", values: next }, ...otherFilters];
    onChange({ ...state, filters: newFilters });
  };

  // Assignee filter: values are (number | null)[]; null means "unassigned"
  const toggleAssignee = (id: number | null) => {
    const current = assigneeFilter?.values ?? [];
    const next = current.includes(id) ? current.filter((a) => a !== id) : [...current, id];
    const otherFilters = state.filters.filter((f) => f.type !== "assignee");
    const newFilters: FilterCondition[] =
      next.length === 0
        ? otherFilters
        : [{ type: "assignee", values: next }, ...otherFilters];
    onChange({ ...state, filters: newFilters });
  };

  const clearFilters = () => onChange({ ...state, filters: [] });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground"
          }`}
        >
          <FilterIcon className="w-3 h-3" />
          Filter
          {isActive && <span className="opacity-80">{state.filters.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        {/* Priority */}
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1 mb-1">
          Priority
        </div>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {PRIORITY_OPTIONS.map((opt) => {
            const selected = priorityFilter?.values.includes(opt.value) ?? false;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => togglePriority(opt.value)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1 mb-1 border-t border-border mt-1 pt-2">
              Tags
            </div>
            <div className="flex flex-wrap gap-1 px-2 pb-2">
              {tags.map((tag) => {
                const selected = tagFilter?.values.includes(tag.id) ?? false;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Assignee */}
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1 mb-1 border-t border-border mt-1 pt-2">
          Assignee
        </div>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {/* Unassigned option */}
          <button
            type="button"
            onClick={() => toggleAssignee(null)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              assigneeFilter?.values.includes(null) ?? false
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            Unassigned
          </button>
          {members.map((m) => {
            const selected = assigneeFilter?.values.includes(m.id) ?? false;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAssignee(m.id)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {m.name ?? m.email ?? `User ${m.id}`}
              </button>
            );
          })}
        </div>

        {/* Clear */}
        {isActive && (
          <div className="border-t border-border mt-1 pt-1 px-2">
            <button
              type="button"
              onClick={() => {
                clearFilters();
                setOpen(false);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1"
            >
              <X className="w-3 h-3" />
              Clear filters
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── OnlyMeToggle ─────────────────────────────────────────────────────────────

function OnlyMeToggle({
  value,
  onChange,
}: {
  value: AssigneeQuick;
  onChange: (v: AssigneeQuick) => void;
}) {
  const isMe = value === "me";
  return (
    <PillButton active={isMe} onClick={() => onChange(isMe ? "all" : "me")}>
      <User className="w-3 h-3" />
      Only me
    </PillButton>
  );
}

// ─── ClosedToggle ─────────────────────────────────────────────────────────────

function ClosedToggle({
  closed,
  onChange,
}: {
  closed: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <PillButton active={!closed} onClick={() => onChange(!closed)}>
      {closed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {closed ? "Showing done" : "Hiding done"}
    </PillButton>
  );
}

// ─── ProjectToolbar ───────────────────────────────────────────────────────────

export function ProjectToolbar({
  state,
  onChange,
  tags,
  projectId,
  totalCount,
  visibleCount,
}: ProjectToolbarProps) {
  const isDefault = isFilterStateDefault(state);
  const countText = isDefault
    ? `${totalCount} tasks`
    : `${visibleCount} / ${totalCount} tasks`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{countText}</span>
      <div className="flex-1" />

      <SortControl state={state} onChange={onChange} />
      <FilterControl state={state} onChange={onChange} tags={tags} projectId={projectId} />
      <OnlyMeToggle
        value={state.assigneeQuick}
        onChange={(a) => onChange({ ...state, assigneeQuick: a })}
      />
      <ClosedToggle
        closed={state.closed}
        onChange={(c) => onChange({ ...state, closed: c })}
      />

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTER_STATE)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          title="Reset toolbar"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  );
}
