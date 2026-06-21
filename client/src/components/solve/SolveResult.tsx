import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";
import { DiagramPanel } from "./DiagramPanel";
import { DiscussionThread } from "./DiscussionThread";
import { NextStepsCard } from "./NextStepsCard";
import { trpc } from "@/lib/trpc";
import { DIAGRAM_TYPES } from "./diagramTypes";

export interface SolveResultData {
  id?: number | null;
  chosenFrameworks: string[];
  reasoning: string;
  analysis: string;
  diagram: string;
  diagramType?: string;
  nextSteps?: string[];
}

function DiagramControls({
  problemSolutionId,
  current,
  onSwap,
}: {
  problemSolutionId: number;
  current?: string;
  onSwap: (diagram: string, type: string) => void;
}) {
  const utils = trpc.useUtils();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const setDiagram = trpc.solveProblems.setDiagram.useMutation({
    onSuccess: (r) => {
      onSwap(r.diagram, r.diagramType);
      utils.solveProblems.get.invalidate({ id: problemSolutionId });
      setPendingKey(null);
    },
    onError: () => setPendingKey(null),
  });
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {DIAGRAM_TYPES.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={current === t.key ? "default" : "outline"}
          disabled={setDiagram.isPending}
          onClick={() => {
            setPendingKey(t.key);
            setDiagram.mutate({ problemSolutionId, diagramType: t.key });
          }}
        >
          {pendingKey === t.key ? "生成中…" : t.label}
        </Button>
      ))}
    </div>
  );
}

export function SolveResult({
  result,
  problemSolutionId,
}: {
  result: SolveResultData;
  problemSolutionId?: number;
}) {
  const reasoningMd = result.reasoning.replace(/\s+(\d+)\.\s+/g, "\n\n$1. ");

  const [localDiagram, setLocalDiagram] = useState(result.diagram);
  const [localDiagramType, setLocalDiagramType] = useState(result.diagramType);

  useEffect(() => {
    setLocalDiagram(result.diagram);
    setLocalDiagramType(result.diagramType);
  }, [result.diagram, result.diagramType]);

  return (
    <div className="space-y-6">
      {result.nextSteps && result.nextSteps.length > 0 && (
        <NextStepsCard nextSteps={result.nextSteps} />
      )}

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
          {result.reasoning && <Markdown>{reasoningMd}</Markdown>}
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
            <CardTitle className="text-base font-semibold">
              決策圖（點擊放大）
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {problemSolutionId != null && (
              <DiagramControls
                problemSolutionId={problemSolutionId}
                current={localDiagramType}
                onSwap={(diagram, type) => {
                  setLocalDiagram(diagram);
                  setLocalDiagramType(type);
                }}
              />
            )}
            <DiagramPanel code={localDiagram} />
          </CardContent>
        </Card>
      )}

      {problemSolutionId != null && (
        <DiscussionThread problemSolutionId={problemSolutionId} />
      )}
    </div>
  );
}
