// Task #184 — per-route integration tests for the empty-dropdown
// write-boundary helper introduced in task #183. These tests stand up
// a tiny Express harness whose route bodies mirror, line-for-line,
// the production wiring in `server/routes.ts`:
//
//   const data = normalizeBlankFields({ ...req.body }, <CONST>);
//   const row  = await fakeStorage.create(data);  // captures `data`
//   res.status(201).json(row);
//
// The fake storage just echoes back the payload it was handed, so the
// JSON response IS "the persisted row". Each test POSTs/PATCHes a
// payload whose blank values cover at least one column from the
// per-model `*_BLANK_FIELDS` constant exported from
// `server/lib/normalize-blank-fields.ts`, and asserts the response
// body has `null` (not `""`) for those columns while required columns
// (deliberately absent from the per-model list) are preserved.
//
// We can't mount the real `server/routes.ts` handlers without a live
// Postgres + auth/session stack, but the contract under test —
// "blank dropdown values must be normalised to null at the route
// boundary using the per-model constant" — depends only on (a) the
// helper itself and (b) the per-model field lists imported from the
// same module the production routes import. A future regression that
// either weakens the helper or shrinks one of the per-model lists
// would break these tests, even when source-level wiring assertions
// happen to still pass.

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createServer, type Server } from "node:http";

import {
  normalizeBlankFields,
  EVENT_BLANK_FIELDS,
  JOB_BLANK_FIELDS,
  SMP_COMPANY_BLANK_FIELDS,
  WORKFORCE_BLANK_FIELDS,
  APPLICATION_BLANK_FIELDS,
  CANDIDATE_BLANK_FIELDS,
} from "../lib/normalize-blank-fields";

// ─── Harness ────────────────────────────────────────────────────────────

interface Harness {
  baseUrl: string;
  // Captures the most recent payload handed to the fake storage
  // for each route. Tests inspect this OR the response body — they
  // are kept identical by the echoing fake storage.
  lastInsert: Record<string, Record<string, unknown> | null>;
  close: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const app = express();
  app.use(express.json());

  const lastInsert: Harness["lastInsert"] = {
    candidate: null,
    event: null,
    job: null,
    application: null,
    workforce: null,
    workforceProfile: null,
    workforceTerminate: null,
    smpCompany: null,
  };

  // Each route mirrors the production call site:
  //   const data = normalizeBlankFields({ ...req.body }, CONST);
  //   storage.<x>(data); // echoed back
  // We use the same `{ ...req.body }` spread the real handlers use so
  // the in-place mutation contract is exercised end-to-end too.

