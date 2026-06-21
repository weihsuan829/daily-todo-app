import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import TaskList from "@/pages/TaskList";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import RecurringTasks from "@/pages/RecurringTasks";
import AnnualTracking from "@/pages/AnnualTracking";
import Projects from "@/pages/Projects";
import ProjectView from "@/pages/ProjectView";
import Notes from "@/pages/Notes";
import SolveProblem from "@/pages/SolveProblem";

import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={TaskList} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/recurring"} component={RecurringTasks} />
      <Route path={"/annual"} component={AnnualTracking} />
      <Route path={"/projects"} component={Projects} />
      <Route path={"/projects/:id"} component={ProjectView} />
      <Route path={"/notes"} component={Notes} />
      <Route path={"/solve-problems"} component={SolveProblem} />

      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
