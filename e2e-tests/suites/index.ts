import * as authValidation from "./auth-validation";
import * as candidatePortalLogin from "./candidate-portal-login";
import * as candidatePortalFlow from "./candidate-portal-flow";
import * as inboxAttendanceReview from "./inbox-attendance-review";
import * as geofenceManagement from "./geofence-management";

export type TestSuite = {
  name: string;
  testPlan: string;
  technicalDocs: string;
};

export const allSuites: TestSuite[] = [
  authValidation,
  candidatePortalLogin,
  candidatePortalFlow,
  inboxAttendanceReview,
  geofenceManagement,
];

export {
  authValidation,
  candidatePortalLogin,
  candidatePortalFlow,
  inboxAttendanceReview,
  geofenceManagement,
};
