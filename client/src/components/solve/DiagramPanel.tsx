import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MermaidDiagram } from "@/components/MermaidDiagram";

export function DiagramPanel({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  if (!code) return null;
  return (
    <>
      <div
        className="cursor-zoom-in overflow-auto max-h-[40vh]"
        onClick={() => setOpen(true)}
        title="點擊放大"
        role="button"
        aria-label="點擊放大圖表"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(true); }}
      >
        <MermaidDiagram code={code} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-auto">
          <div className="w-full overflow-auto">
            <MermaidDiagram code={code} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
