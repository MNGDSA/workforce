export const name = "Workforce — payment-method flip guard + i18n placeholder fix (Task #274)";

export const testPlan = `
## Test Suite: Workforce — payment-method flip guard + i18n placeholder fix (Task #274)

Goal: confirm Task #274's two fixes hold end-to-end:
  (A) i18next placeholder syntax sweep — the workforce page and
      employee dialog must render with NO literal {var} or {{var}}
      placeholder text leaking through. Intentional literal helper
      text on /broadcast and /onboarding must still display the
      single-brace token names.
  (B) Payment-method flip guard — the PATCH route's success path
      (no open pay-run lines) still works after the refactor to a
      transactional storage helper. Both directions (bank ↔ cash)
      must succeed and the inline confirmation panel must use real
      interpolated text.

### Test 1: Admin login + open workforce page
1. [New Context] Create a new browser context (default viewport).
2. [Browser] Navigate to /auth.
3. [Browser] Enter "1000000001" in data-testid="input-identifier".
4. [Browser] Enter "password123" in data-testid="input-password".
5. [Browser] Click data-testid="button-sign-in".
6. [Verify] Login succeeds — URL changes to /dashboard within 5s
   OR the main app sidebar/dashboard chrome becomes visible.
7. [Browser] Navigate to /workforce.
8. [Verify] The workforce page renders (the employees list/table is
   visible with at least one row). No 500 error page.

### Test 2: No literal placeholder leakage on /workforce
9.  [Verify] Scan the entire visible page text. Assert NONE of the
    following literal substrings appear anywhere on the page:
      - "{n}"
      - "{count}"
      - "{name}"
      - "{date}"
      - "{kb}"
      - "{done}"
      - "{total}"
      - "{reason}"
    (Single-brace tokens are i18next-broken placeholders that we
    fixed; their presence would mean a key was missed.)
10. [Verify] The Export button reads "Export (N)" / "تصدير (N)"
    where N is an actual numeral, NOT "Export ({n})".
11. [Verify] The list-count badge near the page heading reads
    " (N)" with an actual numeral, NOT " ({n})".

### Test 3: Open employee dialog + verify Payment Method panel
12. [Browser] Click the first employee row in the workforce table to
    open the Employee detail dialog. The clickable element may be a
    <tr> inside the employees table or a card with data-testid
    starting with "row-employee-" / "card-employee-".
13. [Verify] An employee detail dialog/sheet opens showing employee
    info (name, identifier, etc.).
14. [Verify] The Payment Method section is visible. Its heading
    reads "Payment Method" or "طريقة الدفع".
15. [Verify] Both toggle buttons are present:
      - data-testid="button-payment-method-bank" (Bank Transfer / تحويل بنكي)
      - data-testid="button-payment-method-cash" (Cash / نقدًا)
16. [Verify] Within the Payment Method section, no literal "{name}",
    "{date}", "{n}", "{count}", "{reason}" tokens appear. If the
    employee already has a paymentMethodReason set, the line should
    read "Reason: <real text>" not "Reason: {reason}". If a
    "Set by ..." line is visible, it should show a real name and
    a real date, not "{name}" or "{date}".

### Test 4: Inline confirmation panel uses real interpolated text
17. [Verify] Determine the currently-active method by inspecting
    which toggle button has the active visual state (highlighted /
    aria-pressed=true / a colored ring). Record this as ORIGINAL_METHOD
    ("bank" or "cash").
18. [Browser] Click the OTHER (currently-inactive) toggle button:
      - If ORIGINAL_METHOD = "bank", click data-testid="button-payment-method-cash".
      - If ORIGINAL_METHOD = "cash", click data-testid="button-payment-method-bank".
19. [Verify] An inline confirmation panel appears (either the cash
    WPS-warning panel asking for a reason, or the bank-transfer
    confirm prompt). The panel text must be human-readable Arabic
    or English with NO "{...}" tokens.
20. [Browser] Click the cancel button to dismiss the confirmation
    panel without flipping:
      - If you opened the cash panel, click data-testid="button-cancel-cash".
      - If you opened the bank panel, click data-testid="button-cancel-bank".
21. [Verify] The inline panel disappears and the original two-button
    toggle row is back. ORIGINAL_METHOD is still highlighted.

### Test 5: Successful flip in BOTH directions (no open pay-run lines)
22. [Browser] Click the inactive toggle button again (same as step 18).
23. [Browser] If you opened the cash panel:
      a. Type "task 274 e2e verification" into data-testid="input-cash-reason".
      b. Click the confirm button (data-testid="button-confirm-cash"
         or whatever the panel's primary action is — search for a
         button with text matching /confirm|save|switch|تأكيد|حفظ/i
         in the cash panel).
    If you opened the bank panel:
      a. Click the confirm button (data-testid="button-confirm-bank"
         or the panel's primary action).
24. [Verify] The flip succeeds:
      - A success toast appears, AND
      - The OTHER toggle button (the one we clicked) is now the
        highlighted/active one, AND
      - data-testid="panel-payment-flip-blocked" is NOT visible
        (no 409 error panel).
25. [Browser] Now flip BACK to ORIGINAL_METHOD using the same flow
    (click the now-inactive original button, fill reason if needed,
    confirm).
26. [Verify] The reverse flip ALSO succeeds (success toast +
    ORIGINAL_METHOD highlighted again + no blocked panel).

### Test 6: Intentional literal helper text on /broadcast
This guards the rationale for keeping single-brace examples in
helper text that documents server-side template variables. The
SERVER substitutes literal {name} (single brace) at SMS send
time via .replaceAll("{name}", ...). The helper text must keep
showing the single-brace token name to match.

27. [Browser] Navigate to /broadcast.
28. [Browser] Locate the message textarea (data-testid="input-message").
29. [Verify] Read the textarea's "placeholder" attribute. It must
    contain the literal substring "{name}" (single curly braces
    around "name"). Also verify the placeholder DOES NOT contain
    "{{lb}}" or "{{rb}}" — the lb/rb interpolation tokens should
    have been substituted into actual { and } characters.

### Test 7: Intentional literal helper text on /onboarding
30. [Browser] Navigate to /onboarding.
31. [Browser] Look for the SMS templates section (the heading is
    "SMS templates" in English or "قوالب الرسائل القصيرة" in
    Arabic). It contains a small grey helper line directly under
    the section title/subtitle that begins with "Available
    variables:" or in Arabic "المتغيرات المتاحة:".
32. [Verify] The helper line contains all four template variable
    names with single curly braces:
      - "{name}"
      - "{missing_docs}"
      - "{portal_url}"
      - "{deadline_date}"
    AND it does NOT contain "{{lb}}" or "{{rb}}" (the brace tokens
    must have been interpolated into real { and } characters).
`;

