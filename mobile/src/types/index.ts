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
  syncStatus: 'pending' | 'syncing' | 'synced' | 'verified' | 'flagged' | 'failed';
  serverId: string | null;
  serverStatus: string | null;
  flagReason: string | null;
  retryCount: number;
  createdAt: string;
  syncedAt: string | null;
}

export interface LoginResponse {
  user: User;
  candidate: Candidate | null;
}

export type AttendanceStatus = 'not_marked' | 'pending' | 'syncing' | 'synced' | 'verified' | 'flagged';
