import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import TalentPage from "@/pages/talent";
import EventsPage from "@/pages/events";
import SMPContractsPage from "@/pages/smp-contracts";
import WorkforcePage from "@/pages/workforce";
import NotificationsPage from "@/pages/notifications";
import CandidatePortal from "@/pages/candidate-portal";
import InterviewsPage, { InterviewCandidatesPage } from "@/pages/interviews";
import JobPostingPage from "@/pages/job-posting";
import JobPostingDetailPage from "@/pages/job-posting-detail";
import AutomationPage from "@/pages/automation";
import SettingsPage from "@/pages/settings";
import DocumentationPage from "@/pages/documentation";
import JobDetailPage from "@/pages/job-detail";
import ProfileSetupGate from "@/components/profile-setup-gate";
import QuestionSetsPage from "@/pages/question-sets";
import ScheduleInterviewPage from "@/pages/schedule-interview";
import PayrollPage from "@/pages/payroll";
import ReportsPage from "@/pages/reports";
import ProfilePage from "@/pages/profile";
import OnboardingPage from "@/pages/onboarding";
import IdCardsPage from "@/pages/id-cards";
import LegalPage from "@/pages/legal-page";
import SchedulesPage from "@/pages/schedules";
import AssetsPage from "@/pages/assets";
import AuditLogPage from "@/pages/audit-log";
import OffboardingPage from "@/pages/offboarding";
import InboxPage from "@/pages/inbox";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/privacy-policy" component={() => <LegalPage type="privacy" />} />
      <Route path="/terms-conditions" component={() => <LegalPage type="terms" />} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/job-posting" component={JobPostingPage} />
      <Route path="/job-posting/:id" component={JobPostingDetailPage} />
      <Route path="/talent" component={TalentPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/smp-contracts" component={SMPContractsPage} />
      <Route path="/workforce" component={WorkforcePage} />
      <Route path="/interviews" component={InterviewsPage} />
      <Route path="/interviews/schedule" component={ScheduleInterviewPage} />
      <Route path="/interviews/:id/candidates" component={InterviewCandidatesPage} />
      <Route path="/automation" component={AutomationPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/documentation" component={DocumentationPage} />
      <Route path="/question-sets" component={QuestionSetsPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/id-cards" component={IdCardsPage} />
      <Route path="/schedules" component={SchedulesPage} />
      <Route path="/assets" component={AssetsPage} />
      <Route path="/offboarding" component={OffboardingPage} />
      <Route path="/audit-log" component={AuditLogPage} />
      <Route path="/inbox" component={InboxPage} />
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
