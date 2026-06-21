import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FrameworkDetailModal } from "./FrameworkDetailModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ORDER = ["流程", "方法", "框架", "原則"] as const;

export function FrameworkLibrary() {
  const { data: frameworks = [], isLoading } = trpc.frameworks.list.useQuery();
  const [openId, setOpenId] = useState<number | null>(null);
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-8">
      {ORDER.map((t) => {
        const items = frameworks.filter((f) => f.type === t);
        if (items.length === 0) return null;
        return (
          <section key={t}>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-sm font-semibold">{t}</h2>
              <span className="text-xs text-muted-foreground">{items.length} 個</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOpenId(f.id)}
                  className="group text-left w-full"
                >
                  <Card className="py-4 gap-2 border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                    <CardHeader className="px-4 pb-0">
                      <CardTitle className="text-sm group-hover:text-primary transition-colors">{f.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{f.oneLiner}</p>
                    </CardContent>
                  </Card>
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
