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

### Test 8: Multi-line paste — token-count pill + table filtering (REGRESSION)
This regression case guards the multi-paste search code path that the
toolbar redesign must NOT break. The same input (handleSearchPaste,
liveParsedSearch.isMulti, badge-search-token-count, pe-44 reservation)
must continue to work end-to-end.

45. [Browser] Click data-testid="input-search-candidates" to focus it.
46. [Browser] Use a real clipboard paste (NOT keyboard typing — must
    fire the onPaste handler). Paste this exact string (3 phone
    numbers separated by newline, comma, and space respectively, so all
    three SEPARATOR_REGEX branches are exercised):
        0500000001\n0500000002, 0500000003
47. [Browser] Wait 1 second for the React state to settle.
48. [Verify] data-testid="badge-search-token-count" is visible.
49. [Verify] The badge text matches the i18n template "Searching {{n}} IDs"
    (en) or "البحث عن {{n}} رقمًا" (ar) with n="3" — accept any wording
    that contains the western digit "3" (no Arabic-Indic numerals,
    no commas in the count itself).
50. [Verify] data-testid="active-chip-search" is visible (the multi-line
    paste populated the search state, so the search chip surfaces).
51. [Verify] The talent table re-fetched with the new query — assert
    that the URL contains "search=" with a URL-encoded value containing
    "0500000001". (Use the page URL or the network log.)
52. [Verify] At least one of the seeded candidates with phone
    "0500000001" appears in the table (data-testid starting with
    "row-candidate-" should resolve to ≥ 1 row), OR an empty-state
    panel renders with data-testid="text-no-results" — both outcomes
    are acceptable depending on seed data; what MUST hold is that the
    page did not crash and the badge shows "3".

### Test 9: Multi-paste truncation pill (only if MAX_SEARCH_TOKENS=200)
53. [Browser] Clear the search via data-testid="active-chip-search-remove".
54. [Browser] Click the search input again.
55. [Browser] Paste a string of 250 newline-separated 10-digit numeric
    tokens (e.g. "0500000001\\n0500000002\\n…\\n0500000250" — generate
    unique tokens; deduplication only collapses identical values, so
    250 distinct tokens will trigger truncation at 200).
56. [Verify] data-testid="badge-search-token-count" is visible AND its
    text contains the western digit "200" (the truncated cap), not
    "250" (the raw paste size).
57. [Browser] Click data-testid="active-chip-search-remove" to clean up.
58. [Verify] data-testid="badge-search-token-count" is no longer visible.
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
