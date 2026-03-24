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
import DocumentationPage from "@/pages/documentation";
import JobDetailPage from "@/pages/job-detail";
import ProfileSetupGate from "@/components/profile-setup-gate";
import QuestionSetsPage from "@/pages/question-sets";
import ScheduleInterviewPage from "@/pages/schedule-interview";
import PayrollPage from "@/pages/payroll";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/job-posting" component={JobPostingPage} />
      <Route path="/talent" component={TalentPage} />
      <Route path="/seasons" component={SeasonsPage} />
      <Route path="/workforce" component={WorkforcePage} />
      <Route path="/interviews" component={InterviewsPage} />
      <Route path="/interviews/schedule" component={ScheduleInterviewPage} />
      <Route path="/automation" component={AutomationPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/documentation" component={DocumentationPage} />
      <Route path="/question-sets" component={QuestionSetsPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/candidate-portal" component={() => (
        <ProfileSetupGate><CandidatePortal /></ProfileSetupGate>
      )} />
      <Route path="/jobs/:id" component={JobDetailPage} />
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
