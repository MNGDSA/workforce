# Android Workforce App — Release Runbook

This runbook covers everything required to cut, sign, ship, and monitor a
production release of the Android workforce app to ~10K devices via Google
Play. It is the operational complement to **Task #82** (Android Play release
readiness — signing, crash reporting, Play Integrity).

> **Status (2026-04-19):** the in-app scaffolding for all three concerns
> (release signing, crash reporting, Play Integrity) has landed. The
> remaining work is *operational* and depends on Google Play Console and a
> linked Google Cloud project — neither of which is provisioned today. This
> document is the playbook to execute the moment those are available.

---

## 0. Prerequisites checklist

Before running a Play release for the first time, confirm all of the
following. Each line item links back to the section that operationalises it.

- [ ] Google Play Console account is provisioned, billing complete.
- [ ] Package name `com.luxurycarts.workforce` is reserved on the Console.
- [ ] Google Cloud project is linked to the Play Console.
- [ ] Play Integrity API is **enabled** on that GCP project.
- [ ] Service-account JSON for Play Integrity verdict decoding is generated
      and stored as a server-side secret (never committed).
- [ ] Either a Firebase project (Crashlytics) **or** a Sentry project is
      provisioned for crash telemetry.
- [ ] Upload keystore is generated (§ 1) and archived in two independent
      secure locations (e.g. 1Password vault + offline encrypted backup).

---

## 1. Release signing & Play App Signing (F-09)

### 1.1 Generate the upload keystore (one-time)

```sh
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -alias workforce-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

Record the store password, key alias, and key password in the team
password manager. **Lose them and you lose the ability to push updates
under this upload key** — Play would require a key reset via support.

### 1.2 Wire the keystore into the build

The Gradle config in `mobile-android/app/build.gradle.kts` reads signing
material from (in order): the process environment, `-P` gradle properties,
or `mobile-android/local.properties`. Pre-existing TLS pin material from
Task #43 uses the same `WORKFORCE_*` namespace. Neither secrets nor
keystore files are ever committed — `*.keystore`, `*.jks`, and Firebase /
Play Integrity service-account JSON are listed in `mobile-android/.gitignore`.

| Variable                        | Required | Description                      |
| ------------------------------- | -------- | -------------------------------- |
| `WORKFORCE_KEYSTORE_FILE`       | yes      | Absolute path to the JKS file.   |
| `WORKFORCE_KEYSTORE_PASSWORD`   | yes      | JKS file password.               |
| `WORKFORCE_KEY_ALIAS`           | yes      | Alias inside the JKS.            |
| `WORKFORCE_KEY_PASSWORD`        | yes      | Per-alias password.              |
| `WORKFORCE_CERT_PIN_HOST`       | no       | TLS pin hostname (Task #43).     |
| `WORKFORCE_CERT_PINS`           | no       | Comma-separated `sha256/<b64>`.  |

A copy-pastable template lives at `mobile-android/keystore.properties.example`.

If **no** signing material is provided, `assembleRelease` and `bundleRelease`
fall back to the debug signing config so the project still compiles on a
fresh checkout. The Gradle log emits a loud warning in that case. **An AAB
produced by the fallback path MUST NOT be uploaded to Play** — Play rejects
debug-signed bundles outright.

### 1.3 Build the signed AAB

```sh
cd mobile-android
./gradlew clean :app:bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### 1.4 Enrol in Play App Signing

On the first upload of the AAB to a new Play Console app:

1. Choose **"Use Play App Signing"** when prompted.
2. Upload the AAB. Play will accept the upload key and generate / hold the
   actual app-signing key on Google's side.
3. Optionally export the upload-key certificate via
   `keytool -export -rfc -keystore upload-keystore.jks -alias workforce-upload`
   and attach to the Play Console for future verification.

After enrolment, only the **upload key** ever leaves the office. Google
re-signs the bundle with the app-signing key before serving it to devices.

### 1.5 Cut a release

1. Bump `versionCode` (monotonic int) and `versionName` in `app/build.gradle.kts`.
2. `./gradlew :app:bundleRelease`.
3. Upload the resulting `app-release.aab` to **Internal testing** first.
4. Smoke-test on at least one real device (login, attendance submit,
   sync). Confirm a forced crash appears in the dashboard (§ 2.3).
5. Promote to **Closed → Open → Production** in stages.

---

## 2. Crash & error reporting (F-10)

### 2.1 Architecture

