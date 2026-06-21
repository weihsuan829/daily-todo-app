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
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">選用框架</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {result.chosenFrameworks.map((s) => (
              <span
                key={s}
                className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs font-medium"
              >
                {s}
              </span>
            ))}
          </div>
          {result.reasoning && (
            <p className="text-sm text-muted-foreground">{result.reasoning}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">分析</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown>{result.analysis}</Markdown>
        </CardContent>
      </Card>

      {result.diagram && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">決策圖（點擊放大）</CardTitle>
          </CardHeader>
          <CardContent>
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
