package com.luxurycarts.workforce.data

import android.content.Context
import android.util.Log
import net.sqlcipher.database.SQLiteDatabase
import java.io.File

/**
 * One-time, on-cold-start migration of the legacy plaintext Room database
 * (`workforce.db`) into a SQLCipher-encrypted database at the same path.
 *
 * Idempotent: a `migrated_v1=true` flag in [PREFS] short-circuits every
 * call after the first successful migration, so we pay zero cost on
 * subsequent cold starts.
 *
 * Failure model: the migration is bracketed by a backup-rename so a crash
 * mid-migration restores the original plain DB on the next launch instead
 * of leaving the user with an empty schema. The flag is only set after
 * successful encrypted-open verification.
 */
internal object DatabaseEncryptionMigration {
    private const val TAG = "DBEncMigration"
    private const val PREFS = "db_enc_state"
    private const val FLAG_MIGRATED = "migrated_v1"

    /**
     * Ensure the on-disk DB at [dbName] is SQLCipher-encrypted with
     * [passphrase]. Safe to call on every cold start; the actual export
     * runs at most once per install.
     *
     * Throws if the migration cannot complete and rollback also fails — at
     * that point the DB is in an undefined state and the caller is expected
     * to surface the error rather than silently swallow it.
     */
    fun ensureMigrated(context: Context, dbName: String, passphrase: ByteArray) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(FLAG_MIGRATED, false)) return

        val dbFile = context.getDatabasePath(dbName)
        if (!dbFile.exists()) {
            // Fresh install — Room will create the encrypted DB on first
            // open via SupportFactory; nothing to migrate.
            prefs.edit().putBoolean(FLAG_MIGRATED, true).apply()
            return
        }

        if (!isLikelyPlainSqlite(dbFile)) {
            // Already encrypted (likely a re-install on a backup that
            // already went through this migration on a prior run, or a
            // Robolectric-shaped header we cannot read). Mark flag and
            // move on — opening with SQLCipher will validate or fail
            // loudly downstream.
            prefs.edit().putBoolean(FLAG_MIGRATED, true).apply()
            return
        }

        SQLiteDatabase.loadLibs(context)

        // Step A: checkpoint WAL into the main file so the export below
        // sees every committed transaction even if `-wal`/`-shm` are
        // never carried into the migration. We use the framework
        // (plaintext) helper for this — the file is still plain SQLite
        // at this point, so framework SQLite can open it.
        try {
            android.database.sqlite.SQLiteDatabase.openDatabase(
                dbFile.absolutePath,
                null,
                android.database.sqlite.SQLiteDatabase.OPEN_READWRITE,
            ).use { plain ->
                plain.rawQuery("PRAGMA wal_checkpoint(TRUNCATE);", null).use { c -> c.moveToFirst() }
            }
        } catch (e: Exception) {
            // If the checkpoint fails, we ALSO try to carry the WAL/SHM
            // siblings across so committed-but-uncheckpointed pages are
            // not silently dropped. We do not abort here because a
            // missing/corrupt WAL is recoverable in the export step.
            Log.w(TAG, "wal_checkpoint failed, will carry siblings: ${e.javaClass.simpleName}")
        }

        // Step B: rename plain DB AND its WAL/SHM siblings. Crucially the
        // siblings must be at `${backup}-wal` and `${backup}-shm` so
        // SQLite recognises them when we ATTACH the backup as plaintext —
        // otherwise the WAL state is invisible to the export.
        val backup = File(dbFile.parentFile, "$dbName.preenc")
        if (backup.exists()) backup.delete()
        listOf("-wal", "-shm").forEach { suffix ->
            File(dbFile.parentFile, "${backup.name}$suffix")
                .takeIf { it.exists() }
                ?.delete()
        }

        if (!dbFile.renameTo(backup)) {
            throw IllegalStateException("DB encryption migration: failed to rename plain DB to backup")
        }
        listOf("-wal", "-shm").forEach { suffix ->
            val from = File(dbFile.parentFile, "$dbName$suffix")
            if (from.exists()) {
                from.renameTo(File(dbFile.parentFile, "${backup.name}$suffix"))
            }
        }

        try {
            // The legacy `net.sqlcipher.database.SQLiteDatabase` API only
            // exposes String / char[] overloads — there is no byte[] form
            // for openDatabase / openOrCreateDatabase (that exists only on
            // SupportFactory, which is why AppDatabase wires the raw
            // ByteArray straight into Room).
            //
            // To stay byte-perfect-equivalent to the SupportFactory key,
            // we use SQLCipher's raw-key syntax: a String of the form
            // "x'<64-hex-chars>'". SQLCipher detects the prefix, skips
            // its KDF, and uses the bytes directly — so the key here
            // matches the key Room will derive on next open.
            val rawKeyHexPragma = passphrase.toRawKeyPragmaString()
            val encrypted = SQLiteDatabase.openOrCreateDatabase(
                dbFile.absolutePath,
                rawKeyHexPragma,
                null,
            )
            try {
                encrypted.rawExecSQL(
                    "ATTACH DATABASE '${backup.absolutePath}' AS plaintext KEY '';"
                )
                // Copies schema and rows from plaintext into main (encrypted).
                encrypted.rawExecSQL("SELECT sqlcipher_export('main', 'plaintext');")
                // Preserve user_version so Room's schema-version probe sees
                // the right number and does not trigger destructive fallback.
                val cur = encrypted.rawQuery("PRAGMA plaintext.user_version;", null)
                val version = if (cur.moveToFirst()) cur.getInt(0) else 0
                cur.close()
                encrypted.rawExecSQL("PRAGMA user_version = $version;")
                encrypted.rawExecSQL("DETACH DATABASE plaintext;")
            } finally {
                encrypted.close()
            }

            // Verify: re-open encrypted using the same raw-key form, count
            // rows in attendance_submissions.
            val verify = SQLiteDatabase.openDatabase(
                dbFile.absolutePath,
                rawKeyHexPragma,
                null,
                SQLiteDatabase.OPEN_READONLY,
            )
            try {
                verify.rawQuery("SELECT count(*) FROM attendance_submissions", null).use { c ->
                    c.moveToFirst()
                    Log.i(TAG, "encrypted DB verified rows=${c.getInt(0)}")
                }
            } finally {
                verify.close()
            }

            // Success — MANDATORY plaintext-backup cleanup. If we cannot
            // delete the backup (e.g. SELinux denies, FS is read-only),
            // we must NOT set the migrated flag and must NOT leave
            // plaintext on disk. Throw so the next cold start retries.
            val toDelete = mutableListOf(backup) + listOf("-wal", "-shm").map {
                File(dbFile.parentFile, "${backup.name}$it")
            }
            val undeletable = toDelete.filter { it.exists() && !it.delete() }
            if (undeletable.isNotEmpty()) {
                throw IllegalStateException(
                    "plaintext backup cleanup failed: ${undeletable.size} file(s) remain"
                )
            }
            prefs.edit().putBoolean(FLAG_MIGRATED, true).apply()
        } catch (e: Exception) {
            Log.w(TAG, "encryption migration failed, rolling back: ${e.javaClass.simpleName}")
            // Rollback: drop any partial encrypted file, restore the plain
            // backup so the next cold start sees the user's data unharmed.
            try {
                if (dbFile.exists()) dbFile.delete()
                backup.renameTo(dbFile)
                listOf("-wal", "-shm").forEach { suffix ->
                    val pre = File(dbFile.parentFile, "${backup.name}$suffix")
                    if (pre.exists()) pre.renameTo(File(dbFile.parentFile, "$dbName$suffix"))
                }
            } catch (rollback: Exception) {
                Log.e(TAG, "rollback also failed: ${rollback.javaClass.simpleName}", rollback)
            }
            throw e
        }
    }

    /**
     * Render a raw key as SQLCipher's `PRAGMA key = "x'...'"` literal form.
     * This is the only way to feed raw key bytes through the legacy
     * `net.sqlcipher.database.SQLiteDatabase` open APIs (which expose only
     * String / char[] overloads) without going through SQLCipher's KDF and
     * therefore producing a different effective key than `SupportFactory`
     * would derive from the same byte[].
     */
    private fun ByteArray.toRawKeyPragmaString(): String {
        val hex = StringBuilder(size * 2)
        for (b in this) {
            hex.append(Character.forDigit((b.toInt() ushr 4) and 0x0F, 16))
            hex.append(Character.forDigit(b.toInt() and 0x0F, 16))
        }
        return "x'$hex'"
    }

    /**
     * SQLite plain files start with the ASCII magic `"SQLite format 3\u0000"`
     * (16 bytes). SQLCipher files have a random-looking header instead, so
     * the absence of this magic is a strong signal the file is encrypted.
     */
    private fun isLikelyPlainSqlite(file: File): Boolean {
        return try {
            file.inputStream().use { input ->
                val header = ByteArray(16)
                if (input.read(header) != 16) return false
                String(header, Charsets.US_ASCII).startsWith("SQLite format 3")
            }
        } catch (_: Exception) {
            false
        }
    }
}
