import * as Network from 'expo-network';
import {
  getPendingSubmissions,
  updateSubmissionSyncStatus,
  incrementRetryCount,
  purgeOldSyncedSubmissions,
  checkDuplicateDate,
} from './database';
import { uploadAttendancePhoto, getWorkforceData } from './api';
import { ApiError } from './api';
import type { SyncStatus, UploadResult } from '../types';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

let isSyncing = false;
let syncListeners: Array<() => void> = [];

export function addSyncListener(fn: () => void): () => void {
  syncListeners.push(fn);
  return () => { syncListeners = syncListeners.filter(l => l !== fn); };
}

function notifyListeners(): void {
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

export async function syncPendingSubmissions(): Promise<{ synced: number; failed: number; skipped: number }> {
  if (isSyncing) return { synced: 0, failed: 0, skipped: 0 };

  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0, skipped: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const pending = await getPendingSubmissions();
    const wf = await getWorkforceData();
    const workforceId = wf?.id;

    if (!workforceId || pending.length === 0) {
      return { synced: 0, failed: 0, skipped: 0 };
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

      const dateStr = submission.timestamp.split('T')[0];
      const alreadySynced = await checkDuplicateDate(workforceId, dateStr);
      if (alreadySynced && submission.syncStatus === 'pending') {
        const existingSubmissions = await getPendingSubmissions();
        const otherSynced = existingSubmissions.some(
          s => s.id !== submission.id &&
            s.timestamp.startsWith(dateStr) &&
            (s.syncStatus === 'synced' || s.syncStatus === 'verified')
        );
        if (otherSynced) {
          await updateSubmissionSyncStatus(submission.id, 'failed', {
            flagReason: 'Duplicate: attendance already synced for this date',
          });
          skipped++;
          notifyListeners();
          continue;
        }
      }

      try {
        await updateSubmissionSyncStatus(submission.id, 'syncing');
        notifyListeners();

        const result: UploadResult = await uploadAttendancePhoto(
          workforceId,
          submission.photoPath,
          submission.gpsLat,
          submission.gpsLng,
          submission.gpsAccuracy,
          submission.timestamp
        );

        const verification = result.verification;

        let finalStatus: SyncStatus = 'synced';
        if (verification?.status === 'verified') finalStatus = 'verified';
        else if (verification?.status === 'flagged') finalStatus = 'flagged';

        await updateSubmissionSyncStatus(submission.id, finalStatus, {
          serverId: result.submission?.id,
          serverStatus: verification?.status ?? null,
          flagReason: verification?.flagReason ?? null,
          syncedAt: new Date().toISOString(),
        });

        synced++;
        notifyListeners();
      } catch (error) {
        await incrementRetryCount(submission.id);

        let flagReason = 'Sync failed';
        if (error instanceof ApiError) {
          if (error.status === 409) {
            flagReason = 'Server conflict: attendance already exists for this date';
            await updateSubmissionSyncStatus(submission.id, 'failed', { flagReason });
            skipped++;
            notifyListeners();
            continue;
          }
          flagReason = `Server error: ${error.message}`;
        } else if (error instanceof Error) {
          flagReason = error.message;
        }

        await updateSubmissionSyncStatus(submission.id, 'failed', { flagReason });
        failed++;
        notifyListeners();

        const delay = backoffDelay(submission.retryCount);
        await sleep(Math.min(delay, 5000));
      }
    }

    await purgeOldSyncedSubmissions(30);
  } finally {
    isSyncing = false;
  }

  return { synced, failed, skipped };
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