The app uses a `CrashReporter` interface
(`mobile-android/app/src/main/java/com/luxurycarts/workforce/services/CrashReporter.kt`)
with a `NoOpCrashReporter` default. The instance is set once in
`WorkforceApp.onCreate` *before* any other init runs, and a salted SHA-256
hash of the employee number is attached as the user identifier. **Raw
employee number, name, phone, and national ID are never sent.**

The swap to a real reporter is a single line in `WorkforceApp.onCreate`:

```kotlin
CrashReporter.setInstance(CrashlyticsCrashReporter)  // or SentryCrashReporter
CrashReporter.get().install(this)
```

### 2.2 Crashlytics setup (preferred)

Reasons to prefer Crashlytics: we are already on Google Play Services
(Maps, Location), zero extra licensing cost, and the dashboard ties
directly to the Play Console release.

1. Create a Firebase project linked to the same GCP project as Play.
2. Add the Android app with package name `com.luxurycarts.workforce`.
3. Download `google-services.json`, drop it into `mobile-android/app/`
   (already gitignored).
4. Add to `mobile-android/build.gradle.kts`:
   ```kotlin
   id("com.google.gms.google-services") version "4.4.2" apply false
   id("com.google.firebase.crashlytics") version "3.0.2" apply false
   ```
5. Apply the plugins in `mobile-android/app/build.gradle.kts`:
   ```kotlin
   id("com.google.gms.google-services")
   id("com.google.firebase.crashlytics")
   ```
6. Add deps:
   ```kotlin
   implementation(platform("com.google.firebase:firebase-bom:33.6.0"))
   implementation("com.google.firebase:firebase-crashlytics-ktx")
   implementation("com.google.firebase:firebase-analytics-ktx")
   ```
7. Implement `CrashlyticsCrashReporter : CrashReporter` next to
   `NoOpCrashReporter`, delegating each method to
   `FirebaseCrashlytics.getInstance()`. Tag every report with
   `BuildConfig.VERSION_NAME`, `BuildConfig.VERSION_CODE`,
   `BuildConfig.BUILD_TYPE`.
8. Wire `CrashReporter.setInstance(CrashlyticsCrashReporter)` in
   `WorkforceApp.onCreate`.

### 2.3 Verify before rollout

Add a temporary debug-only "Force crash" item to a hidden settings menu
that calls `throw RuntimeException("Crashlytics smoke test")`. After
running it on a real signed-release-track device:

- Crash row appears in Crashlytics within 5 minutes.
- Tagged with the correct version code and a 16-char hex user hash.
- Stack trace is mapped (ProGuard mappings are uploaded automatically by
  the Gradle plugin — verify under "Settings → Crashlytics" in the
  console).

Also verify a **non-fatal** path: temporarily wrap one
`SyncTelemetry.logEvent(..., "config_fetch_failed", ...)` call site with
`CrashReporter.get().recordNonFatal(e, "config_fetch_failed")` and confirm
the non-fatal panel shows it.

### 2.4 On-call expectations

- Watch the Crashlytics dashboard for the first 48h of any rollout.
- The release is auto-paused if the crash-free-users metric drops below
  99.5% for any 1h window — configure this threshold in the Console.
- Triage: open the issue, check stack trace, check the user-hash count
  affected, decide rollback vs hotfix.

---

## 3. Play Integrity on attendance submit (F-03 + Play Integrity)

### 3.1 Architecture

Device side: `PlayIntegrityProvider`
(`mobile-android/app/src/main/java/com/luxurycarts/workforce/services/PlayIntegrityProvider.kt`)
abstracts the Play Integrity API call. Default is `NoOpPlayIntegrityProvider`
which returns `null`.

Server side: `server/play-integrity.ts` exposes
`verifyAttendanceIntegrityToken(token, expectedNonceHex)` and is gated by
the `PLAY_INTEGRITY_ENABLED` env flag. When the flag is **off** (default,
dev + staging) the function is a pass-through. When the flag is **on**
(production after rollout) it hard-rejects:

| Reject code              | Meaning                                          |
| ------------------------ | ------------------------------------------------ |
| `INTEGRITY_REQUIRED`     | Token missing.                                   |
| `INTEGRITY_MALFORMED`    | Token failed to decode.                          |
| `INTEGRITY_APP_FAIL`     | App not recognised by Play.                      |
| `INTEGRITY_DEVICE_FAIL`  | Device fails basic / strong integrity.           |
| `INTEGRITY_ACCOUNT_FAIL` | Account licensing fails (only when enforced).    |
| `INTEGRITY_NONCE_MISMATCH` | Token nonce ≠ server-computed payload hash.    |

The mobile app surfaces these to the worker as a localised retry message
keyed off the `code` field of the 403 response (handled by the existing
classifier in `AttendanceRepository.attemptSubmission`).

