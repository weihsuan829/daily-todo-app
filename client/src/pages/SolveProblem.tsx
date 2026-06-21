import { Link } from "wouter";
import { ArrowLeft, Brain, BookOpen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SolveTab } from "@/components/solve/SolveTab";
import { FrameworkLibrary } from "@/components/solve/FrameworkLibrary";

export default function SolveProblem() {
  return (
    <div className="max-w-4xl mx-auto p-6 text-foreground">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <h1 className="text-2xl font-bold mb-6">Solve Problem</h1>
      <Tabs defaultValue="solve">
        <TabsList className="mb-6">
          <TabsTrigger value="solve">
            <Brain className="w-4 h-4" />
            解題
          </TabsTrigger>
          <TabsTrigger value="library">
            <BookOpen className="w-4 h-4" />
            框架庫
          </TabsTrigger>
        </TabsList>
        <TabsContent value="solve">
          <SolveTab />
        </TabsContent>
        <TabsContent value="library">
          <FrameworkLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
