import * as Network from 'expo-network';
import {
  getPendingSubmissions,
  updateSubmissionSyncStatus,
  incrementRetryCount,
  purgeOldSyncedSubmissions,
} from './database';
import { uploadAttendancePhoto, getWorkforceData } from './api';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

let isSyncing = false;
let syncListeners: Array<() => void> = [];

export function addSyncListener(fn: () => void) {
  syncListeners.push(fn);
  return () => { syncListeners = syncListeners.filter(l => l !== fn); };
}

function notifyListeners() {
  syncListeners.forEach(fn => fn());
}

function backoffDelay(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), 60000);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable);
  } catch {
    return false;
  }
}

export async function syncPendingSubmissions(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };

  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const pending = await getPendingSubmissions();
    const wf = await getWorkforceData();
    const workforceId = wf?.id;

    if (!workforceId || pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    for (const submission of pending) {
      if (submission.retryCount >= MAX_RETRIES) {
        await updateSubmissionSyncStatus(submission.id, 'failed', {
          flagReason: 'Max retries exceeded',
        });
        failed++;
        notifyListeners();
        continue;
      }

      try {
        await updateSubmissionSyncStatus(submission.id, 'syncing');
        notifyListeners();

        const result = await uploadAttendancePhoto(
          workforceId,
          submission.photoPath,
          submission.gpsLat,
          submission.gpsLng,
          submission.gpsAccuracy,
          submission.timestamp
        );

        const serverSubmission = result.submission;
        const verification = result.verification;

        const finalStatus = verification?.status === 'verified' ? 'verified'
          : verification?.status === 'flagged' ? 'flagged'
          : 'synced';

        await updateSubmissionSyncStatus(submission.id, finalStatus, {
          serverId: serverSubmission?.id,
          serverStatus: verification?.status,
          flagReason: verification?.flagReason || null,
          syncedAt: new Date().toISOString(),
        });

        synced++;
        notifyListeners();
      } catch (error) {
        await incrementRetryCount(submission.id);
        const delay = backoffDelay(submission.retryCount);
        await updateSubmissionSyncStatus(submission.id, 'failed', {
          flagReason: error instanceof Error ? error.message : 'Sync failed',
        });
        failed++;
        notifyListeners();

        await sleep(Math.min(delay, 5000));
      }
    }

    await purgeOldSyncedSubmissions(30);
  } finally {
    isSyncing = false;
  }

  return { synced, failed };
}

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(intervalMs = 30000): void {
  if (syncIntervalId) return;
  syncIntervalId = setInterval(async () => {
    const online = await isOnline();
    if (online) {
      await syncPendingSubmissions();
    }
  }, intervalMs);

  syncPendingSubmissions();
}

export function stopAutoSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
