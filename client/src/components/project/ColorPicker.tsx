import { useState } from "react";
import { Ban, Palette } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TASK_COLORS } from "@/lib/taskColor";

/** Small circular swatch showing the current color (dashed palette icon when unset). */
export function ColorSwatch({
  value,
  size = 20,
}: {
  value: string | null;
  size?: number;
}) {
  if (!value) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <Palette style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }
  return (
    <span
      className="inline-block rounded-full border border-border"
      style={{ width: size, height: size, backgroundColor: value }}
    />
  );
}

/**
 * PMS-style color picker: preset swatches as the default choice, with a
 * "自訂" native color input and a "清除" reset, inside a popover.
 */
export default function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center p-1 rounded hover:bg-accent"
          title="任務顏色"
        >
          <ColorSwatch value={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-3">
        {/* Preset swatches */}
        <div className="grid grid-cols-4 gap-2">
          {TASK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`w-9 h-9 rounded-full border-2 transition ${
                value === c
                  ? "border-foreground ring-2 ring-border"
                  : "border-transparent hover:border-muted-foreground/40"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>

        {/* Custom + Clear */}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="color"
              value={value ?? "#3b82f6"}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-border bg-transparent p-0"
            />
            <span>自訂</span>
          </label>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="清除(用預設色)"
          >
            <Ban className="w-3 h-3" />
            清除
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
