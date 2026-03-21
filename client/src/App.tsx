import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import TalentPage from "@/pages/talent";
import SeasonsPage from "@/pages/seasons";
import WorkforcePage from "@/pages/workforce";
import NotificationsPage from "@/pages/notifications";
import CandidatePortal from "@/pages/candidate-portal";
import InterviewsPage from "@/pages/interviews";
import JobPostingPage from "@/pages/job-posting";
import AutomationPage from "@/pages/automation";
import SettingsPage from "@/pages/settings";

function Router() {
  return (
    <Switch>
      {/* <Route path="/" component={AuthPage} /> */}
      {/* <Route path="/auth" component={AuthPage} /> */}
      <Route path="/" component={Dashboard} />
      <Route path="/auth" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/job-posting" component={JobPostingPage} />
      <Route path="/talent" component={TalentPage} />
      <Route path="/seasons" component={SeasonsPage} />
      <Route path="/workforce" component={WorkforcePage} />
      <Route path="/interviews" component={InterviewsPage} />
      <Route path="/automation" component={AutomationPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/candidate-portal" component={CandidatePortal} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
