import { useState, useEffect } from "react";
import { ListChecks, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function NextStepsCard({ nextSteps }: { nextSteps: string[] }) {
  const [category, setCategory] = useState<"work" | "life">("work");
  const [added, setAdded] = useState<Set<number>>(new Set());
  useEffect(() => { setAdded(new Set()); }, [nextSteps.join("")]);
  const create = trpc.tasks.create.useMutation();

  if (!nextSteps || nextSteps.length === 0) return null;

  const addOne = async (i: number) => {
    if (added.has(i)) return;
    try {
      await create.mutateAsync({ title: nextSteps[i], category, dueDate: new Date() });
      setAdded((s) => new Set(s).add(i));
      toast.success("已加入任務");
    } catch {
      toast.error("加入任務失敗,請重試");
    }
  };
  const addAll = async () => {
    for (let i = 0; i < nextSteps.length; i++) if (!added.has(i)) await addOne(i);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-muted-foreground" />
            下一步行動
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="text-sm border border-border bg-input rounded px-2 py-1"
              value={category}
              onChange={(e) => setCategory(e.target.value as "work" | "life")}
            >
              <option value="work">Work</option>
              <option value="life">Life</option>
            </select>
            <Button size="sm" variant="outline" disabled={create.isPending} onClick={addAll}>
              全部加入
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {nextSteps.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span>{s}</span>
              <Button
                size="sm"
                variant={added.has(i) ? "ghost" : "default"}
                disabled={added.has(i) || create.isPending}
                onClick={() => addOne(i)}
              >
                {added.has(i) ? (
                  <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />已加入</span>
                ) : "加入任務"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
