# Known Issues Log

A running log of observed problems across the WORKFORCE system (mobile app, backend, admin panel, infrastructure, database). This file is **distinct from the project tasks list**:

- **Project tasks** track *work to be done* (features, refactors, milestones).
- **This log** tracks *problems observed* and their resolution status.

An issue may or may not have a corresponding project task. When it does, link it via the **Related Tasks** field.

---

## How to use this log

**When to add an entry**
- A bug is reproduced (in dev, staging, or production).
- A user / operator reports a defect that needs follow-up.
- A regression is spotted during QA or code review.
- An infrastructure or third-party-service problem is observed and is likely to recur.

Do *not* log here: feature requests, design questions, performance optimization ideas — those belong in the project tasks system.

**How to add an entry**
1. Pick the next sequential ID (`ISSUE-NNN`, zero-padded to 3 digits).
2. Fill in every field of the template below.
3. Place the entry under **Open**.

**How to update status**
- Move the entry to **Investigating** once someone is actively diagnosing it. Add a dated note under **Status notes** when ownership changes.
- Move the entry to **Resolved** when the fix is merged and verified. Add a final dated note: what fixed it, the commit / task ref, and how it was verified.
- Never delete entries — historical context is the whole point of this log.

**How to link to project tasks**
- Use the task ref format `#NN` (e.g. `#62`) in the **Related Tasks** field.
- One issue can reference multiple tasks (e.g. `#47, #51`).
- If a task is created later to fix an existing issue, edit the entry to add the ref.

---

## Severity guide

| Level | Definition (this project) |
|---|---|
| **Critical** | Production is down, data is being lost or corrupted, or a security vulnerability is being actively exploited. All hands stop and fix immediately. |
| **High** | A core flow is broken for a meaningful subset of users (e.g. login, attendance check-in, payroll run, ID-card issuance). Workaround may exist but is painful. Fix within days. |
| **Medium** | A non-core flow is broken or degraded, OR a core flow is broken for a small subset only. App is usable. Fix within the current sprint. |
| **Low** | Cosmetic, minor UX, edge-case, or quality-of-life issue. No user is blocked. Fix when convenient. |

---

## Entry template

```markdown
### ISSUE-NNN — <short one-line title>

- **Logged:** YYYY-MM-DD
- **Severity:** Critical | High | Medium | Low
- **Component:** Mobile | Backend | Admin Panel | Infrastructure | Database | (free text)
- **Description:** What was observed. Steps to reproduce if known.
- **Impact:** Who is affected and how.
- **Workaround:** Temporary mitigation, or "None".
- **Related Tasks:** #NN, #NN — or "None".
- **Status notes:**
  - YYYY-MM-DD — first note
  - YYYY-MM-DD — next update
```

---

## Open

Issues that have been logged but no one is actively investigating yet.

### ISSUE-001 — [EXAMPLE — delete once first real entry is added] Sample entry showing the template

- **Logged:** 2026-04-18
- **Severity:** Low
- **Component:** Documentation
- **Description:** This is a placeholder entry that demonstrates the format every issue should follow. Delete it as soon as the first real issue is logged.
- **Impact:** None — example only.
- **Workaround:** None needed.
- **Related Tasks:** #63
- **Status notes:**
  - 2026-04-18 — Created alongside the KNOWN_ISSUES.md scaffold.

---

## Investigating

Issues that someone has picked up and is actively diagnosing or working on a fix for.

*(no entries yet)*

---

## Resolved

Issues that have been fixed and verified. Kept for historical reference. Each entry should end with a dated note describing what fixed it.

### ISSUE-003 — Android home screen profile photo slow to render after login

- **Logged:** 2026-04-19
- **Severity:** Medium
- **Component:** Mobile
- **Description:** After login, the worker profile photo on the Android home screen took a noticeable delay to render, leaving a blank/grey circle visible. Root cause was three-fold: (1) the `AsyncImage` on `HomeScreen.kt` had no size hint, no explicit memory/disk cache policy, no placeholder, and rebuilt the `ImageRequest` on every recomposition; (2) Coil had no application-level `ImageLoader`, so the disk cache was effectively non-persistent; (3) the backend served photo bytes without `Cache-Control`, so OkHttp's HTTP cache never validated stored copies.
- **Impact:** All workers using the Android app — slow visual feedback on the home screen, especially on cold start or weak networks.
- **Workaround:** None.
- **Related Tasks:** #66
- **Status notes:**
  - 2026-04-19 — Fixed under Task #66. Stabilized the `ImageRequest` with `remember(photoUrl, serverUrl)`, added explicit `size(80dp)`, enabled memory + disk cache policies, and added a Person vector painter as both `placeholder` and `fallback`. Configured a global Coil `ImageLoader` via `WorkforceApp : ImageLoaderFactory` (25% RAM memory cache, 50 MB disk cache, `respectCacheHeaders=true`). Added a fire-and-forget `Coil.imageLoader(ctx).enqueue(...)` prefetch in `LoginScreen.kt` immediately after a successful login. On the backend, the dev `/uploads` static handler and the production DO Spaces `PutObjectCommand` now both emit `Cache-Control: ... max-age=86400, must-revalidate` for photos, with ETag/Last-Modified left enabled so subsequent requests return 304. Verified visually that warm-cache loads render essentially instantly and cold-cache loads show the placeholder icon over the brand circle until the photo crossfades in.
