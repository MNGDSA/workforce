import * as SQLite from 'expo-sqlite';
import type { AttendanceSubmission } from '../types';

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
      gps_lat REAL NOT NULL,
      gps_lng REAL NOT NULL,
      gps_accuracy REAL,
      timestamp TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      server_id TEXT,
      server_status TEXT,
      flag_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT
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

  await database.runAsync(
    `INSERT INTO attendance_submissions 
     (id, workforce_id, photo_path, photo_base64, gps_lat, gps_lng, gps_accuracy, timestamp, sync_status, retry_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [id, params.workforceId, params.photoPath, params.photoBase64, params.gpsLat, params.gpsLng, params.gpsAccuracy, params.timestamp, now]
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

export async function getPendingSubmissions(): Promise<AttendanceSubmission[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM attendance_submissions WHERE sync_status IN ('pending', 'failed') ORDER BY created_at ASC`
  );
  return rows.map(mapRow);
}

export async function getAllSubmissions(workforceId: string, limit = 50): Promise<AttendanceSubmission[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM attendance_submissions WHERE workforce_id = ? ORDER BY created_at DESC LIMIT ?`,
    [workforceId, limit]
  );
  return rows.map(mapRow);
}

export async function getTodaySubmission(workforceId: string): Promise<AttendanceSubmission | null> {
  const database = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM attendance_submissions WHERE workforce_id = ? AND timestamp LIKE ? ORDER BY created_at DESC LIMIT 1`,
    [workforceId, `${today}%`]
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function updateSubmissionSyncStatus(
  id: string,
  status: AttendanceSubmission['syncStatus'],
  extra?: { serverId?: string; serverStatus?: string; flagReason?: string; syncedAt?: string }
): Promise<void> {
  const database = await getDatabase();
  const sets: string[] = ['sync_status = ?'];
  const values: any[] = [status];

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

export async function getPendingCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM attendance_submissions WHERE sync_status IN ('pending', 'failed')`
  );
  return result?.count ?? 0;
}

function mapRow(row: any): AttendanceSubmission {
  return {
    id: row.id,
    workforceId: row.workforce_id,
    photoPath: row.photo_path,
    photoBase64: row.photo_base64,
    gpsLat: row.gps_lat,
    gpsLng: row.gps_lng,
    gpsAccuracy: row.gps_accuracy,
    timestamp: row.timestamp,
    syncStatus: row.sync_status,
    serverId: row.server_id,
    serverStatus: row.server_status,
    flagReason: row.flag_reason,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
}
