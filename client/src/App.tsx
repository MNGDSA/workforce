import { Switch, Route } from "wouter";
import { useTranslation } from "react-i18next";
import { DirectionProvider } from "@radix-ui/react-direction";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import ActivatePage from "@/pages/activate";
import Dashboard from "@/pages/dashboard";
import TalentPage from "@/pages/talent";
import EventsPage from "@/pages/events";
import SMPCompaniesPage from "@/pages/smp-companies";
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
import { Redirect } from "wouter";
import AssetsPage from "@/pages/assets";
import AuditLogPage from "@/pages/audit-log";
import OffboardingPage from "@/pages/offboarding";
import InboxPage from "@/pages/inbox";
import GeofencesPage from "@/pages/geofences";
import DepartmentsPage from "@/pages/departments";
import BroadcastPage from "@/pages/broadcast";
import OrgChartPage from "@/pages/org-chart";
import { RequireAdmin, RequireCandidate } from "@/lib/auth-guard";

const admin = (Component: React.ComponentType<any>) => (props: any) => (
  <RequireAdmin><Component {...props} /></RequireAdmin>
);

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/privacy-policy" component={() => <LegalPage type="privacy" />} />
      <Route path="/terms-conditions" component={() => <LegalPage type="terms" />} />
      <Route path="/jobs/:id" component={JobDetailPage} />

      {/* Candidate-only portal */}
      <Route path="/candidate-portal" component={() => (
        <RequireCandidate><ProfileSetupGate><CandidatePortal /></ProfileSetupGate></RequireCandidate>
      )} />

      {/* Admin-only (any non-candidate role with a session) */}
      <Route path="/dashboard" component={admin(Dashboard)} />
      <Route path="/job-posting" component={admin(JobPostingPage)} />
      <Route path="/job-posting/:id" component={admin(JobPostingDetailPage)} />
      <Route path="/talent" component={admin(TalentPage)} />
      <Route path="/events" component={admin(EventsPage)} />
      <Route path="/smp-companies" component={admin(SMPCompaniesPage)} />
      <Route path="/smp-contracts">{() => <Redirect to="/smp-companies" />}</Route>
      <Route path="/workforce" component={admin(WorkforcePage)} />
      <Route path="/interviews" component={admin(InterviewsPage)} />
      <Route path="/interviews/schedule" component={admin(ScheduleInterviewPage)} />
      <Route path="/interviews/:id/candidates" component={admin(InterviewCandidatesPage)} />
      <Route path="/automation" component={admin(AutomationPage)} />
      <Route path="/notifications" component={admin(NotificationsPage)} />
      <Route path="/settings" component={admin(SettingsPage)} />
      <Route path="/documentation" component={admin(DocumentationPage)} />
      <Route path="/question-sets" component={admin(QuestionSetsPage)} />
      <Route path="/payroll" component={admin(PayrollPage)} />
      <Route path="/reports" component={admin(ReportsPage)} />
      <Route path="/profile" component={admin(ProfilePage)} />
      <Route path="/onboarding" component={admin(OnboardingPage)} />
      <Route path="/id-cards" component={admin(IdCardsPage)} />
      <Route path="/attendance" component={admin(SchedulesPage)} />
      <Route path="/schedules">{() => <Redirect to="/attendance" />}</Route>
      <Route path="/assets" component={admin(AssetsPage)} />
      <Route path="/offboarding" component={admin(OffboardingPage)} />
      <Route path="/audit-log" component={admin(AuditLogPage)} />
      <Route path="/inbox" component={admin(InboxPage)} />
      <Route path="/geofences" component={admin(GeofencesPage)} />
      <Route path="/departments" component={admin(DepartmentsPage)} />
      <Route path="/broadcast" component={admin(BroadcastPage)} />
      <Route path="/org-chart" component={admin(OrgChartPage)} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { i18n } = useTranslation();
  const dir = (i18n.dir() as "ltr" | "rtl") ?? "ltr";
  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={dir}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}

export default App;
