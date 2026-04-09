import * as SecureStore from 'expo-secure-store';

const API_BASE_URL_KEY = 'workforce_api_url';
const SESSION_TOKEN_KEY = 'workforce_session';
const USER_DATA_KEY = 'workforce_user';
const WORKFORCE_DATA_KEY = 'workforce_record';

let baseUrl = '';

export async function getBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  const stored = await SecureStore.getItemAsync(API_BASE_URL_KEY);
  baseUrl = stored || 'https://your-workforce-app.replit.app';
  return baseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  baseUrl = url.replace(/\/$/, '');
  await SecureStore.setItemAsync(API_BASE_URL_KEY, baseUrl);
}

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_DATA_KEY);
  await SecureStore.deleteItemAsync(WORKFORCE_DATA_KEY);
}

export async function storeUserData(data: { user: any; candidate: any }): Promise<void> {
  await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(data));
}

export async function getUserData(): Promise<{ user: any; candidate: any } | null> {
  const raw = await SecureStore.getItemAsync(USER_DATA_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function storeWorkforceData(data: any): Promise<void> {
  await SecureStore.setItemAsync(WORKFORCE_DATA_KEY, JSON.stringify(data));
}

export async function getWorkforceData(): Promise<any | null> {
  const raw = await SecureStore.getItemAsync(WORKFORCE_DATA_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = any>(
  method: string,
  path: string,
  body?: any,
  options?: { timeout?: number; formData?: boolean }
): Promise<T> {
  const url = `${await getBaseUrl()}${path}`;
  const token = await getSessionToken();
  const timeout = options?.timeout || 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let fetchBody: any;
    if (options?.formData && body instanceof FormData) {
      fetchBody = body;
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(errorBody.message || `HTTP ${response.status}`, response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  } finally {
    clearTimeout(timer);
  }
}

export async function login(identifier: string, password: string) {
  const result = await apiRequest<{ user: any; candidate: any }>(
    'POST', '/api/auth/login', { identifier, password }
  );

  await storeUserData(result);

  if (result.candidate) {
    try {
      const workforceRecords = await apiRequest<any[]>(
        'GET', `/api/portal/workforce/${result.candidate.id}`
      );
      if (workforceRecords && workforceRecords.length > 0) {
        const activeRecord = workforceRecords.find((r: any) => r.isActive);
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

export async function uploadAttendancePhoto(
  workforceId: string,
  photoUri: string,
  gpsLat: number,
  gpsLng: number,
  gpsAccuracy: number | null,
  clientTimestamp: string
): Promise<any> {
  const formData = new FormData();
  formData.append('workforceId', workforceId);
  formData.append('gpsLat', String(gpsLat));
  formData.append('gpsLng', String(gpsLng));
  if (gpsAccuracy !== null) formData.append('gpsAccuracy', String(gpsAccuracy));
  formData.append('clientTimestamp', clientTimestamp);

  formData.append('photo', {
    uri: photoUri,
    name: `attendance_${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  return apiRequest(
    'POST',
    '/api/attendance-mobile/submit',
    formData,
    { formData: true, timeout: 30000 }
  );
}

export async function fetchGeofenceZones() {
  return apiRequest<any[]>('GET', '/api/geofence-zones');
}

export async function fetchShiftInfo(workforceId: string) {
  return apiRequest<any>('GET', `/api/portal/schedule/${workforceId}`);
}