export const technicalDocs = `
Demo admin: identifier="1000000001", password="password123". Logging
in lands on /dashboard; navigate manually to /workforce, /broadcast,
/onboarding. Default locale is Arabic (RTL).

Task #274 fixes verified by this suite:

i18n placeholder syntax sweep
- Across the six locale files (workforce, onboarding, broadcast in
  ar+en) ~110 keys used single-brace {var} which i18next does NOT
  interpolate, so the literal text "{n}", "{count}", "{name}" etc.
  was leaking into rendered UI. Converted to {{var}} so values now
  substitute correctly. Sweep verified: 0 single-brace placeholders
  remain in the JSON files.
- Four strings document a SERVER-side template syntax (broadcast
  compose.messagePh, onboarding reminders.templates.placeholders,
  ar+en each). The server substitutes literal {name}, {portal_url},
  {missing_docs}, {deadline_date} at SMS send time via
  .replaceAll("{name}", ...). Helper text MUST show single-brace
  tokens to match. Implemented safely by interpolating the brace
  characters themselves: the JSON now stores {{lb}}name{{rb}} and
  the React call sites pass { lb: "{", rb: "}" } so users still
  see "{name}" rendered.

Payment-method flip guard
- PATCH /api/workforce/:id/payment-method now uses
  storage.updateWorkforcePaymentMethodGuarded which wraps the open-
  lines guard + the workforce row update in a single transaction
  with SELECT ... FOR UPDATE on the workforce row. When blocked
  (employee has unpaid pay-run lines on a non-completed run) the
  route returns HTTP 409 with { error, code: "OPEN_PAY_RUN_LINES",
  openLines: [{ lineId, payRunId, payRunName, payRunStatus,
  tranche1Status, tranche2Status, paymentMethod }] }.
- This e2e suite tests only the SUCCESS path (no open pay-run lines)
  because seeding open pay-run lines through the UI is non-trivial.
  The 409 contract is pinned by a server-side contract test in
  server/__tests__/payment-method-flip-block.test.ts; the inline
  red panel UI (data-testid="panel-payment-flip-blocked") is
  rendered by PaymentMethodToggle in client/src/pages/workforce.tsx
  using i18n keys dialog.payment.flipBlocked* (with full Arabic
  plural forms).

Test IDs in the Payment Method panel:
  - button-payment-method-bank, button-payment-method-cash
  - button-cancel-cash, button-cancel-bank
  - button-confirm-cash, button-confirm-bank (or similar primary
    action buttons inside the inline confirm panels)
  - input-cash-reason
  - panel-payment-flip-blocked (only appears on 409)
  - row-flip-blocked-<lineId>
  - button-dismiss-flip-blocked
  - text-payment-reason-line, text-payment-set-by, button-toggle-payment-history

Equivalent Arabic strings:
  - "Payment Method" = "طريقة الدفع"
  - "Bank Transfer" = "تحويل بنكي"
  - "Cash" = "نقدًا"
  - "Reason" = "السبب"
  - "Set by" = "تم التحديد بواسطة"
  - "Cancel" = "إلغاء"
`;
