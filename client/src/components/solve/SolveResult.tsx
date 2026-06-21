import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "./Markdown";
import { DiagramPanel } from "./DiagramPanel";
import { DiscussionThread } from "./DiscussionThread";

export interface SolveResultData {
  id?: number | null;
  chosenFrameworks: string[];
  reasoning: string;
  analysis: string;
  diagram: string;
  diagramType?: string;
}

export function SolveResult({ result, problemSolutionId }: { result: SolveResultData; problemSolutionId?: number }) {
  const reasoningMd = result.reasoning.replace(/\s+(\d+)\.\s+/g, "\n\n$1. ");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">選用框架</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            {result.chosenFrameworks.map((s) => (
              <span
                key={s}
                className="px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-xs font-medium"
              >
                {s}
              </span>
            ))}
          </div>
          {result.reasoning && (
            <Markdown>{reasoningMd}</Markdown>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">分析</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Markdown>{result.analysis}</Markdown>
        </CardContent>
      </Card>

      {result.diagram && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">決策圖（點擊放大）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DiagramPanel code={result.diagram} />
          </CardContent>
        </Card>
      )}

      {problemSolutionId != null && (
        <DiscussionThread problemSolutionId={problemSolutionId} />
      )}
    </div>
  );
}
