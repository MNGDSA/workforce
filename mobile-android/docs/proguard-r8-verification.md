# ProGuard / R8 Release Build Verification

Task #84 closed several at-rest confidentiality gaps that depend on classes
surviving the R8 minification + resource-shrinking step of the release build.
This runbook is the manual verification you MUST run **once per Play Store
upload** to prove that the release APK still:

1. Loads the SQLCipher native library and decrypts the Room DB.
2. Wraps / unwraps the SQLCipher passphrase via `EncryptionService` against
   the AndroidKeyStore.
3. Scrubs telemetry (`SyncTelemetry.scrubMessage`) before writing to disk
   or Logcat.
4. Applies `FLAG_SECURE` on Capture / History / Home.
5. Honours the certificate pin emitted into BuildConfig (Task #43).

R8 is configured via `app/proguard-rules.pro`. The rules already keep:

- `com.luxurycarts.workforce.data.**` — DAOs, entities, telemetry, key
  manager, encryption migration.
- `com.luxurycarts.workforce.services.**` — encryption, NTP, sync worker,
  device trust manager.
- `androidx.security.crypto.**` — EncryptedSharedPreferences master-key
  surface (1.1.0-alpha06).
- Retrofit, OkHttp, Gson, Room runtime, WorkManager.

## Pre-flight

```bash
cd mobile-android
./gradlew clean :app:assembleRelease   # produces app/build/outputs/apk/release/
./gradlew :app:test                    # runs SyncTelemetryScrubTest
```

`./gradlew :app:test` MUST pass before publishing — it is the only automated
gate that proves the telemetry scrubber survives R8.

## Smoke checklist on a real device

Install the **release** APK (not debug) on a test device:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Then walk this checklist with `adb logcat -s AttendanceSync DBEncMigration`:

- [ ] **First launch on a clean install** — `DBEncMigration` logs nothing
      (no legacy DB to migrate). `AttendanceSync` shows `db_open`
      events with the encrypted DB version.
- [ ] **Upgrade install over a pre-Task-#84 build** — `DBEncMigration`
      logs `encrypted DB verified rows=N` exactly once. The original
      `workforce.db.preenc` is removed by the end of the first cold start.
- [ ] **Force-stop + relaunch** — no migration runs the second time
      (`migrated_v1` flag is set).
- [ ] **Capture a submission, then open History** — pressing the recents
      button shows a blank app card (FLAG_SECURE working).
- [ ] **Take a screenshot on the History screen** — the OS shows
      "Couldn't capture screenshot" toast.
- [ ] **Trigger a sync failure** by toggling airplane mode mid-upload —
      Logcat lines tagged `AttendanceSync` MUST NOT contain any of:
      - the literal string `/data/data/`,
      - the literal string `workforce_encryption_key`,
      - any base64 blob ≥48 chars.
- [ ] **Block the pinned host** by adding a hosts override on the test
      device — the app MUST refuse the TLS handshake with a pinning
      error rather than fall back to the system trust store.

If any item fails, file a P0, do **not** publish, and revert the offending
ProGuard / dependency change before re-running the checklist.

## R8 mapping retention

Every Play Store upload MUST also upload the `mapping.txt` produced under
`app/build/outputs/mapping/release/` so Play Console crash reports
de-obfuscate the encryption / key-management classes. Without the mapping
file, an exception thrown from the keystore unwrap path is unreadable in
the post-mortem.
