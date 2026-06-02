import { Flag, Ban } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type PriorityValue = "low" | "medium" | "high" | "urgent" | null;

const OPTIONS: { value: Exclude<PriorityValue, null>; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "#ef4444" },
  { value: "high",   label: "High",   color: "#f59e0b" },
  { value: "medium", label: "Normal", color: "#3b82f6" },
  { value: "low",    label: "Low",    color: "#94a3b8" },
];

function priorityMeta(value: PriorityValue) {
  return OPTIONS.find((o) => o.value === value) ?? null;
}

export function PriorityFlag({
  value,
  size = 14,
  className = "",
}: {
  value: PriorityValue;
  size?: number;
  className?: string;
}) {
  const meta = priorityMeta(value);
  if (!meta) {
    return (
      <Flag
        className={className}
        style={{ width: size, height: size, color: "#cbd5e1" }}
      />
    );
  }
  return (
    <Flag
      className={className}
      style={{ width: size, height: size, color: meta.color, fill: meta.color }}
    />
  );
}

export function PriorityPicker({
  value,
  onChange,
}: {
  value: PriorityValue;
  onChange: (next: PriorityValue) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center p-1 rounded hover:bg-accent"
          title="Priority"
        >
          <PriorityFlag value={value} size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-44 p-0 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Priority
        </div>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
          >
            <Flag style={{ width: 14, height: 14, color: o.color, fill: o.color }} />
            <span>{o.label}</span>
            {value === o.value && (
              <span className="ml-auto text-primary text-xs">✓</span>
            )}
          </button>
        ))}
        <button
          onClick={() => onChange(null)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left border-t border-border mt-1 pt-1.5"
        >
          <Ban className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Clear</span>
          {value === null && (
            <span className="ml-auto text-primary text-xs">✓</span>
          )}
        </button>
      </PopoverContent>
    </Popover>
  );
}
