import * as SecureStore from 'expo-secure-store';
import type {
  User,
  Candidate,
  WorkforceRecord,
  LoginResponse,
  GeofenceZone,
  ShiftInfo,
  ScheduleResponse,
  UploadResult,
  FormDataPhoto,
} from '../types';

const API_BASE_URL_KEY = 'workforce_api_url';
const USER_DATA_KEY = 'workforce_user';
const WORKFORCE_DATA_KEY = 'workforce_record';
const SESSION_EXPIRY_KEY = 'workforce_session_expiry';

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

let baseUrl = '';
let logoutCallback: (() => void) | null = null;

export function setLogoutCallback(cb: () => void): void {
  logoutCallback = cb;
}

export async function getBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  const stored = await SecureStore.getItemAsync(API_BASE_URL_KEY);
  baseUrl = stored || 'https://api.yourcompany.com';
  return baseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  baseUrl = url.replace(/\/$/, '');
  await SecureStore.setItemAsync(API_BASE_URL_KEY, baseUrl);
}

async function refreshSessionExpiry(): Promise<void> {
  const expiry = String(Date.now() + SESSION_LIFETIME_MS);
  await SecureStore.setItemAsync(SESSION_EXPIRY_KEY, expiry);
}

export async function isSessionValid(): Promise<boolean> {
  const expiry = await SecureStore.getItemAsync(SESSION_EXPIRY_KEY);
  if (!expiry) return false;
  if (Date.now() > parseInt(expiry, 10)) {
    await clearSession();
    logoutCallback?.();
    return false;
  }
  return true;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY);
  await SecureStore.deleteItemAsync(USER_DATA_KEY);
  await SecureStore.deleteItemAsync(WORKFORCE_DATA_KEY);
}

export async function storeUserData(data: { user: User; candidate: Candidate | null }): Promise<void> {
  await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(data));
}

export async function getUserData(): Promise<{ user: User; candidate: Candidate | null } | null> {
  const raw = await SecureStore.getItemAsync(USER_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { user: User; candidate: Candidate | null };
  } catch {
    return null;
  }
}

export async function storeWorkforceData(data: WorkforceRecord): Promise<void> {
  await SecureStore.setItemAsync(WORKFORCE_DATA_KEY, JSON.stringify(data));
}

export async function getWorkforceData(): Promise<WorkforceRecord | null> {
  const raw = await SecureStore.getItemAsync(WORKFORCE_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkforceRecord;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown>,
  options?: { timeout?: number; formData?: boolean }
): Promise<T> {
  const url = `${await getBaseUrl()}${path}`;
  const timeout = options?.timeout || 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {};

    let fetchBody: BodyInit | undefined;
    if (options?.formData && body instanceof FormData) {
      fetchBody = body;
    } else if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
      credentials: 'include',
    });

    if (response.status === 401) {
      await clearSession();
      logoutCallback?.();
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!response.ok) {
      const errorBody: { message?: string } = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(errorBody.message || `HTTP ${response.status}`, response.status);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } finally {
    clearTimeout(timer);
  }
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const result = await apiRequest<LoginResponse>(
    'POST', '/api/auth/login', { identifier, password }
  );

  await refreshSessionExpiry();
  await storeUserData({ user: result.user, candidate: result.candidate });

  if (result.candidate) {
    try {
      const workforceRecords = await apiRequest<WorkforceRecord[]>(
        'GET', `/api/workforce/all-by-candidate/${result.candidate.id}`
      );
      if (workforceRecords && workforceRecords.length > 0) {
        const activeRecord = workforceRecords.find((r) => r.isActive);
        if (activeRecord) {
          await storeWorkforceData(activeRecord);
        }
      }
    } catch {
      // workforce data may not be available yet
    }
  }

  return result;
}

export async function checkSessionLocally(): Promise<boolean> {
  return isSessionValid();
}

export async function uploadAttendancePhoto(
  workforceId: string,
  photoUri: string,
  gpsLat: number,
  gpsLng: number,
  gpsAccuracy: number | null,
  clientTimestamp: string
): Promise<UploadResult> {
  const sessionValid = await checkSessionLocally();
  if (!sessionValid) {
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  const formData = new FormData();
  formData.append('workforceId', workforceId);
  formData.append('gpsLat', String(gpsLat));
  formData.append('gpsLng', String(gpsLng));
  if (gpsAccuracy !== null) formData.append('gpsAccuracy', String(gpsAccuracy));
  formData.append('clientTimestamp', clientTimestamp);

  const photoPayload: FormDataPhoto = {
    uri: photoUri,
    name: `attendance_${Date.now()}.jpg`,
    type: 'image/jpeg',
  };
  formData.append('photo', photoPayload as unknown as Blob);

  return apiRequest<UploadResult>(
    'POST',
    '/api/attendance-mobile/submit',
    formData,
    { formData: true, timeout: 30000 }
  );
}

export async function fetchGeofenceZones(): Promise<GeofenceZone[]> {
  return apiRequest<GeofenceZone[]>('GET', '/api/geofence-zones');
}

export async function fetchShiftInfo(workforceId: string): Promise<ShiftInfo | null> {
  try {
    const response = await apiRequest<ScheduleResponse>(
      'GET', `/api/portal/schedule/${workforceId}`
    );

    if (!response || !response.assignment) return null;

    return {
      shiftName: response.assignment.shiftName || 'Shift',
      startTime: response.assignment.startTime || '',
      endTime: response.assignment.endTime || '',
      templateName: response.template?.name || '',
    };
  } catch {
    return null;
  }
}

export interface PhotoQualityCheck {
  name: string;
  passed: boolean;
  tip?: string;
}

export interface PhotoQualityResult {
  passed: boolean;
  checks: PhotoQualityCheck[];
  qualityCheckSkipped?: boolean;
}

export class PhotoQualityError extends Error {
  qualityResult: PhotoQualityResult;
  constructor(message: string, qualityResult: PhotoQualityResult) {
    super(message);
    this.name = 'PhotoQualityError';
    this.qualityResult = qualityResult;
  }
}

export async function uploadProfilePhoto(
  candidateId: string,
  photoUri: string,
): Promise<UploadResult & { qualityResult?: PhotoQualityResult }> {
  const url = `${await getBaseUrl()}/api/candidates/${candidateId}/documents`;
  const formData = new FormData();
  const photoPayload: FormDataPhoto = {
    uri: photoUri,
    name: `profile_${Date.now()}.jpg`,
    type: 'image/jpeg',
  };
  formData.append('file', photoPayload as unknown as Blob);
  formData.append('docType', 'photo');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      credentials: 'include',
    });

    if (response.status === 422) {
      const body = await response.json().catch(() => ({ message: 'Photo quality check failed' }));
      throw new PhotoQualityError(
        body.message || 'Photo quality check failed',
        body.qualityResult || { passed: false, checks: [] },
      );
    }

    if (response.status === 401) {
      await clearSession();
      logoutCallback?.();
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(errorBody.message || `HTTP ${response.status}`, response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

export async function requestDataDeletion(identifier: string, password: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', '/api/portal/data-deletion-request', { identifier, password });
}
