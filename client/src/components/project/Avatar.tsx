const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const cp = trimmed.codePointAt(0);
  return cp ? String.fromCodePoint(cp).toUpperCase() : "?";
}

export default function Avatar({
  name,
  color,
  size = 22,
  className = "",
}: {
  name: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const bg = color || colorFor(name);
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-medium shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42 }}
      title={name}
    >
      {initial(name)}
    </div>
  );
}
