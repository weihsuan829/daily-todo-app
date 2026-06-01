import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, Briefcase, Heart, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: stats } = trpc.tasks.stats.useQuery();
  const { data: tasks = [] } = trpc.tasks.list.useQuery();

  // 準備圖表資料
  const categoryData = stats ? [
    { name: "工作", value: stats.byCategory.work, completed: stats.completedByCategory.work },
    { name: "生活", value: stats.byCategory.life, completed: stats.completedByCategory.life },
  ] : [];

  const completionRate = stats && stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  const COLORS = ["#8b5cf6", "#ec4899"];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container py-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
            <h1 className="text-3xl font-light text-foreground">統計儀表板</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">總任務數</p>
                <p className="text-3xl font-light text-foreground">{stats?.total || 0}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">已完成</p>
                <p className="text-3xl font-light text-foreground">{stats?.completed || 0}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">完成率</p>
                <p className="text-3xl font-light text-foreground">{completionRate}%</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium text-primary">{completionRate}%</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">進行中</p>
                <p className="text-3xl font-light text-foreground">{(stats?.total || 0) - (stats?.completed || 0)}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Category Distribution */}
          <Card className="p-6">
            <h2 className="text-lg font-medium text-foreground mb-6">分類分佈</h2>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" />
                  <YAxis stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend />
                  <Bar dataKey="value" fill="var(--primary)" name="總數" />
                  <Bar dataKey="completed" fill="var(--accent)" name="已完成" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暫無資料
              </div>
            )}
          </Card>

          {/* Completion Status Pie Chart */}
          <Card className="p-6">
            <h2 className="text-lg font-medium text-foreground mb-6">完成狀態</h2>
            {stats && stats.total > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "已完成", value: stats.completed },
                      { name: "進行中", value: stats.total - stats.completed },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="var(--accent)" />
                    <Cell fill="var(--muted)" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暫無資料
              </div>
            )}
          </Card>
        </div>

        {/* Category Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Briefcase className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-medium text-foreground">工作任務</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">總數</span>
                <span className="text-2xl font-light text-foreground">{stats?.byCategory.work || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">已完成</span>
                <span className="text-2xl font-light text-green-600">{stats?.completedByCategory.work || 0}</span>
              </div>
              <div className="pt-3 border-t border-border">
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: stats && stats.byCategory.work > 0
                        ? `${(stats.completedByCategory.work / stats.byCategory.work) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-5 h-5 text-destructive" />
              <h3 className="text-lg font-medium text-foreground">生活任務</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">總數</span>
                <span className="text-2xl font-light text-foreground">{stats?.byCategory.life || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">已完成</span>
                <span className="text-2xl font-light text-green-600">{stats?.completedByCategory.life || 0}</span>
              </div>
              <div className="pt-3 border-t border-border">
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-destructive h-2 rounded-full transition-all"
                    style={{
                      width: stats && stats.byCategory.life > 0
                        ? `${(stats.completedByCategory.life / stats.byCategory.life) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
