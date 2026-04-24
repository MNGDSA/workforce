export const name = "Job Posting — Applicants table sortable headers + city + sex";

export const testPlan = `
## Test Suite: Job Posting — Applicants table sortable headers + city + sex

Goal: confirm the applicants table on the job posting detail page now
exposes sortable column headers (candidate, city, sex, status, applied),
renders city and sex columns, and colours the sex badges (pink for
female, blue for male). The suite degrades gracefully when no seeded
job posting or applicants exist — it asserts header presence regardless
and only asserts row-level behaviour when data is available.

### Test 1: Admin login
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Verify] Assert URL changes to /dashboard

### Test 2: Open the first job posting detail page (or skip)
7. [Browser] Navigate to /job-posting
8. [Browser] If at least one job row exists, click it to open the detail
   page. If no jobs exist, report "skipped — no seed data" for the rest
   of the suite and stop here. Do NOT mark the suite failed.

### Test 3: Sortable headers and new columns are present
9. [Verify] On the detail page, assert the following testids ARE present
   in the DOM (they may be inside hidden cells on small viewports — use
   the largest desktop viewport for this run):
    - data-testid="header-sort-candidate"
    - data-testid="header-sort-city"
    - data-testid="header-sort-sex"
    - data-testid="header-sort-status"
    - data-testid="header-sort-applied"
    - data-testid="button-export-applicants"   (export still works)
10. [Verify] Each header-sort-* element is a \`<button type="button">\`
    nested inside a \`<th scope="col">\`. The PARENT \`<th>\` (not the
    button) carries the \`aria-sort\` attribute.
11. [Verify] Initial aria-sort state matches the default sort
    (sortKey="applied", sortDir="desc"):
    - applied  → \`aria-sort="descending"\`
    - all other headers (candidate, city, sex, status) → \`aria-sort="none"\`

### Test 4: Sort direction toggles on click (only if applicants exist)
12. [Browser] If at least one element matching data-testid^="row-applicant-"
    exists, click data-testid="header-sort-candidate" once.
13. [Verify] The \`<th>\` wrapping that button now reports
    \`aria-sort="ascending"\` (candidate column defaults to ascending
    on first click).
14. [Browser] Click data-testid="header-sort-candidate" again.
15. [Verify] The same \`<th>\` now reports \`aria-sort="descending"\`.
16. [Browser] Click data-testid="header-sort-sex".
17. [Verify] data-testid="header-sort-sex"'s wrapping \`<th>\` reports
    \`aria-sort="ascending"\` and data-testid="header-sort-candidate"'s
    wrapping \`<th>\` now reports \`aria-sort="none"\`.
18. If no applicants exist, report "skipped — no applicants" and continue.

### Test 5: Sex badge colours and city cells render (only if applicants exist)
19. [Browser] For each visible row matching data-testid^="row-applicant-",
    inspect data-testid="text-applicant-sex-<id>" and
    data-testid="text-applicant-city-<id>".
20. [Verify] Every row exposes both cells (city may be a dash, sex may be
    a dash for "other"/"prefer_not_to_say"/null — both must still exist
    in the DOM).
21. [Verify] If a row's sex cell contains a Badge, its className contains
    EITHER "text-pink-400" (female) OR "text-blue-400" (male). Never
    both, never neither — a badge must always carry one of the two
    colour classes.
22. If no applicants exist, report "skipped — no applicants".
`;

export const technicalDocs = `
This suite verifies task #173 — sortable headers + city + sex columns
on the seasonal job posting detail page (/job-posting/:id).

Pages exercised:
- /auth
- /job-posting           — list page (used to find a job to open)
- /job-posting/<id>      — detail page (the page under test)

Test IDs that MUST be present on the detail page:
- header-sort-candidate
- header-sort-city
- header-sort-sex
- header-sort-status
- header-sort-applied
- button-export-applicants
- text-applicant-city-<applicationId>   (one per applicant row)
- text-applicant-sex-<applicationId>    (one per applicant row)

Sex badge colour contract:
- Female  → className contains "text-pink-400"  (and "bg-pink-500/10")
- Male    → className contains "text-blue-400"  (and "bg-blue-500/10")
- Other / prefer_not_to_say / null → cell renders a muted dash, NO badge

Sort behaviour contract:
- aria-sort starts at "none" on every header on first render.
- Default sort is "applied desc" (set in component state) — this is not
  reflected in aria-sort until the user clicks a header, by design, so
  Test 3 may see all headers reporting "none" before any click.
- Clicking the active column toggles asc <-> desc.
- Clicking a different column switches to it; "applied" defaults to
  "desc", every other column defaults to "asc".

Admin credentials: 1000000001 / password123 (seeded by task #165).

If the project has no seeded job postings or no applicants, the suite
SKIPS the data-dependent steps gracefully rather than failing — the
header-presence assertions in Test 3 are the contract baseline.
`;
