export const name = "Talent — redesigned filter bar (Task #271)";

export const testPlan = `
## Test Suite: Talent — redesigned filter bar (Task #271)

Goal: confirm the redesigned talent toolbar renders correctly, every
status pill, the Filters popover, and the active-filter chip strip
behave as designed, and "Clear all" wipes EVERY active filter
(search + status + archived reason + popover toggles).

### Test 1: Admin login + open talent page
1. [New Context] Create a new browser context (default viewport).
2. [Browser] Navigate to /auth.
3. [Browser] Enter "0500000001" in data-testid="input-identifier".
4. [Browser] Enter "password123" in data-testid="input-password".
5. [Browser] Click data-testid="button-sign-in".
6. [Verify] URL changes to /dashboard within 5 seconds.
7. [Browser] Navigate to /talent.
8. [Verify] data-testid="talent-filter-bar" is visible.

### Test 2: Status pill row + Filters trigger
9.  [Verify] data-testid="status-pill-group" is visible and contains six
    pills: status-pill-all, status-pill-completed, status-pill-not_activated,
    status-pill-hired, status-pill-blocked, status-pill-archived.
10. [Verify] Initially data-testid="status-pill-all" has aria-checked="true".
11. [Verify] data-testid="button-open-filters" is visible.
12. [Verify] data-testid="badge-advanced-filter-count" is NOT visible
    (no popover toggles active yet).
13. [Verify] data-testid="active-filters-row" is NOT visible.
14. [Verify] data-testid="popover-filters" exists in the DOM but is
    visually hidden (forceMount + data-[state=closed]:hidden).

### Test 3: Active-filter chip appears for free-text search
15. [Browser] Type "ahmad" into data-testid="input-search-candidates".
16. [Verify] data-testid="active-filters-row" becomes visible within 1s.
17. [Verify] data-testid="active-chip-search" is visible and its text
    contains "ahmad".
18. [Verify] data-testid="active-chip-search-remove" is visible.
19. [Browser] Click data-testid="active-chip-search-remove".
20. [Verify] data-testid="input-search-candidates" value is empty.
21. [Verify] data-testid="active-filters-row" is hidden (no other filters).

### Test 4: Status pill toggles a status chip
22. [Browser] Click data-testid="status-pill-archived".
23. [Verify] data-testid="status-pill-archived" gets aria-checked="true".
24. [Verify] data-testid="active-chip-status" is visible (status filter
    surfaced as a chip).
25. [Verify] Archive-reason sub-row appears: data-testid="chip-archived-reason-inactive_one_year"
    is visible.
26. [Browser] Click data-testid="chip-archived-reason-inactive_one_year".
27. [Verify] data-testid="active-chip-archived-reason" is visible.

### Test 5: Filters popover opens, toggles surface as chips
28. [Browser] Click data-testid="button-open-filters".
29. [Verify] data-testid="popover-filters" becomes visually visible.
30. [Browser] Click data-testid="filter-former-employees".
31. [Browser] Click data-testid="filter-has-drivers-license".
32. [Browser] Press Escape (or click outside) to close the popover.
33. [Verify] data-testid="badge-advanced-filter-count" shows "2".
34. [Verify] data-testid="active-chip-former-employees" is visible.
35. [Verify] data-testid="active-chip-drivers-license" is visible.

### Test 6: Clear all wipes EVERY active filter
36. [Verify] data-testid="button-clear-all-filters" is visible.
37. [Browser] Click data-testid="button-clear-all-filters".
38. [Verify] data-testid="status-pill-all" has aria-checked="true".
39. [Verify] data-testid="status-pill-archived" has aria-checked="false".
40. [Verify] data-testid="input-search-candidates" value is empty.
41. [Verify] data-testid="active-filters-row" is NOT visible.
42. [Verify] data-testid="badge-advanced-filter-count" is NOT visible.
43. [Verify] Archive-reason sub-row is gone (chip-archived-reason-* not visible).

### Test 7: forceMount keeps popover testids queryable when closed
44. [Verify] Without opening the popover, data-testid="select-source-filter"
    exists in the DOM (queryable via document.querySelector). It may be
    visually hidden, but it must be present so external e2e/code paths
    that target this id keep working.
`;

export const technicalDocs = `
Demo admin: phone=0500000001, password=password123. Logging in routes
to /dashboard; navigate manually to /talent.

The talent filter bar (data-testid="talent-filter-bar") is a single
<div> with four logical zones, all rendered inside one card:
  1. Search input (data-testid="input-search-candidates").
  2. Status pill row (data-testid="status-pill-group") + Filters popover
     trigger (data-testid="button-open-filters") with optional count
     badge (data-testid="badge-advanced-filter-count").
  3. Archive-reason sub-row (visible only when status === "archived").
  4. Active-filter chip strip (data-testid="active-filters-row")
     containing one chip per non-default filter — search, status,
     archived reason, source classification, former-employee toggle,
     drivers-license toggle, vaccination-report toggle.

Clear all (data-testid="button-clear-all-filters") MUST reset:
  search → "", status → "all", archivedReason → "all",
  sourceFilter → "all", formerEmployeeFilter → false,
  hasDriversLicenseFilter → false, hasVaccinationReportFilter → false,
  page → 1.

The Popover uses Radix forceMount + data-[state=closed]:hidden so all
inner data-testids (filter-former-employees, filter-has-drivers-license,
filter-has-vaccination-report, source-pill-*, select-source-filter)
remain queryable in the DOM even when the popover is closed.

Hidden compatibility markers preserve legacy ids:
  - data-testid="select-status-filter" (hidden span carrying current status)
  - data-testid="select-archived-reason-filter" (hidden span carrying current reason)
  - data-testid="select-source-filter" (the popover radiogroup itself)
`;
