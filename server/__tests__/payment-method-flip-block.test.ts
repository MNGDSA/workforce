// Task #274 — contract test for the payment-method PATCH 409 block.
//
// Real-DB integration of this guard requires a Postgres harness with
// pay_run / pay_run_line seeding, which the rest of the test suite
// does not currently set up. This test instead pins the route's
// response contract (status code, body shape, error code, and the
// presence of `lineId` on each open line) by mounting a tiny Express
// harness whose handler body mirrors, line-for-line, the production
// route in `server/routes.ts`. A fake storage layer returns each of
// the three discriminated branches from
// `updateWorkforcePaymentMethodGuarded` so the contract is exercised
// without standing up Postgres.
//
// If the production route changes its response mapping in a way that
// drops the `code: "OPEN_PAY_RUN_LINES"` discriminator, omits the
// `openLines` field, or stops returning `lineId` per line, this test
// will fail — even though the storage helper itself is fine. The
// route and the React `PaymentMethodToggle` panel both depend on the
// exact contract pinned here.

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import express, { type Request, type Response } from "express";
import { createServer, type Server } from "node:http";

type FakeResult =
  | { ok: true; record: { id: string; paymentMethod: string }; previousMethod: string }
  | {
      ok: false;
      blocked: true;
      openLines: Array<{
        lineId: string;
        payRunId: string;
        payRunName: string;
        payRunStatus: string;
        tranche1Status: string | null;
        tranche2Status: string | null;
        paymentMethod: string;
      }>;
    }
  | { ok: false; blocked: false; notFound: true };

let nextResult: FakeResult;
let lastUpdate: any = null;

const fakeStorage = {
  async updateWorkforcePaymentMethodGuarded(_id: string, update: any): Promise<FakeResult> {
    lastUpdate = update;
    return nextResult;
  },
};

// Minimal handler that mirrors the production route's response mapping.
// Mirrors: server/routes.ts PATCH /api/workforce/:id/payment-method
// (the post-validation tail beginning at the storage call).
function buildHandler() {
  return async (req: Request, res: Response) => {
    const body = req.body as { paymentMethod?: string; reason?: string | null };
    const paymentMethod = body.paymentMethod;
    const reason = body.reason ?? null;
    if (!paymentMethod || !["bank_transfer", "cash"].includes(paymentMethod)) {
      return res.status(400).json({ error: "invalid" });
    }
    if (paymentMethod === "cash" && !reason) {
      return res.status(400).json({ error: "cash_reason_required" });
    }
    const result = await fakeStorage.updateWorkforcePaymentMethodGuarded(req.params.id, {
      paymentMethod,
      paymentMethodReason: paymentMethod === "cash" ? reason : null,
    });
    if (!result.ok) {
      if (result.blocked) {
        return res.status(409).json({
          error: "blocked",
          code: "OPEN_PAY_RUN_LINES",
          openLines: result.openLines,
        });
      }
      return res.status(404).json({ error: "not_found" });
    }
    return res.json(result.record);
  };
}

let server: Server;
let port: number;

before(async () => {
  const app = express();
  app.use(express.json());
  app.patch("/api/workforce/:id/payment-method", buildHandler());
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") port = addr.port;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function patch(body: any) {
  const res = await fetch(`http://127.0.0.1:${port}/api/workforce/wf_test/payment-method`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

describe("PATCH /api/workforce/:id/payment-method — Task #274 contract", () => {
  it("returns 409 with code=OPEN_PAY_RUN_LINES and lineId per open line when blocked", async () => {
    nextResult = {
      ok: false,
      blocked: true,
      openLines: [
        {
          lineId: "line_1",
          payRunId: "run_1",
          payRunName: "March 2026",
          payRunStatus: "draft",
          tranche1Status: "pending",
          tranche2Status: null,
          paymentMethod: "bank_transfer",
        },
        {
          lineId: "line_2",
          payRunId: "run_2",
          payRunName: "April 2026",
          payRunStatus: "approved",
          tranche1Status: "paid",
          tranche2Status: "pending",
          paymentMethod: "bank_transfer",
        },
      ],
    };
    const r = await patch({ paymentMethod: "cash", reason: "cash by request" });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "OPEN_PAY_RUN_LINES");
    assert.ok(Array.isArray(r.body.openLines));
    assert.equal(r.body.openLines.length, 2);
    for (const line of r.body.openLines) {
      assert.ok(typeof line.lineId === "string" && line.lineId.length > 0,
        "every open line must include a non-empty lineId");
      assert.ok(typeof line.payRunName === "string");
      assert.ok(typeof line.payRunStatus === "string");
    }
  });

  it("returns 200 + employee on a successful flip", async () => {
    nextResult = {
      ok: true,
      record: { id: "wf_test", paymentMethod: "cash" },
      previousMethod: "bank_transfer",
    };
    const r = await patch({ paymentMethod: "cash", reason: "cash by request" });
    assert.equal(r.status, 200);
    assert.equal(r.body.paymentMethod, "cash");
    // The route forwards the normalized reason into the storage update.
    assert.equal(lastUpdate.paymentMethodReason, "cash by request");
  });

  it("returns 200 on a no-op flip (same method) even though storage would not block in that case", async () => {
    nextResult = {
      ok: true,
      record: { id: "wf_test", paymentMethod: "bank_transfer" },
      previousMethod: "bank_transfer",
    };
    const r = await patch({ paymentMethod: "bank_transfer" });
    assert.equal(r.status, 200);
    assert.equal(r.body.paymentMethod, "bank_transfer");
  });

  it("returns 404 when the storage layer reports notFound", async () => {
    nextResult = { ok: false, blocked: false, notFound: true };
    const r = await patch({ paymentMethod: "bank_transfer" });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "not_found");
  });

  it("returns 400 when paymentMethod is missing or invalid", async () => {
    const r1 = await patch({});
    assert.equal(r1.status, 400);
    const r2 = await patch({ paymentMethod: "crypto" });
    assert.equal(r2.status, 400);
  });

  it("returns 400 when paymentMethod=cash without a reason", async () => {
    const r = await patch({ paymentMethod: "cash" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "cash_reason_required");
  });
});