### 3.2 Wire the device side

1. Add `com.google.android.play:integrity:<latest>` to
   `mobile-android/app/build.gradle.kts` deps.
2. Implement `RealPlayIntegrityProvider : PlayIntegrityProvider`:
   ```kotlin
   override suspend fun requestToken(context: Context, payloadHash: String): String? {
       val req = IntegrityTokenRequest.builder()
           .setNonce(payloadHash)                           // bind to request
           .setCloudProjectNumber(<gcp_project_number>)     // from gradle.properties
           .build()
       return suspendCancellableCoroutine { cont ->
           IntegrityManagerFactory.create(context)
               .requestIntegrityToken(req)
               .addOnSuccessListener { cont.resume(it.token()) }
               .addOnFailureListener { cont.resumeWithException(it) }
       }
   }
   ```
3. In `AttendanceRepository.attemptSubmission`, compute the canonical
   payload hash (must match `computeAttendanceNonceHex` server-side) and
   call `PlayIntegrityProvider.get().requestToken(...)` immediately
   before the multipart submit. Attach as a new multipart field
   `integrityToken`.
4. `PlayIntegrityProvider.setInstance(RealPlayIntegrityProvider)` in
   `WorkforceApp.onCreate` for `release` build type only — debug builds
   keep NoOp so an emulator can still submit.

### 3.3 Wire the server side

1. Generate a service-account in the linked GCP project with the
   `Play Integrity API → User` role.
2. Set the following secrets in the production environment:
   - `PLAY_INTEGRITY_ENABLED=true`
   - `PLAY_INTEGRITY_PROJECT_NUMBER=<gcp_project_number>`
   - `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON=<contents>` (or path)
3. Replace the deferred block in `server/play-integrity.ts` with a real
   `googleapis` call (the exact call site is documented inline in that
   file). Verify against `expectedNonceHex` and the appropriate verdict
   fields.
4. In the attendance submit handler in `server/routes.ts` (search for
   `app.post("/api/attendance-mobile/submit"`), call
   `verifyAttendanceIntegrityToken(req.body.integrityToken,
   computeAttendanceNonceHex({...}))` immediately after the per-token
   dedupe check and before the daily-cap check. On `ok=false`, return
   `403` with `{ message, code }` so the device classifier can route it.

### 3.4 Rollout staging

To avoid bricking the fleet at flip time:

1. Ship a release with the device-side token attached, server flag still
   **off**. Verify in server logs that tokens are arriving on > 99% of
   submits over a 24h window.
2. Flip `PLAY_INTEGRITY_ENABLED=true` on a staging server first; run
   end-to-end tests.
3. Flip in production during a low-traffic window. Watch for spikes in
   `INTEGRITY_*` 403 codes; rollback the flag (not the build) if any
   single code exceeds 1% of submits.

---

## 4. End-to-end rollout verification (one-page checklist)

Run this every time a new release is cut.

1. `versionCode` bumped, `versionName` reflects the change.
2. `./gradlew :app:bundleRelease` produces an AAB.
3. AAB upload to **Internal testing** track succeeds (Play accepts the
   signature → upload key is correctly enrolled).
4. Install on a real device from the internal track; log in.
5. Submit a normal attendance check-in → success in admin panel.
6. Force a synthetic crash → row appears in Crashlytics within 5 min.
7. With `PLAY_INTEGRITY_ENABLED=true`, strip the `integrityToken` field
   in a debug proxy → server returns 403 `INTEGRITY_REQUIRED`. Restore
   the field → submit succeeds.
8. Promote internal → closed → open → production in successive 24-hour
   waves, monitoring crash-free users and the `INTEGRITY_*` 403 rates at
   each step.
9. Document the build number, commit SHA, and dashboard URLs in the
   release row of the team's release log.

---

## 5. Where things live

| Concern                  | Code path                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Signing config           | `mobile-android/app/build.gradle.kts` (top of file) + `keystore.properties.example`     |
| Crash reporter interface | `mobile-android/app/src/main/java/com/luxurycarts/workforce/services/CrashReporter.kt`  |
| Crash reporter init      | `mobile-android/app/src/main/java/com/luxurycarts/workforce/WorkforceApp.kt`            |
| Integrity provider       | `mobile-android/app/src/main/java/com/luxurycarts/workforce/services/PlayIntegrityProvider.kt` |
| Server verifier          | `server/play-integrity.ts`                                                              |
| Submit handler hook      | `server/routes.ts` → `app.post("/api/attendance-mobile/submit", ...)`                   |

Update this runbook the moment any of the above moves.
