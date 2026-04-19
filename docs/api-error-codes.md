# Mobile API Error-Code Catalog

This document is the canonical reference for the structured error
contract between the WORKFORCE Android client and the WORKFORCE server.

The Android client decides what to do with a failed response by reading
the JSON body's `code` field and routing on an **exact** match. Any
substring or fuzzy matching on the `message` text is a forbidden
anti-pattern (see Task #85 / F-06).

Every error response from a route consumed by the mobile client MUST
include a `code` field. Add new codes here first, then in the
`MobileErrorCodes` constant in `server/lib/mobile-error-codes.ts`, then
in the Android `parseErrorCode()` consumer.

## Outcome categories on the Android side

The Android sync pipeline maps each `code` to one of:

| Outcome              | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `Synced`             | Server stored the row.                                       |
| `AlreadySynced`      | Server recognised the dedup token.                           |
| `RetryTransient`     | Network blip, 5xx, 429 — retry with exponential backoff.     |
| `PermanentClientError` | Domain rejection that retrying the same payload cannot fix. |
| `Terminated`         | Account or workforce no longer valid — wipe local session.   |
| `SessionExpired`     | Cookie no longer valid — prompt user to re-login.            |
| `NeedsAttention`     | Local data is corrupt or unsendable — surface to user.       |

## Code reference

| Code                         | HTTP | Outcome              | When it fires                                                                          |
| ---------------------------- | ---- | -------------------- | -------------------------------------------------------------------------------------- |
| `AUTH_REQUIRED`              | 401  | `SessionExpired`     | Caller has no auth cookie / token.                                                     |
| `SESSION_EXPIRED`            | 401  | `SessionExpired`     | Session points to a user that no longer exists (deleted / re-registered).              |
| `ACCOUNT_DISABLED`           | 403  | `Terminated`         | The user account's `is_active = false`.                                                |
| `ACCOUNT_TERMINATED`         | 403  | `Terminated`         | The workforce row's `is_active = false` AND `end_date` has passed at capture time.     |
| `ACCOUNT_INACTIVE`           | 403  | `Terminated`         | The workforce row's `is_active = false` with no `end_date` set.                        |
| `WORKFORCE_NOT_FOUND`        | 404  | `PermanentClientError` | The submitted `workforceId` does not exist server-side.                              |
| `WORKFORCE_OWNERSHIP_MISMATCH` | 403 | `PermanentClientError` | The authenticated user does not own the submitted workforce row.                    |
| `BEFORE_SHIFT_WINDOW`        | 403  | `PermanentClientError` | Capture time is earlier than `shiftStart - earlyBuffer`.                             |
| `AFTER_SHIFT_WINDOW`         | 403  | `PermanentClientError` | Capture time is later than `shiftEnd + lateBuffer`.                                  |
| `MIN_DURATION_NOT_MET`       | 422  | `PermanentClientError` | Worker is trying to clock out before `minShiftDurationMinutes` has elapsed.         |
| `ATTENDANCE_COMPLETED`       | 409  | `AlreadySynced`      | Today's clock-in and clock-out are both already recorded.                             |
| `DAILY_LIMIT_REACHED`        | 429  | `PermanentClientError` | `maxDailySubmissions` reached for this workforce today.                             |
| `SHIFT_NOT_ASSIGNED`         | n/a  | (advisory)           | The submission was accepted but the worker had no shift today; surfaced via `flag_reason`. |
| `TOKEN_INVALID`              | 400  | `NeedsAttention`     | The `submissionToken` failed HMAC verification or is malformed.                       |
| `TOKEN_EXPIRED`              | 400  | `NeedsAttention`     | The `submissionToken` is well-formed but its 24h validity window has passed.          |
| `TOKEN_USED`                 | 409  | `AlreadySynced`      | The `submissionToken` matches an already-persisted row (dedup hit).                   |
| `TOKEN_MISSING`              | 400  | `NeedsAttention`     | No `submissionToken` was attached to the submit request.                              |
| `TIME_TOKEN_INVALID`         | 400  | (n/a)                | A `/api/time` envelope failed HMAC verification (only emitted by future verify endpoints). |
| `RATE_LIMITED`               | 429  | `RetryTransient`     | Generic rate-limit hit (e.g. login attempts).                                         |
| `PHOTO_REQUIRED`             | 400  | `NeedsAttention`     | The submit multipart had no `photo` part.                                             |
| `VALIDATION_FAILED`          | 400  | `NeedsAttention`     | Request body failed Zod validation. `errors` field carries the per-field detail.      |
| `INTERNAL_ERROR`             | 500  | `RetryTransient`     | Unhandled server exception. Body MAY include `message` for debug.                     |

## Backward compatibility

For one full release cycle after Task #85 ships, responses that
previously carried `terminated: true` continue to carry it alongside
the new `code` field. After that release lands on Play Store and the
field install base has rotated, the legacy `terminated` boolean MUST
be removed and the Android substring-fallback path deleted.

## Token contract (Task #85 step 4)

`GET /api/attendance-mobile/status` returns:

```json
{
  ...,
  "submissionToken": "v1.<base64url(payload)>.<hmac>",
  "submissionTokenExpiresAt": "2026-04-20T05:00:00.000Z"
}
```

The Android client MUST:

1. Persist `submissionToken` alongside the captured row at capture time
   (not at sync time).
2. Send the same token verbatim on the next
   `POST /api/attendance-mobile/submit` for that row.
3. Treat `TOKEN_USED` as success-equivalent (the row was already
   accepted on a previous attempt that the client did not see ack'd).
4. Treat `TOKEN_EXPIRED` / `TOKEN_INVALID` as `NeedsAttention` — the
   user must surface to a fresh status check before retrying.

## Server time contract (Task #85 step 6)

`GET /api/time` returns a signed envelope:

```json
{
  "now": 1768982400000,
  "nowIso": "2026-04-19T12:00:00.000Z",
  "expiresAt": "2026-04-19T12:01:00.000Z",
  "signature": "v1.<base64url(payload)>.<hmac>"
}
```

The Android client uses this to reconcile its NTP offset against an
authenticated reference, sidestepping the unauthenticated UDP NTP
attack surface (F-02). Submitted clock fields (`ntpTimestamp`,
`systemClockTimestamp`, `lastNtpSyncAt`) become **advisory metadata
only**; the row's authoritative time-of-record is the server's
`server_received_at` column.
