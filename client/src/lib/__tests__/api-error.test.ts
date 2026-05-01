// Task #276 — Verify the shared API helper raises a structured `ApiError`
// (not a hand-formatted string `Error`) for non-2xx responses, so the
// payment-method blocked panel and other consumers can read `status` /
// `body` directly without scraping `err.message`.
//
// Run with: `npx tsx --test client/src/lib/__tests__/api-error.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ApiError,
  isApiError,
  throwIfResNotOk,
  getApiErrorMessage,
} from "../api-error";

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string, statusText = ""): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { "Content-Type": "text/plain" },
  });
}

describe("throwIfResNotOk — 2xx", () => {
  it("does not throw for a 200 OK response", async () => {
    await throwIfResNotOk(new Response("ok", { status: 200 }));
  });

  it("does not throw for a 204 No Content response", async () => {
    await throwIfResNotOk(new Response(null, { status: 204 }));
  });
});

describe("throwIfResNotOk — JSON error bodies", () => {
  it("throws an ApiError with status and parsed body for a 409", async () => {
    const payload = {
      error: "Cannot change payment method while pay runs are open",
      code: "OPEN_PAY_RUN_LINES",
      openLines: [
        {
          lineId: "L1",
          payRunId: "P1",
          payRunName: "May 2026",
          payRunStatus: "open",
          tranche1Status: null,
          tranche2Status: null,
          paymentMethod: "bank_transfer",
        },
      ],
    };
    await assert.rejects(
      () => throwIfResNotOk(jsonResponse(409, payload, "Conflict")),
      (err: unknown) => {
        assert.ok(isApiError(err));
        assert.equal((err as ApiError).status, 409);
        assert.equal((err as ApiError).statusText, "Conflict");
        assert.deepEqual((err as ApiError).body, payload);
        // Legacy `${status}: ${text}` message preserved for fallback consumers.
        assert.match((err as ApiError).message, /^409: \{/);
        return true;
      },
    );
  });

  it("throws an ApiError whose `body.message` is the auth-style payload", async () => {
    await assert.rejects(
      () => throwIfResNotOk(jsonResponse(401, { message: "Invalid credentials" })),
      (err: unknown) => {
        assert.ok(isApiError(err));
        assert.equal((err as ApiError).status, 401);
        const body = (err as ApiError).body as { message?: string };
        assert.equal(body.message, "Invalid credentials");
        return true;
      },
    );
  });
});

describe("throwIfResNotOk — non-JSON error bodies", () => {
  it("falls back to raw text in `body` for a plain-text 500", async () => {
    await assert.rejects(
      () => throwIfResNotOk(textResponse(500, "Internal Server Error", "Internal Server Error")),
      (err: unknown) => {
        assert.ok(isApiError(err));
        assert.equal((err as ApiError).status, 500);
        assert.equal((err as ApiError).body, "Internal Server Error");
        assert.equal((err as ApiError).bodyText, "Internal Server Error");
        return true;
      },
    );
  });

  it("uses statusText when the response body is empty", async () => {
    await assert.rejects(
      () => throwIfResNotOk(new Response(null, { status: 503, statusText: "Service Unavailable" })),
      (err: unknown) => {
        assert.ok(isApiError(err));
        assert.equal((err as ApiError).status, 503);
        assert.equal((err as ApiError).body, null);
        assert.equal((err as ApiError).bodyText, "Service Unavailable");
        assert.equal((err as ApiError).message, "503: Service Unavailable");
        return true;
      },
    );
  });
});

describe("getApiErrorMessage", () => {
  it("prefers `body.message` from a structured ApiError", () => {
    const err = new ApiError(400, "Bad Request", '{"message":"phone required"}', { message: "phone required" });
    assert.equal(getApiErrorMessage(err, "fallback"), "phone required");
  });

  it("falls back to bodyText when the body has no message field", () => {
    const err = new ApiError(500, "Internal Server Error", "boom", "boom");
    assert.equal(getApiErrorMessage(err, "fallback"), "boom");
  });

  it("falls back to statusText when body and bodyText are empty", () => {
    const err = new ApiError(503, "Service Unavailable", "", null);
    assert.equal(getApiErrorMessage(err, "fallback"), "Service Unavailable");
  });

  it("uses Error.message for non-ApiError errors", () => {
    assert.equal(getApiErrorMessage(new Error("boom"), "fallback"), "boom");
  });

  it("uses the fallback when the value is not an Error", () => {
    assert.equal(getApiErrorMessage("nope", "fallback"), "fallback");
    assert.equal(getApiErrorMessage(null, "fallback"), "fallback");
  });
});
