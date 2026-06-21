import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FrameworkDetailModal } from "./FrameworkDetailModal";

const ORDER = ["流程", "方法", "框架", "原則"] as const;

export function FrameworkLibrary() {
  const { data: frameworks = [], isLoading } = trpc.frameworks.list.useQuery();
  const [openId, setOpenId] = useState<number | null>(null);
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6">
      {ORDER.map((t) => {
        const items = frameworks.filter((f) => f.type === t);
        if (items.length === 0) return null;
        return (
          <section key={t}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t}（{items.length}）</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((f) => (
                <button key={f.id} onClick={() => setOpenId(f.id)}
                  className="text-left p-3 rounded-lg border border-border bg-card hover:bg-accent transition text-foreground">
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{f.oneLiner}</div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {frameworks.length === 0 && <p className="text-muted-foreground">尚無框架。</p>}
      <FrameworkDetailModal id={openId} open={openId != null} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
