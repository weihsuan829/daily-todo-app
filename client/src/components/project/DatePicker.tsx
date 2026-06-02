import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { format, isValid } from "date-fns";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

// ─── date helpers ────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dateToISO(d: Date | null): string | null {
  if (!d || !isValid(d)) return null;
  return toISO(d);
}

function isoToDate(s: string | null): Date | null {
  return parseISO(s);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function startOfWeek(d: Date, weekStartsOn: number = 0): Date {
  const r = new Date(d);
  const diff = (r.getDay() - weekStartsOn + 7) % 7;
  r.setDate(r.getDate() - diff);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(d: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = d.getTime();
  return t > start.getTime() && t < end.getTime();
}

function getNextSaturday(d: Date): Date {
  const day = d.getDay();
  const delta = (6 - day + 7) % 7 || 7;
  return addDays(d, delta);
}

function getNextMonday(d: Date): Date {
  const day = d.getDay();
  const delta = (1 - day + 7) % 7 || 7;
  return addDays(d, delta);
}

function weekdayShort(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function shortDate(d: Date): string {
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
}

function buildPresets(today: Date) {
  const presets: { label: string; hint: string; date: Date }[] = [];
  presets.push({ label: "Today", hint: weekdayShort(today), date: today });
  const tomorrow = addDays(today, 1);
  presets.push({ label: "Tomorrow", hint: weekdayShort(tomorrow), date: tomorrow });
  const thisWeekend = getNextSaturday(today);
  presets.push({ label: "This weekend", hint: weekdayShort(thisWeekend), date: thisWeekend });
  const nextWeek = getNextMonday(today);
  presets.push({ label: "Next week", hint: weekdayShort(nextWeek), date: nextWeek });
  const nextWeekend = addDays(thisWeekend, 7);
  presets.push({ label: "Next weekend", hint: shortDate(nextWeekend), date: nextWeekend });
  const twoWeeks = addDays(today, 14);
  presets.push({ label: "2 weeks", hint: shortDate(twoWeeks), date: twoWeeks });
  const fourWeeks = addDays(today, 28);
  presets.push({ label: "4 weeks", hint: shortDate(fourWeeks), date: fourWeeks });
  return presets;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DateField = "start" | "due";

export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
}

function parseRecurrenceRule(s: string | null): RecurrenceRule | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as RecurrenceRule;
  } catch {
    return null;
  }
}

function serializeRecurrenceRule(r: RecurrenceRule | null): string | null {
  if (!r) return null;
  return JSON.stringify(r);
}

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({
  month,
  setMonth,
  startValue,
  dueValue,
  activeField,
  onPick,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  startValue: Date | null;
  dueValue: Date | null;
  activeField: DateField;
  onPick: (d: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = startOfWeek(first, 0);
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) arr.push(addDays(gridStart, i));
    return arr;
  }, [month]);

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="w-[238px] p-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="text-sm font-medium text-foreground">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent"
          >
            Today
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[10px] uppercase text-muted-foreground px-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 text-xs">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = isSameDay(d, today);
          const isStart = startValue && isSameDay(d, startValue);
          const isDue = dueValue && isSameDay(d, dueValue);
          const inRange = isInRange(d, startValue, dueValue);

          let cellClass = `h-7 text-center relative `;
          if (!inMonth) {
            cellClass += "text-muted-foreground/30 ";
          } else {
            cellClass += "text-foreground ";
          }

          if (isDue) {
            cellClass += "bg-primary text-primary-foreground rounded ";
          } else if (isStart) {
            cellClass += "ring-1 ring-primary rounded text-primary ";
          } else if (inRange) {
            cellClass += "bg-accent rounded-none ";
          } else if (isToday && activeField === "due" && !isDue) {
            cellClass += "ring-1 ring-muted-foreground/40 rounded ";
          }

          return (
            <button
              key={i}
              onClick={() => onPick(d)}
              className={`${cellClass} hover:bg-accent/70 hover:rounded`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── RecurrenceSubMenu ────────────────────────────────────────────────────────

function RecurrenceSubMenu({
  value,
  onChange,
  onBack,
}: {
  value: RecurrenceRule | null;
  onChange: (v: RecurrenceRule | null) => void;
  onBack: () => void;
}) {
  const current = value ?? { freq: "weekly" as const, interval: 1 };
  return (
    <div className="p-3 w-[220px] space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-foreground">Set Recurring</div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:underline">Back</button>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">Frequency</div>
        <div className="flex gap-1 flex-wrap">
          {(["daily", "weekly", "monthly", "yearly"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onChange({ ...current, freq: f })}
              className={`text-xs px-2 py-1 rounded border ${
                current.freq === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-foreground hover:bg-accent"
              }`}
            >
              {{ daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[f]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">Every N cycles</div>
        <input
          type="number"
          min={1}
          value={current.interval}
          onChange={(e) =>
            onChange({ ...current, interval: Math.max(1, Number(e.target.value) || 1) })
          }
          className="w-full px-2 py-1 border border-border rounded text-sm outline-none focus:ring-1 focus:ring-ring bg-background text-foreground"
        />
      </div>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-destructive hover:underline"
        >
          Remove Recurring
        </button>
      )}
    </div>
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

export interface DatePickerProps {
  startDate: Date | null;
  dueDate: Date | null;
  recurrenceRule: string | null;
  onChange: (next: {
    startDate: Date | null;
    dueDate: Date | null;
    recurrenceRule: string | null;
  }) => void;
  triggerLabel?: React.ReactNode;
  disabled?: boolean;
}

export default function DatePicker({
  startDate,
  dueDate,
  recurrenceRule,
  onChange,
  triggerLabel,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<DateField>("due");
  const [showRecur, setShowRecur] = useState(false);

  const startISO = dateToISO(startDate);
  const dueISO = dateToISO(dueDate);
  const recurrence = parseRecurrenceRule(recurrenceRule);

  const initial = (field === "due" ? dueDate : startDate) ?? new Date();
  const [month, setMonth] = useState<Date>(() =>
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const today = useMemo(() => new Date(), []);
  const presets = useMemo(() => buildPresets(today), [today]);

  // When popover opens, reset month to the currently active field's date
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const ref = field === "due" ? dueDate : startDate;
      const d = ref ?? today;
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      setShowRecur(false);
    }
    setOpen(next);
  };

  const pick = (d: Date) => {
    if (field === "due") {
      onChange({ startDate, dueDate: d, recurrenceRule });
    } else {
      onChange({ startDate: d, dueDate, recurrenceRule });
      // After picking start, jump to due if due isn't set
      if (!dueDate) {
        setField("due");
        setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  };

  const clear = () => {
    if (field === "due") {
      onChange({ startDate, dueDate: null, recurrenceRule });
    } else {
      onChange({ startDate: null, dueDate, recurrenceRule });
    }
  };

  // Trigger label: show M/D → M/D range, single date, or plain calendar icon
  const defaultTrigger = () => {
    if (startDate && dueDate) {
      const s = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
      const e = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
      return (
        <>
          <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{s} → {e}</span>
        </>
      );
    } else if (dueDate) {
      const e = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
      return (
        <>
          <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{e}</span>
        </>
      );
    } else if (startDate) {
      const s = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
      return (
        <>
          <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{s} →</span>
        </>
      );
    }
    return <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />;
  };

  // Footer: show YYYY-MM-DD → YYYY-MM-DD
  const footerText = () => {
    if (startISO || dueISO) {
      return (
        <span>
          {startISO ?? "—"}{" "}
          <span className="text-muted-foreground/40">→</span>{" "}
          {dueISO ?? "—"}
        </span>
      );
    }
    return <span className="text-muted-foreground">No date selected</span>;
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-accent ${
            disabled ? "cursor-default opacity-60" : "cursor-pointer"
          }`}
          title="Date"
        >
          {triggerLabel ?? defaultTrigger()}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {showRecur ? (
          <RecurrenceSubMenu
            value={recurrence}
            onChange={(v) =>
              onChange({
                startDate,
                dueDate,
                recurrenceRule: serializeRecurrenceRule(v),
              })
            }
            onBack={() => setShowRecur(false)}
          />
        ) : (
          <div className="flex flex-col">
            <div className="flex">
              {/* Left panel: tabs + presets + actions */}
              <div className="border-r border-border w-[170px] p-2 space-y-0.5">
                {/* Start / Due tab toggle */}
                <div className="flex gap-1 mb-1 px-1">
                  <button
                    onClick={() => setField("start")}
                    className={`flex-1 text-xs px-1.5 py-0.5 rounded ${
                      field === "start"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    Start
                  </button>
                  <button
                    onClick={() => setField("due")}
                    className={`flex-1 text-xs px-1.5 py-0.5 rounded ${
                      field === "due"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    Due
                  </button>
                </div>

                {/* Preset rows */}
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => pick(p.date)}
                    className="w-full flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-accent"
                  >
                    <span className="text-foreground">{p.label}</span>
                    <span className="text-muted-foreground">{p.hint}</span>
                  </button>
                ))}

                {/* Divider + Set Recurring + Clear */}
                <div className="border-t border-border mt-1 pt-1 space-y-0.5">
                  <button
                    onClick={() => setShowRecur(true)}
                    className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-accent"
                  >
                    <Repeat className="w-3 h-3 text-muted-foreground" />
                    <span className="text-foreground">Set Recurring</span>
                    {recurrence && (
                      <span className="ml-auto text-[10px] text-primary">Set</span>
                    )}
                  </button>
                  {(startDate || dueDate) && (
                    <button
                      onClick={clear}
                      className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent text-destructive"
                    >
                      Clear {field === "due" ? "Due" : "Start"} date
                    </button>
                  )}
                </div>
              </div>

              {/* Right panel: calendar */}
              <MiniCalendar
                month={month}
                setMonth={setMonth}
                startValue={startDate}
                dueValue={dueDate}
                activeField={field}
                onPick={pick}
              />
            </div>

            {/* Footer */}
            <div className="border-t border-border px-3 py-2 flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                {footerText()}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
