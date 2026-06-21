import { useState } from "react";
import { SolveTab } from "@/components/solve/SolveTab";
import { FrameworkLibrary } from "@/components/solve/FrameworkLibrary";

export default function SolveProblem() {
  const [tab, setTab] = useState<"solve" | "library">("solve");
  return (
    <div className="max-w-4xl mx-auto p-6 text-foreground">
      <h1 className="text-2xl font-bold mb-4">Solve Problem</h1>
      <div className="flex gap-2 mb-4">
        <button className={`px-3 py-1.5 rounded ${tab === "solve" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setTab("solve")}>🧠 解題</button>
        <button className={`px-3 py-1.5 rounded ${tab === "library" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setTab("library")}>📚 框架庫</button>
      </div>
      {tab === "solve" ? <SolveTab /> : <FrameworkLibrary />}
    </div>
  );
}
