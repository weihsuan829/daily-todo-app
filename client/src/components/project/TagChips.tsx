export interface TagLike {
  id: number;
  name: string;
  color: string;
}

export default function TagChips({
  tagIds,
  tagsById,
  size = "sm",
}: {
  tagIds: number[];
  tagsById: Record<number, TagLike>;
  size?: "xs" | "sm";
}) {
  if (!tagIds.length) return null;
  const padding = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";
  const text = size === "xs" ? "text-[10px]" : "text-xs";
  return (
    <div className="flex flex-wrap gap-1">
      {tagIds.map((id) => {
        const t = tagsById[id];
        if (!t) return null;
        // derive low-opacity background and border from color
        const hex = t.color.startsWith("#") ? t.color : "#6366f1";
        return (
          <span
            key={id}
            className={`${padding} ${text} rounded-md border font-medium leading-5 whitespace-nowrap`}
            style={{
              backgroundColor: `${hex}22`,
              color: hex,
              borderColor: `${hex}55`,
            }}
          >
            {t.name}
          </span>
        );
      })}
    </div>
  );
}
