// Task #108 (Workstream 3 prototype) — identity-binding harness.
//
// Runs Approach A from docs/rd/03-identity-binding.md (CompareFaces
// between an uploaded national ID image and a profile photo)
// against a labeled directory of test pairs and reports the
// confusion-matrix metrics at a sweep of similarity thresholds.
//
// Sample data is intentionally NOT committed to the repo. The
// operator running this harness must populate a directory of
// labeled pairs as follows:
//
//   <samples-dir>/
//     pair-001/
//       id-photo.jpg          ← scan / photo of the national ID
//       profile-photo.jpg     ← what the worker uploaded as their selfie
//       expected-match.txt    ← contains exactly "true" or "false"
//     pair-002/
//       ...
//
// Run: `npx tsx scripts/identity-binding-harness.ts --samples-dir /path/to/samples`
//      `npx tsx scripts/identity-binding-harness.ts --samples-dir ./samples --thresholds 70,80,85,90`
//
// Requires AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in env.
// Region defaults to me-south-1 (matching production).
//
// Output: a confusion matrix per threshold so the operator can
// pick the operating point that matches the desired
// false-positive / false-negative trade-off.

import fs from "fs";
import path from "path";

interface Pair {
  id: string;
  idPhotoPath: string;
  profilePhotoPath: string;
  expectedMatch: boolean;
}

interface RawResult {
  pair: Pair;
  similarity: number; // 0..100, or -1 on error
  error?: string;
}

interface ThresholdMetrics {
  threshold: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  errors: number;
}

function parseArgs(argv: string[]): { samplesDir: string; thresholds: number[]; region: string } {
  const get = (k: string, fallback: string): string => {
    const idx = argv.indexOf(`--${k}`);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
  };
  const thresholdStr = get("thresholds", "70,80,85,90");
  return {
    samplesDir: get("samples-dir", ""),
    thresholds: thresholdStr.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n)),
    region: get("region", process.env.AWS_REGION ?? "me-south-1"),
  };
}

function loadPairs(samplesDir: string): Pair[] {
  if (!fs.existsSync(samplesDir)) {
    throw new Error(`Samples directory not found: ${samplesDir}`);
  }
  const entries = fs.readdirSync(samplesDir, { withFileTypes: true });
  const pairs: Pair[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(samplesDir, e.name);
    const idPhoto = ["id-photo.jpg", "id-photo.jpeg", "id-photo.png"]
      .map(n => path.join(dir, n))
      .find(p => fs.existsSync(p));
    const profilePhoto = ["profile-photo.jpg", "profile-photo.jpeg", "profile-photo.png"]
      .map(n => path.join(dir, n))
      .find(p => fs.existsSync(p));
    const expectedFile = path.join(dir, "expected-match.txt");
    if (!idPhoto || !profilePhoto || !fs.existsSync(expectedFile)) {
      console.warn(`Skipping ${e.name}: missing one of id-photo / profile-photo / expected-match.txt`);
      continue;
    }
    const expectedRaw = fs.readFileSync(expectedFile, "utf8").trim().toLowerCase();
    if (expectedRaw !== "true" && expectedRaw !== "false") {
      console.warn(`Skipping ${e.name}: expected-match.txt must contain "true" or "false"`);
      continue;
    }
    pairs.push({
      id: e.name,
      idPhotoPath: idPhoto,
      profilePhotoPath: profilePhoto,
      expectedMatch: expectedRaw === "true",
    });
  }
  return pairs;
}

async function comparePair(pair: Pair, region: string): Promise<RawResult> {
  const { RekognitionClient, CompareFacesCommand } = await import("@aws-sdk/client-rekognition");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    return { pair, similarity: -1, error: "AWS credentials not set" };
  }
  const client = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    const sourceBytes = fs.readFileSync(pair.profilePhotoPath);
    const targetBytes = fs.readFileSync(pair.idPhotoPath);
    const cmd = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: 0, // capture full distribution
    });
    const resp = await client.send(cmd);
    const top = resp.FaceMatches?.[0];
    return { pair, similarity: top?.Similarity ?? 0 };
  } catch (err: any) {
    return { pair, similarity: -1, error: err?.message ?? "unknown" };
  }
}

function computeMetrics(results: RawResult[], threshold: number): ThresholdMetrics {
  const m: ThresholdMetrics = {
    threshold,
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    errors: 0,
  };
  for (const r of results) {
    if (r.similarity < 0) {
      m.errors++;
      continue;
    }
    const predicted = r.similarity >= threshold;
    if (predicted && r.pair.expectedMatch) m.truePositives++;
    else if (predicted && !r.pair.expectedMatch) m.falsePositives++;
    else if (!predicted && !r.pair.expectedMatch) m.trueNegatives++;
    else m.falseNegatives++;
  }
  return m;
}

function rate(num: number, denom: number): string {
  if (denom === 0) return "  n/a";
  return ((num / denom) * 100).toFixed(1).padStart(5) + "%";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.samplesDir) {
    console.error("Missing --samples-dir <path>. See header for required directory layout.");
    process.exit(2);
  }
  const pairs = loadPairs(args.samplesDir);
  if (pairs.length === 0) {
    console.error(`No valid pairs found in ${args.samplesDir}.`);
    process.exit(2);
  }

  console.log(`Loaded ${pairs.length} labeled pair(s) from ${args.samplesDir}`);
  console.log(`Region: ${args.region}`);
  console.log(`Thresholds to evaluate: ${args.thresholds.join(", ")}`);
  console.log("");

  const results: RawResult[] = [];
  for (const p of pairs) {
    process.stdout.write(`  → ${p.id} … `);
    const r = await comparePair(p, args.region);
    if (r.error) console.log(`ERROR (${r.error})`);
    else console.log(`similarity=${r.similarity.toFixed(2)} expected=${p.expectedMatch}`);
    results.push(r);
  }

  console.log("");
  console.log("Confusion matrix per threshold:");
  console.log("");
  console.log("Threshold │   TP │   FP │   TN │   FN │ Errors │ Precision │ Recall │ Specificity");
  console.log("──────────┼──────┼──────┼──────┼──────┼────────┼───────────┼────────┼────────────");
  for (const t of args.thresholds) {
    const m = computeMetrics(results, t);
    const precision = rate(m.truePositives, m.truePositives + m.falsePositives);
    const recall = rate(m.truePositives, m.truePositives + m.falseNegatives);
    const specificity = rate(m.trueNegatives, m.trueNegatives + m.falsePositives);
    console.log(
      `   ${String(t).padStart(2)}     │ ${String(m.truePositives).padStart(4)} │ ${String(m.falsePositives).padStart(4)} │ ${String(m.trueNegatives).padStart(4)} │ ${String(m.falseNegatives).padStart(4)} │ ${String(m.errors).padStart(6)} │   ${precision}  │ ${recall} │   ${specificity}`,
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
