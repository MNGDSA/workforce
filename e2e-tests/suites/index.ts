import * as authValidation from "./auth-validation";
import * as candidatePortalLogin from "./candidate-portal-login";
import * as profileSetupGate from "./profile-setup-gate";
import * as candidatePortalMainView from "./candidate-portal-main-view";
import * as candidatePortalFlow from "./candidate-portal-flow";
import * as candidatePhotoManagement from "./candidate-photo-management";
import * as photoUploadOutageToast from "./photo-upload-outage-toast";
import * as inboxAttendanceReview from "./inbox-attendance-review";
import * as geofenceManagement from "./geofence-management";
import * as jobPostingImportRemoved from "./job-posting-import-removed";

export type TestSuite = {
  name: string;
  testPlan: string;
  technicalDocs: string;
};

export const allSuites: TestSuite[] = [
  authValidation,
  candidatePortalLogin,
  profileSetupGate,
  candidatePortalMainView,
  candidatePortalFlow,
  candidatePhotoManagement,
  photoUploadOutageToast,
  inboxAttendanceReview,
  geofenceManagement,
  jobPostingImportRemoved,
];

export {
  authValidation,
  candidatePortalLogin,
  profileSetupGate,
  candidatePortalMainView,
  candidatePortalFlow,
  candidatePhotoManagement,
  photoUploadOutageToast,
  inboxAttendanceReview,
  geofenceManagement,
  jobPostingImportRemoved,
};
