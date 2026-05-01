import * as authValidation from "./auth-validation";
import * as candidatePortalLogin from "./candidate-portal-login";
import * as profileSetupGate from "./profile-setup-gate";
import * as candidatePortalMainView from "./candidate-portal-main-view";
import * as candidatePortalFlow from "./candidate-portal-flow";
import * as candidatePhotoManagement from "./candidate-photo-management";
import * as photoUploadOutageToast from "./photo-upload-outage-toast";
import * as candidatePhotoRotationToast from "./candidate-photo-rotation-toast";
import * as inboxAttendanceReview from "./inbox-attendance-review";
import * as geofenceManagement from "./geofence-management";
import * as jobPostingImportRemoved from "./job-posting-import-removed";
import * as jobPostingApplicantsSortable from "./job-posting-applicants-sortable";
import * as talentFilterBar from "./talent-filter-bar";

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
  candidatePhotoRotationToast,
  inboxAttendanceReview,
  geofenceManagement,
  jobPostingImportRemoved,
  jobPostingApplicantsSortable,
  talentFilterBar,
];

export {
  authValidation,
  candidatePortalLogin,
  profileSetupGate,
  candidatePortalMainView,
  candidatePortalFlow,
  candidatePhotoManagement,
  photoUploadOutageToast,
  candidatePhotoRotationToast,
  inboxAttendanceReview,
  geofenceManagement,
  jobPostingImportRemoved,
  jobPostingApplicantsSortable,
  talentFilterBar,
};