  app.post("/api/candidates", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, CANDIDATE_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.candidate = data;
    res.status(201).json(data);
  });

  app.patch("/api/candidates/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, CANDIDATE_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.candidate = data;
    res.json(data);
  });

  app.post("/api/events", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, EVENT_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.event = data;
    res.status(201).json(data);
  });

  app.patch("/api/events/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, EVENT_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.event = data;
    res.json(data);
  });

  app.post("/api/jobs", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, JOB_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.job = data;
    res.status(201).json(data);
  });

  app.patch("/api/jobs/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, JOB_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.job = data;
    res.json(data);
  });

  app.post("/api/applications", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, APPLICATION_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.application = data;
    res.status(201).json(data);
  });

  app.patch("/api/applications/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, APPLICATION_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.application = data;
    res.json(data);
  });

  app.post("/api/workforce", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.workforce = data;
    res.status(201).json(data);
  });

  app.patch("/api/workforce/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.workforce = data;
    res.json(data);
  });

  // Workforce candidate-profile route — combines CANDIDATE + IBAN-overlay
  // fields, matching the production wiring at the line tagged
  // "Task #183" in `server/routes.ts`.
  app.patch("/api/workforce/:id/candidate-profile", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, [
      ...CANDIDATE_BLANK_FIELDS,
      "ibanNumber",
      "ibanBankName",
      "ibanBankCode",
      "ibanAccountFirstName",
      "ibanAccountLastName",
    ]) as Record<string, unknown>;
    lastInsert.workforceProfile = data;
    res.json(data);
  });

  app.post("/api/workforce/:id/terminate", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.workforceTerminate = data;
    res.json(data);
  });

  app.post("/api/smp-companies", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, SMP_COMPANY_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.smpCompany = data;
    res.status(201).json(data);
  });

  app.patch("/api/smp-companies/:id", (req, res) => {
    const data = normalizeBlankFields({ ...req.body }, SMP_COMPANY_BLANK_FIELDS) as Record<string, unknown>;
    lastInsert.smpCompany = data;
    res.json(data);
  });

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("server failed to bind");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    lastInsert,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function postJson(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function patchJson(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("normalizeBlankFields — per-route integration (task #184)", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  // ── candidates ────────────────────────────────────────────────────────
  it("POST /api/candidates: blank candidate dropdowns are persisted as null; required columns are preserved", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/candidates`, {
      // required column — must NOT be normalised (not in CANDIDATE_BLANK_FIELDS)
      fullNameEn: "Test Candidate",
      // a representative spread of CANDIDATE_BLANK_FIELDS columns
      gender: "",
      nationality: "   ",
      maritalStatus: "\t",
      region: "",
      email: "",
    });
    assert.equal(status, 201);
    assert.equal(body.fullNameEn, "Test Candidate", "required column must survive untouched");
    assert.equal(body.gender, null);
    assert.equal(body.nationality, null);
    assert.equal(body.maritalStatus, null);
    assert.equal(body.region, null);
    assert.equal(body.email, null);
  });

  it("PATCH /api/candidates/:id: blank candidate dropdowns are persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/candidates/cand-1`, {
      city: "",
      educationLevel: "  ",
      university: "",
    });
    assert.equal(status, 200);
    assert.equal(body.city, null);
    assert.equal(body.educationLevel, null);
    assert.equal(body.university, null);
  });

  // ── events ────────────────────────────────────────────────────────────
  it("POST /api/events: blank event dropdowns (region/description/endDate) are persisted as null", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/events`, {
      name: "Event A", // required — not in EVENT_BLANK_FIELDS
      region: "",
      description: "   ",
      endDate: "",
    });
    assert.equal(status, 201);
    assert.equal(body.name, "Event A");
    assert.equal(body.region, null);
    assert.equal(body.description, null);
    assert.equal(body.endDate, null);
  });

  it("PATCH /api/events/:id: blank event endDate is persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/events/evt-1`, {
      endDate: "",
    });
    assert.equal(status, 200);
    assert.equal(body.endDate, null);
  });

  // ── jobs ──────────────────────────────────────────────────────────────
  it("POST /api/jobs: blank job dropdowns (region/location/department/deadline) are persisted as null", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/jobs`, {
      title: "Job A", // required — not in JOB_BLANK_FIELDS
      region: "",
      location: "  ",
      department: "",
      deadline: "",
      description: "   ",
      requirements: "",
    });
    assert.equal(status, 201);
    assert.equal(body.title, "Job A");
    assert.equal(body.region, null);
    assert.equal(body.location, null);
    assert.equal(body.department, null);
    assert.equal(body.deadline, null);
    assert.equal(body.description, null);
    assert.equal(body.requirements, null);
  });

  it("PATCH /api/jobs/:id: blank job region is persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/jobs/job-1`, {
      region: "",
    });
    assert.equal(status, 200);
    assert.equal(body.region, null);
  });

  // ── applications ──────────────────────────────────────────────────────
  it("POST /api/applications: blank application notes are persisted as null", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/applications`, {
      candidateId: "cand-1", // required — not in APPLICATION_BLANK_FIELDS
      notes: "",
    });
    assert.equal(status, 201);
    assert.equal(body.candidateId, "cand-1");
    assert.equal(body.notes, null);
  });

  it("PATCH /api/applications/:id: blank application notes are persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/applications/app-1`, {
      notes: "   ",
    });
    assert.equal(status, 200);
    assert.equal(body.notes, null);
  });

  // ── workforce ─────────────────────────────────────────────────────────
  it("POST /api/workforce: blank workforce dropdowns are persisted as null", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/workforce`, {
      candidateId: "cand-1", // required — not in WORKFORCE_BLANK_FIELDS
      endDate: "",
      offboardingStatus: "  ",
      settlementPaidBy: "",
      paymentMethodReason: "\t",
    });
    assert.equal(status, 201);
    assert.equal(body.candidateId, "cand-1");
    assert.equal(body.endDate, null);
    assert.equal(body.offboardingStatus, null);
    assert.equal(body.settlementPaidBy, null);
    assert.equal(body.paymentMethodReason, null);
  });

  it("PATCH /api/workforce/:id: blank workforce notes are persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/workforce/wf-1`, {
      notes: "",
    });
    assert.equal(status, 200);
    assert.equal(body.notes, null);
  });

  // ── workforce candidate-profile (CANDIDATE + IBAN overlay) ───────────
  it("PATCH /api/workforce/:id/candidate-profile: blank candidate AND IBAN overlay fields are normalised", async () => {
    const { status, body } = await patchJson(
      `${h.baseUrl}/api/workforce/wf-1/candidate-profile`,
      {
        // CANDIDATE_BLANK_FIELDS member
        gender: "",
        // IBAN overlay added in task #183
        ibanNumber: "  ",
        ibanBankName: "",
        ibanAccountFirstName: "\n",
      },
    );
    assert.equal(status, 200);
    assert.equal(body.gender, null);
    assert.equal(body.ibanNumber, null);
    assert.equal(body.ibanBankName, null);
    assert.equal(body.ibanAccountFirstName, null);
  });

  // ── workforce terminate ──────────────────────────────────────────────
  it("POST /api/workforce/:id/terminate: blank terminationReason/Category are persisted as null", async () => {
    const { status, body } = await postJson(
      `${h.baseUrl}/api/workforce/wf-1/terminate`,
      {
        terminationReason: "",
        terminationCategory: "   ",
      },
    );
    assert.equal(status, 200);
    assert.equal(body.terminationReason, null);
    assert.equal(body.terminationCategory, null);
  });

  // ── smp-companies ────────────────────────────────────────────────────
  it("POST /api/smp-companies: blank SMP dropdowns are persisted as null", async () => {
    const { status, body } = await postJson(`${h.baseUrl}/api/smp-companies`, {
      name: "Acme Co", // required — not in SMP_COMPANY_BLANK_FIELDS
      region: "",
      crNumber: " ",
      contactPerson: "",
      contactEmail: "",
      bankIban: "  ",
    });
    assert.equal(status, 201);
    assert.equal(body.name, "Acme Co");
    assert.equal(body.region, null);
    assert.equal(body.crNumber, null);
    assert.equal(body.contactPerson, null);
    assert.equal(body.contactEmail, null);
    assert.equal(body.bankIban, null);
  });

  it("PATCH /api/smp-companies/:id: blank SMP notes are persisted as null", async () => {
    const { status, body } = await patchJson(`${h.baseUrl}/api/smp-companies/smp-1`, {
      notes: "",
    });
    assert.equal(status, 200);
    assert.equal(body.notes, null);
  });

  // ── source-level wiring guard ────────────────────────────────────────
  // Pins that every production route still calls `normalizeBlankFields`
  // against the matching per-model constant. This guards the "someone
  // accidentally drops the helper from a route" regression class
  // explicitly called out in the task brief — even if the helper and
  // the per-model lists themselves remain unchanged, dropping the
  // call on a single route would silently re-open the bug.
  it("server/routes.ts wires every form-driven route to its per-model constant", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const routesSrc = readFileSync(
      path.join(import.meta.dirname, "..", "routes.ts"),
      "utf8",
    );

    // Each row: [routeMatcher, expectedFieldsConstant]. The matcher is
    // chosen to be specific enough to identify the route without being
    // brittle to surrounding handler code; the assertion is that the
    // matched line uses the named constant.
    const checks: Array<{ desc: string; pattern: RegExp }> = [
      // Candidates
      { desc: "POST /api/candidates uses CANDIDATE_BLANK_FIELDS",
        pattern: /insertCandidateSchema\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, CANDIDATE_BLANK_FIELDS\)\)/ },
      { desc: "PATCH /api/candidates/:id uses CANDIDATE_BLANK_FIELDS",
        pattern: /candidateBaseSchema\.partial\(\)\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, CANDIDATE_BLANK_FIELDS\)\)/ },
      // Events
      { desc: "POST /api/events uses EVENT_BLANK_FIELDS",
        pattern: /insertEventSchema\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, EVENT_BLANK_FIELDS\)\)/ },
      { desc: "PATCH /api/events/:id uses EVENT_BLANK_FIELDS",
        pattern: /insertEventSchema\.partial\(\)\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, EVENT_BLANK_FIELDS\)\)/ },
      // Jobs
      { desc: "Jobs handlers use JOB_BLANK_FIELDS (POST + PATCH)",
        pattern: /normalizeBlankFields\(\{ \.\.\.req\.body \}, JOB_BLANK_FIELDS\)/ },
      // Applications
      { desc: "POST /api/applications uses APPLICATION_BLANK_FIELDS",
        pattern: /insertApplicationSchema\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, APPLICATION_BLANK_FIELDS\)\)/ },
      { desc: "PATCH /api/applications/:id uses APPLICATION_BLANK_FIELDS",
        pattern: /insertApplicationSchema\.partial\(\)\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, APPLICATION_BLANK_FIELDS\)\)/ },
      // Workforce
      { desc: "POST /api/workforce uses WORKFORCE_BLANK_FIELDS",
        pattern: /insertWorkforceSchema\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, WORKFORCE_BLANK_FIELDS\)\)/ },
      { desc: "Workforce PATCH/terminate use WORKFORCE_BLANK_FIELDS",
        pattern: /normalizeBlankFields\(\{ \.\.\.req\.body \}, WORKFORCE_BLANK_FIELDS\)/ },
      // Workforce candidate-profile (CANDIDATE + IBAN overlay)
      { desc: "Workforce candidate-profile uses CANDIDATE_BLANK_FIELDS + IBAN overlay",
        pattern: /normalizeBlankFields\([\s\S]{0,80}\.\.\.CANDIDATE_BLANK_FIELDS,[\s\S]{0,200}"ibanNumber"/ },
      // SMP companies
      { desc: "POST /api/smp-companies uses SMP_COMPANY_BLANK_FIELDS",
        pattern: /insertSMPCompanySchema\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, SMP_COMPANY_BLANK_FIELDS\)\)/ },
      { desc: "PATCH /api/smp-companies/:id uses SMP_COMPANY_BLANK_FIELDS",
        pattern: /insertSMPCompanySchema\.partial\(\)\.parse\(normalizeBlankFields\(\{ \.\.\.req\.body \}, SMP_COMPANY_BLANK_FIELDS\)\)/ },
    ];

    for (const { desc, pattern } of checks) {
      assert.match(routesSrc, pattern, `wiring regressed: ${desc}`);
    }
  });
});
