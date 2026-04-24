// Task #156 — verify the URL-to-key parser used by `overwriteFile`
// fails loudly when it cannot resolve a key. Without this, a CDN
// swap or signed-URL change could silently no-op the rotation
// rescue and leave a candidate's photo sideways even though the
// rescue logic ran successfully.
//
// Task #160 — extend the same loud-error contract to `deleteFile`
// and `getFileBuffer`, which previously used a fragile
// `fileUrl.split(...)` parser and silently no-op'd on URL drift.
// We need NODE_ENV=production at module-load time so the prod
// branches are exercised; the SPACES_* envs only need to be set
// (their values aren't actually used by these tests because the
// parser throws before any AWS call is attempted).
//
// `extractStorageKeyFromUrl` is intentionally pure (no AWS, no
// I/O) so we can drive it with synthetic URLs and lock the
// contract: either a non-empty key, or a descriptive throw.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/file-storage.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

process.env.NODE_ENV = "production";
process.env.SPACES_ENDPOINT =
  process.env.SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com";
process.env.SPACES_BUCKET = process.env.SPACES_BUCKET || "test-bucket";
process.env.SPACES_KEY = process.env.SPACES_KEY || "test-key";
process.env.SPACES_SECRET = process.env.SPACES_SECRET || "test-secret";

const { extractStorageKeyFromUrl, deleteFile, getFileBuffer } = await import(
  "../file-storage"
);

describe("extractStorageKeyFromUrl", () => {
  it("extracts the key from a standard <bucket>.<endpoint>/<key> URL", () => {
    const key = extractStorageKeyFromUrl(
      "https://test-bucket.nyc3.digitaloceanspaces.com/uploads/photo-123.jpg",
    );
    assert.equal(key, "uploads/photo-123.jpg");
  });

  it("preserves nested key paths", () => {
    const key = extractStorageKeyFromUrl(
      "https://test-bucket.nyc3.digitaloceanspaces.com/uploads/2025/04/photo-abc.jpg",
    );
    assert.equal(key, "uploads/2025/04/photo-abc.jpg");
  });

  it("strips query strings from signed URLs so the key round-trips", () => {
    const key = extractStorageKeyFromUrl(
      "https://test-bucket.nyc3.digitaloceanspaces.com/uploads/photo-123.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc",
    );
    assert.equal(key, "uploads/photo-123.jpg");
  });

  it("strips URL fragments", () => {
    const key = extractStorageKeyFromUrl(
      "https://test-bucket.nyc3.digitaloceanspaces.com/uploads/photo-123.jpg#anchor",
    );
    assert.equal(key, "uploads/photo-123.jpg");
  });

  it("throws a descriptive error when the URL does not contain the configured endpoint (CDN drift)", () => {
    // Simulates the production URL format drifting — e.g. a custom
    // CDN domain in front of Spaces. Without the throw, the
    // rotation rescue would silently skip the write.
    assert.throws(
      () =>
        extractStorageKeyFromUrl(
          "https://cdn.example.com/uploads/photo-123.jpg",
        ),
      (err: Error) => {
        assert.match(err.message, /Cannot extract storage key/);
        assert.match(err.message, /nyc3\.digitaloceanspaces\.com/);
        assert.match(err.message, /cdn\.example\.com/);
        return true;
      },
    );
  });

  it("throws when the URL contains the endpoint but no object key", () => {
    assert.throws(
      () =>
        extractStorageKeyFromUrl(
          "https://test-bucket.nyc3.digitaloceanspaces.com/",
        ),
      /no object key/,
    );
  });

  it("throws when the URL is an unrelated string (e.g. a relative local path leaked into prod)", () => {
    assert.throws(
      () => extractStorageKeyFromUrl("/uploads/photo-123.jpg"),
      /Cannot extract storage key/,
    );
  });
});

// Task #160 — `deleteFile` and `getFileBuffer` previously used the
// fragile `fileUrl.split(...)` parser and would silently no-op on
// drifted URLs (deleteFile: storage bloat / privacy hazard;
// getFileBuffer: confusing failure far from the root cause). Now
// they route through `extractStorageKeyFromUrl`, so the same loud
// throw covers all three helpers. We don't need a real S3 client
// because the parser throws before any AWS call is attempted.
describe("deleteFile (URL drift contract)", () => {
  it("throws when the URL doesn't contain the configured endpoint (CDN drift) instead of silently skipping", async () => {
    await assert.rejects(
      () => deleteFile("https://cdn.example.com/uploads/photo-123.jpg"),
      (err: Error) => {
        assert.match(err.message, /Cannot extract storage key/);
        assert.match(err.message, /nyc3\.digitaloceanspaces\.com/);
        return true;
      },
    );
  });

  it("throws when the URL contains the endpoint but no object key", async () => {
    await assert.rejects(
      () => deleteFile("https://test-bucket.nyc3.digitaloceanspaces.com/"),
      /no object key/,
    );
  });
});

describe("getFileBuffer (URL drift contract)", () => {
  it("throws when the URL doesn't contain the configured endpoint (CDN drift) instead of falling back to a generic fetch", async () => {
    await assert.rejects(
      () => getFileBuffer("https://cdn.example.com/uploads/photo-123.jpg"),
      (err: Error) => {
        assert.match(err.message, /Cannot extract storage key/);
        assert.match(err.message, /nyc3\.digitaloceanspaces\.com/);
        return true;
      },
    );
  });

  it("throws when the URL contains the endpoint but no object key", async () => {
    await assert.rejects(
      () => getFileBuffer("https://test-bucket.nyc3.digitaloceanspaces.com/"),
      /no object key/,
    );
  });
});
