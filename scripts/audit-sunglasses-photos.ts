// scripts/audit-sunglasses-photos.ts ─ Task #143 audit.
//
// Why:
//   Task #143 added a sunglasses gate to `validateFaceQuality` so new
//   profile photos with sunglasses are rejected at upload time. That
//   leaves a bow-wave: candidates whose photo was already approved
//   under the old gate (which never read `Sunglasses`) may have
//   sunglasses on file. The clock-in CompareFaces flow then fights
//   those photos. This script lets the operator see how many
//   already-approved photos would now be rejected, so they can decide
//   whether to ask those candidates to re-upload.
//
// What it does (READ-ONLY):
//   1. Pulls every candidate where `has_photo = true` AND
//      `photo_url IS NOT NULL` from prod.
//   2. For each, downloads the bytes via `getFileBuffer`, calls
//      Rekognition `DetectFaces` with `Attributes: ["ALL"]` (same
//      payload the upload path uses — already paid for), and inspects
//      the `Sunglasses` field.
//   3. Writes `.local/sunglasses-audit-report.csv` with one row per
//      candidate: candidate_id, photo_url, sunglasses_value (true/false/
//      unknown), sunglasses_confidence (or empty), would_reject
//      (true if Value=true && Confidence>=80, matching the new gate),
//      error (if DetectFaces failed for that photo).
//   4. Prints a top-line count: how many candidates would be rejected
//      by the new gate.
//
// No writes. Re-runnable. Safe to run against prod.
//
// Usage:
//   PROD_DATABASE_URL=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
//     tsx scripts/audit-sunglasses-photos.ts
//   tsx scripts/audit-sunglasses-photos.ts --limit 50   # sample run

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

type Row = { id: string; photo_url: string };

type AuditRecord = {
  candidate_id: string;
  photo_url: string;
  sunglasses_value: "true" | "false" | "unknown";
  sunglasses_confidence: string;
  would_reject: boolean;
  error: string;
};

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null;
  return { limit };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));
  const url = (process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || "").replace("sslmode=require", "sslmode=no-verify");
  if (!url) { console.error("ERROR: PROD_DATABASE_URL (or DATABASE_URL) must be set."); process.exit(1); }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("ERROR: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY must be set.");
    process.exit(1);
  }

  const { RekognitionClient, DetectFacesCommand } = await import("@aws-sdk/client-rekognition");
  const { getFileBuffer } = await import("../server/file-storage");

  const awsRegion = process.env.AWS_REGION ?? "me-south-1";
  const rek = new RekognitionClient({
    region: awsRegion,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
  });

  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log(`[audit-sunglasses] mode=READ-ONLY limit=${limit ?? "ALL"} region=${awsRegion}`);

  const limitClause = limit ? `LIMIT ${Number(limit)}` : "";
  const { rows } = await pg.query<Row>(
    `SELECT id, photo_url
       FROM candidates
      WHERE has_photo = true
        AND photo_url IS NOT NULL
        AND photo_url <> ''
      ORDER BY id
      ${limitClause}`,
  );
  console.log(`[audit-sunglasses] inspecting ${rows.length} approved profile photos…`);

  const records: AuditRecord[] = [];
  let wouldReject = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if ((i + 1) % 25 === 0 || i === 0) {
      process.stdout.write(`  [${i + 1}/${rows.length}] ${r.id}\n`);
    }
    let bytes: Buffer;
    try {
      bytes = await getFileBuffer(r.photo_url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      records.push({
        candidate_id: r.id, photo_url: r.photo_url,
        sunglasses_value: "unknown", sunglasses_confidence: "",
        would_reject: false, error: `fetch_failed: ${msg}`,
      });
      errors++;
      continue;
    }

    try {
      const resp = await rek.send(new DetectFacesCommand({
        Image: { Bytes: bytes },
        Attributes: ["ALL"],
      }));
      const face = (resp.FaceDetails ?? [])[0];
      if (!face) {
        records.push({
          candidate_id: r.id, photo_url: r.photo_url,
          sunglasses_value: "unknown", sunglasses_confidence: "",
          would_reject: false, error: "no_face_detected",
        });
        continue;
      }
      const value = face.Sunglasses?.Value;
      const conf = face.Sunglasses?.Confidence ?? 0;
      const reject = value === true && conf >= 80;
      if (reject) wouldReject++;
      records.push({
        candidate_id: r.id, photo_url: r.photo_url,
        sunglasses_value: value === true ? "true" : value === false ? "false" : "unknown",
        sunglasses_confidence: value === undefined ? "" : conf.toFixed(2),
        would_reject: reject, error: "",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      records.push({
        candidate_id: r.id, photo_url: r.photo_url,
        sunglasses_value: "unknown", sunglasses_confidence: "",
        would_reject: false, error: `rekognition_failed: ${msg}`,
      });
      errors++;
    }
  }

  const reportPath = path.resolve(".local/sunglasses-audit-report.csv");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const header = ["candidate_id", "photo_url", "sunglasses_value", "sunglasses_confidence", "would_reject", "error"].join(",");
  const lines = records.map((r) => [r.candidate_id, r.photo_url, r.sunglasses_value, r.sunglasses_confidence, r.would_reject ? "true" : "false", r.error].map(csvEscape).join(","));
  fs.writeFileSync(reportPath, [header, ...lines].join("\n") + "\n");

  console.log("");
  console.log("[audit-sunglasses] ─────── SUMMARY ───────");
  console.log(`  inspected     : ${rows.length}`);
  console.log(`  would_reject  : ${wouldReject}`);
  console.log(`  errors        : ${errors}`);
  console.log(`  report        : ${reportPath}`);

  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
