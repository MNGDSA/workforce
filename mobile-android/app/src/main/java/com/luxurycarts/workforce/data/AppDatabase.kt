package com.luxurycarts.workforce.data

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "attendance_submissions")
data class AttendanceEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workforce_id") val workforceId: String,
    @ColumnInfo(name = "attendance_date") val attendanceDate: String,
    @ColumnInfo(name = "encrypted_timestamp") val encryptedTimestamp: String,
    @ColumnInfo(name = "encrypted_gps_lat") val encryptedGpsLat: String,
    @ColumnInfo(name = "encrypted_gps_lng") val encryptedGpsLng: String,
    @ColumnInfo(name = "gps_accuracy") val gpsAccuracy: Float? = null,
    @ColumnInfo(name = "encrypted_photo_path") val encryptedPhotoPath: String,
    @ColumnInfo(name = "sync_status") val syncStatus: String = "pending",
    @ColumnInfo(name = "server_id") val serverId: String? = null,
    @ColumnInfo(name = "flag_reason") val flagReason: String? = null,
    @ColumnInfo(name = "retry_count") val retryCount: Int = 0,
    @ColumnInfo(name = "owner_workforce_id") val ownerWorkforceId: String,
    @ColumnInfo(name = "review_notes") val reviewNotes: String? = null,
    @ColumnInfo(name = "rekognition_confidence") val rekognitionConfidence: String? = null,
    @ColumnInfo(name = "mock_location_detected") val mockLocationDetected: Boolean = false,
    @ColumnInfo(name = "is_emulator") val isEmulator: Boolean = false,
    @ColumnInfo(name = "root_detected") val rootDetected: Boolean = false,
    @ColumnInfo(name = "location_provider") val locationProvider: String? = null,
    @ColumnInfo(name = "device_fingerprint") val deviceFingerprint: String? = null,
    @ColumnInfo(name = "ntp_timestamp") val ntpTimestamp: String? = null,
    @ColumnInfo(name = "system_clock_timestamp") val systemClockTimestamp: String? = null,
    @ColumnInfo(name = "last_ntp_sync_at") val lastNtpSyncAt: String? = null,
)

@Dao
interface AttendanceDao {

    @Query("SELECT * FROM attendance_submissions WHERE owner_workforce_id = :workforceId ORDER BY attendance_date DESC LIMIT :limit")
    fun getSubmissions(workforceId: String, limit: Int = 100): Flow<List<AttendanceEntity>>

    @Query("SELECT * FROM attendance_submissions WHERE sync_status = 'pending' AND owner_workforce_id = :workforceId ORDER BY attendance_date ASC")
    suspend fun getPending(workforceId: String): List<AttendanceEntity>

    @Query("SELECT COUNT(*) FROM attendance_submissions WHERE sync_status = 'pending' AND owner_workforce_id = :workforceId")
    fun getPendingCount(workforceId: String): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: AttendanceEntity)

    @Query("UPDATE attendance_submissions SET sync_status = :status, server_id = :serverId, flag_reason = :flagReason, rekognition_confidence = :rekognitionConfidence WHERE id = :id")
    suspend fun updateSyncResult(id: String, status: String, serverId: String?, flagReason: String?, rekognitionConfidence: String? = null)

    @Query("UPDATE attendance_submissions SET retry_count = retry_count + 1 WHERE id = :id")
    suspend fun incrementRetry(id: String)

    @Query("DELETE FROM attendance_submissions WHERE sync_status IN ('synced', 'verified') AND attendance_date < :cutoffDate AND owner_workforce_id = :workforceId")
    suspend fun purgeOld(workforceId: String, cutoffDate: String)

    @Query("SELECT server_id FROM attendance_submissions WHERE server_id IS NOT NULL AND sync_status IN ('flagged', 'pending_review') AND owner_workforce_id = :workforceId")
    suspend fun getServerIdsForStatusCheck(workforceId: String): List<String>

    @Query("UPDATE attendance_submissions SET sync_status = :status, flag_reason = :flagReason, review_notes = :reviewNotes, rekognition_confidence = :rekognitionConfidence WHERE server_id = :serverId")
    suspend fun updateStatusByServerId(serverId: String, status: String, flagReason: String?, reviewNotes: String?, rekognitionConfidence: String? = null)

    @Query("DELETE FROM attendance_submissions WHERE owner_workforce_id = :workforceId")
    suspend fun deleteAllForUser(workforceId: String)
}

@Database(entities = [AttendanceEntity::class], version = 6, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun attendanceDao(): AttendanceDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "workforce.db",
                ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
            }
        }
    }
}
