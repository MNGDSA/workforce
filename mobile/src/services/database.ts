import * as SQLite from 'expo-sqlite';
import { encryptField, decryptField } from './encryption';
import type { AttendanceSubmission, SyncStatus, SqliteRow } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('workforce_attendance.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS attendance_submissions (
      id TEXT PRIMARY KEY,
      workforce_id TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      photo_base64 TEXT,
      gps_lat TEXT NOT NULL,
      gps_lng TEXT NOT NULL,
      gps_accuracy TEXT,
      timestamp TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      server_id TEXT,
      server_status TEXT,
      flag_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      encrypted INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_sync_status ON attendance_submissions(sync_status);
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON attendance_submissions(created_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_workforce_id ON attendance_submissions(workforce_id);
  `);

  return db;
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `local_${Date.now()}_${result}`;
}

export async function saveSubmission(params: {
  workforceId: string;
  photoPath: string;
  photoBase64: string | null;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number | null;
  timestamp: string;
}): Promise<AttendanceSubmission> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  const encryptedPhotoPath = await encryptField(params.photoPath);
  const encryptedWorkforceId = await encryptField(params.workforceId);
  const encryptedGpsLat = await encryptField(String(params.gpsLat));
  const encryptedGpsLng = await encryptField(String(params.gpsLng));
  const encryptedGpsAccuracy = params.gpsAccuracy !== null ? await encryptField(String(params.gpsAccuracy)) : null;
  const encryptedTimestamp = await encryptField(params.timestamp);

  await database.runAsync(
    `INSERT INTO attendance_submissions 
     (id, workforce_id, photo_path, photo_base64, gps_lat, gps_lng, gps_accuracy, timestamp, sync_status, retry_count, created_at, encrypted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, 1)`,
    [id, encryptedWorkforceId, encryptedPhotoPath, params.photoBase64, encryptedGpsLat, encryptedGpsLng, encryptedGpsAccuracy, encryptedTimestamp, now]
  );

  return {
    id,
    workforceId: params.workforceId,
    photoPath: params.photoPath,
    photoBase64: params.photoBase64,
    gpsLat: params.gpsLat,
    gpsLng: params.gpsLng,
    gpsAccuracy: params.gpsAccuracy,
    timestamp: params.timestamp,
    syncStatus: 'pending',
    serverId: null,
    serverStatus: null,
    flagReason: null,
    retryCount: 0,
    createdAt: now,
    syncedAt: null,
  };
}

async function decryptRow(row: SqliteRow & { encrypted?: number }): Promise<AttendanceSubmission> {
  const isEncrypted = row.encrypted === 1;
  const workforceId = isEncrypted ? await decryptField(row.workforce_id) : row.workforce_id;
  const photoPath = isEncrypted ? await decryptField(row.photo_path) : row.photo_path;
  const gpsLatStr = isEncrypted ? await decryptField(row.gps_lat) : row.gps_lat;
  const gpsLngStr = isEncrypted ? await decryptField(row.gps_lng) : row.gps_lng;
  const gpsAccStr = row.gps_accuracy && isEncrypted ? await decryptField(row.gps_accuracy) : row.gps_accuracy;
  const timestamp = isEncrypted ? await decryptField(row.timestamp) : row.timestamp;

  return {
    id: row.id,
    workforceId,
    photoPath,
    photoBase64: row.photo_base64,
    gpsLat: parseFloat(gpsLatStr) || 0,
    gpsLng: parseFloat(gpsLngStr) || 0,
    gpsAccuracy: gpsAccStr ? parseFloat(gpsAccStr) || null : null,
    timestamp,
    syncStatus: row.sync_status as SyncStatus,
    serverId: row.server_id,
    serverStatus: row.server_status,
    flagReason: row.flag_reason,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
}

export async function getPendingSubmissions(): Promise<AttendanceSubmission[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SqliteRow & { encrypted: number }>(
    `SELECT * FROM attendance_submissions WHERE sync_status IN ('pending', 'failed') ORDER BY created_at ASC`
  );
  return Promise.all(rows.map(decryptRow));
}

export async function getAllSubmissions(workforceId: string, limit = 50): Promise<AttendanceSubmission[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SqliteRow & { encrypted: number }>(
    `SELECT * FROM attendance_submissions ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  const all = await Promise.all(rows.map(decryptRow));
  return all.filter(s => s.workforceId === workforceId);
}

export async function getTodaySubmission(workforceId: string): Promise<AttendanceSubmission | null> {
  const database = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const rows = await database.getAllAsync<SqliteRow & { encrypted: number }>(
    `SELECT * FROM attendance_submissions WHERE timestamp LIKE ? ORDER BY created_at DESC LIMIT 10`,
    [`${today}%`]
  );
  const decrypted = await Promise.all(rows.map(decryptRow));
  return decrypted.find(s => s.workforceId === workforceId) || null;
}

export async function checkDuplicateDate(workforceId: string, dateStr: string): Promise<boolean> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SqliteRow & { encrypted: number }>(
    `SELECT * FROM attendance_submissions WHERE timestamp LIKE ? AND sync_status NOT IN ('failed') LIMIT 20`,
    [`${dateStr}%`]
  );
  const decrypted = await Promise.all(rows.map(decryptRow));
  return decrypted.some(s => s.workforceId === workforceId);
}

export async function updateSubmissionSyncStatus(
  id: string,
  status: SyncStatus,
  extra?: { serverId?: string; serverStatus?: string; flagReason?: string; syncedAt?: string }
): Promise<void> {
  const database = await getDatabase();
  const sets: string[] = ['sync_status = ?'];
  const values: (string | number | null)[] = [status];

  if (extra?.serverId !== undefined) { sets.push('server_id = ?'); values.push(extra.serverId); }
  if (extra?.serverStatus !== undefined) { sets.push('server_status = ?'); values.push(extra.serverStatus); }
  if (extra?.flagReason !== undefined) { sets.push('flag_reason = ?'); values.push(extra.flagReason); }
  if (extra?.syncedAt !== undefined) { sets.push('synced_at = ?'); values.push(extra.syncedAt); }

  values.push(id);
  await database.runAsync(
    `UPDATE attendance_submissions SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
}

export async function incrementRetryCount(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE attendance_submissions SET retry_count = retry_count + 1 WHERE id = ?`,
    [id]
  );
}

export async function purgeOldSyncedSubmissions(daysOld = 30): Promise<number> {
  const database = await getDatabase();
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const result = await database.runAsync(
    `DELETE FROM attendance_submissions WHERE sync_status IN ('synced', 'verified') AND synced_at IS NOT NULL AND synced_at < ?`,
    [cutoff]
  );
  return result.changes;
}

export async function purgeAllLocalData(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM attendance_submissions`);
}

export async function getPendingCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM attendance_submissions WHERE sync_status IN ('pending', 'failed')`
  );
  return result?.count ?? 0;
}
