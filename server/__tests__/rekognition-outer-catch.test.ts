// Task #154 — pure classifier for the `validateFaceQuality` outer catch.
//
// `classifyDetectFacesError` decides whether an error from the first
// DetectFaces call (or the surrounding setup) should fail OPEN with
// `qualityCheckSkipped: true` ("transient" — the routes layer then
// chooses 503 vs 200-with-notice based on prior-photo state) or fail
// CLOSED with a `photo_validation` failure ("non_transient" — the
// request itself is bad).
//
// The classifier is pure so we can lock the boundaries here without
// spinning up the AWS SDK. The fallback action that turns each of
// these classes into an HTTP response (503 for first uploads,
// 200+notice for active-employee re-uploads) lives in
// `decideRekognitionFallbackAction` and is covered by
// `rekognition-telemetry.test.ts`.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/rekognition-outer-catch.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { classifyDetectFacesError } from "../rekognition";

function awsErr(name: string, extra: Record<string, any> = {}) {
  const e: any = new Error(`${name}: simulated`);
  e.name = name;
  Object.assign(e, extra);
  return e;
}

function httpErr(httpStatusCode: number, name = "InternalFailure") {
  const e: any = new Error(`HTTP ${httpStatusCode}`);
  e.name = name;
  e.$metadata = { httpStatusCode };
  return e;
}

describe("classifyDetectFacesError — transient vs. non-transient", () => {
  describe("transient: routes layer fails open (qualityCheckSkipped)", () => {
    it("classifies our own 5s AbortController timeout as transient", () => {
      // Our `detect` helper aborts via AbortController; the SDK
      // surfaces it with name=AbortError.
      assert.equal(classifyDetectFacesError(awsErr("AbortError")), "transient");
    });

    it("classifies SDK TimeoutError as transient", () => {
      assert.equal(classifyDetectFacesError(awsErr("TimeoutError")), "transient");
    });

    it("classifies a free-form 'Request was aborted' message as transient", () => {
      assert.equal(
        classifyDetectFacesError(new Error("Request aborted by client")),
        "transient",
      );
    });

    it("classifies ThrottlingException as transient", () => {
      assert.equal(classifyDetectFacesError(awsErr("ThrottlingException")), "transient");
    });

    it("classifies ProvisionedThroughputExceededException as transient", () => {
      assert.equal(
        classifyDetectFacesError(awsErr("ProvisionedThroughputExceededException")),
        "transient",
      );
    });

    it("classifies ServiceUnavailableException as transient", () => {
      assert.equal(
        classifyDetectFacesError(awsErr("ServiceUnavailableException")),
        "transient",
      );
    });

    it("classifies InternalServerError as transient", () => {
      assert.equal(
        classifyDetectFacesError(awsErr("InternalServerError")),
        "transient",
      );
    });

    it("classifies any HTTP 5xx response as transient", () => {
      for (const code of [500, 502, 503, 504]) {
        assert.equal(
          classifyDetectFacesError(httpErr(code)),
          "transient",
          `HTTP ${code} should be transient`,
        );
      }
    });

    it("classifies common network errors as transient", () => {
      const cases = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "NetworkingError"];
      for (const code of cases) {
        assert.equal(
          classifyDetectFacesError(new Error(`getaddrinfo ${code} rekognition.me-south-1.amazonaws.com`)),
          "transient",
          `network error containing ${code} should be transient`,
        );
      }
    });
  });

  describe("non_transient: routes layer fails closed (photo_validation 422)", () => {
    it("classifies a Rekognition InvalidImageFormatException as non_transient", () => {
      // Bad request from the candidate's bytes — retrying with the
      // same file will not help; we want the standard quality-failed
      // 422 flow, not a fail-open.
      assert.equal(
        classifyDetectFacesError(awsErr("InvalidImageFormatException", { $metadata: { httpStatusCode: 400 } })),
        "non_transient",
      );
    });

    it("classifies an ImageTooLargeException as non_transient", () => {
      assert.equal(
        classifyDetectFacesError(awsErr("ImageTooLargeException", { $metadata: { httpStatusCode: 400 } })),
        "non_transient",
      );
    });

    it("classifies a generic 4xx ValidationException as non_transient", () => {
      assert.equal(
        classifyDetectFacesError(httpErr(400, "ValidationException")),
        "non_transient",
      );
    });

    it("classifies an HTTP 403 access denied as non_transient", () => {
      // Misconfigured credentials are a deployment problem, not a
      // candidate-facing transient — we DO NOT want to silently let
      // candidates through if our IAM policy regresses.
      assert.equal(
        classifyDetectFacesError(httpErr(403, "AccessDeniedException")),
        "non_transient",
      );
    });

    it("classifies a fully unknown error as non_transient (fail closed by default)", () => {
      assert.equal(
        classifyDetectFacesError(new Error("something else entirely")),
        "non_transient",
      );
    });

    it("classifies a non-Error throwable as non_transient", () => {
      assert.equal(classifyDetectFacesError("rekognition exploded"), "non_transient");
      assert.equal(classifyDetectFacesError(undefined), "non_transient");
      assert.equal(classifyDetectFacesError(null), "non_transient");
    });
  });

  describe("first-upload vs. active-employee path framing (Task #154 docs check)", () => {
    // The classifier itself does not know about prior-photo state —
    // that's the routes layer's job. These tests lock the contract
    // that BOTH paths get the same `transient` signal so the routes
    // layer's truth table can do its work consistently. Without this
    // we could regress to a world where, e.g., timeouts are
    // "transient" but throttles are "non_transient", which would
    // make the active-employee fail-open path silently start
    // returning 422s during a Rekognition incident.
    const transientErrors = [
      awsErr("AbortError"),
      awsErr("ThrottlingException"),
      awsErr("ProvisionedThroughputExceededException"),
      httpErr(500),
      httpErr(503),
      new Error("ECONNREFUSED 127.0.0.1:443"),
    ];
    it("every transient error class lands in the same bucket (so first-upload 503 and re-upload 200+notice stay aligned)", () => {
      for (const e of transientErrors) {
        assert.equal(
          classifyDetectFacesError(e),
          "transient",
          `error ${e?.name ?? typeof e} should be transient — drift here would break the routes-layer truth table`,
        );
      }
    });
  });
});
