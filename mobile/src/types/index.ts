export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  fullName: string | null;
  phone: string | null;
  nationalId: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface Candidate {
  id: string;
  userId: string | null;
  fullNameEn: string;
  fullNameAr: string | null;
  phone: string | null;
  nationalId: string | null;
  photoUrl: string | null;
  status: string;
}

export interface WorkforceRecord {
  id: string;
  employeeNumber: string;
  candidateId: string;
  employmentType: 'individual' | 'smp';
  salary: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  eventName: string | null;
  jobTitle: string | null;
}

export interface ShiftInfo {
  shiftName: string;
  startTime: string;
  endTime: string;
  templateName: string;
}

export interface ScheduleAssignment {
  id: string;
  templateId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
}

export interface ScheduleResponse {
  assignment: ScheduleAssignment | null;
  template: ScheduleTemplate | null;
}

export interface GeofenceZone {
  id: string;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: number;
  polygon: Array<{ lat: number; lng: number }> | null;
  isActive: boolean;
}

export interface AttendanceSubmission {
  id: string;
  workforceId: string;
  photoPath: string;
  photoBase64: string | null;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number | null;
  timestamp: string;
  syncStatus: SyncStatus;
  serverId: string | null;
  serverStatus: string | null;
  flagReason: string | null;
  retryCount: number;
  createdAt: string;
  syncedAt: string | null;
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'verified' | 'flagged' | 'failed';

export interface LoginResponse {
  user: User;
  candidate: Candidate | null;
}

export interface UploadResult {
  submission: { id: string; status: string };
  verification: { status: string; flagReason: string | null } | null;
}

export type AttendanceStatus = 'not_marked' | 'pending' | 'syncing' | 'synced' | 'verified' | 'flagged' | 'failed';

export interface SqliteRow {
  id: string;
  workforce_id: string;
  photo_path: string;
  photo_base64: string | null;
  gps_lat: number;
  gps_lng: number;
  gps_accuracy: number | null;
  timestamp: string;
  sync_status: string;
  server_id: string | null;
  server_status: string | null;
  flag_reason: string | null;
  retry_count: number;
  created_at: string;
  synced_at: string | null;
}

export interface FormDataPhoto {
  uri: string;
  name: string;
  type: string;
}
