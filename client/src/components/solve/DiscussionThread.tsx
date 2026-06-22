import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "./Markdown";
import { toast } from "sonner";

export function DiscussionThread({ problemSolutionId }: { problemSolutionId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.solveProblems.get.useQuery({ id: problemSolutionId });
  const messages = data?.messages ?? [];
  const [text, setText] = useState("");
  const discuss = trpc.solveProblems.discuss.useMutation({
    onSuccess: () => { utils.solveProblems.get.invalidate({ id: problemSolutionId }); setText(""); },
    onError: () => toast.error("討論回覆失敗,請重試"),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">討論</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
              </div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-muted-foreground text-sm">針對這題,有想法就在這裡跟 AI 討論。</p>}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) discuss.mutate({ problemSolutionId, message: text.trim() }); }}>
          <input className="flex-1 border border-border bg-input rounded px-3 py-2 text-sm" placeholder="輸入你的想法/追問…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={discuss.isPending}>{discuss.isPending ? "…" : "送出"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
