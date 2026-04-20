// Task #108 (Workstream 3 prototype) — identity-binding harness.
//
// Runs Approach A from docs/rd/03-identity-binding.md (CompareFaces
// between an uploaded national ID image and a profile photo)
// against either:
//   1. a labeled directory of real test pairs (--samples-dir), OR
//   2. a synthetic similarity distribution (--synthetic) for
//      methodology validation when real samples are not yet
//      provisioned.
//
// The synthetic mode draws similarity scores from documented
// distributions (genuine matches ~ N(82, 8); impostor pairs ~ N(35,
// 18); ID-photo glare/age noise applied) and reports the same
// confusion matrix the real-data mode would. The methodology and
// output shape are identical — only the source of similarity scores
// differs. Synthetic numbers are useful for:
//   • Validating the harness produces well-formed metrics.
//   • Picking initial threshold candidates for real-data sweeps.
//   • Sanity-checking that thresholds in the 80–90 range yield
//     usable precision/recall before paying for real Rekognition
//     calls on a live sample.
// Synthetic numbers are NOT a substitute for measurements on a real
// labeled sample before production rollout.
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

function parseArgs(argv: string[]): { samplesDir: string; thresholds: number[]; region: string; synthetic: boolean; syntheticPairs: number; seed: number } {
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
    synthetic: argv.includes("--synthetic"),
    syntheticPairs: Number(get("synthetic-pairs", "200")) || 200,
    seed: Number(get("seed", "4242")) || 4242,
  };
}

// Mulberry32 — small, deterministic PRNG.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number, mean: number, sd: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Build synthetic results matching the same RawResult shape that
// real CompareFaces calls produce. Half the pairs are genuine
// (expectedMatch=true) drawn from N(82,8); half are impostor
// (expectedMatch=false) drawn from N(35,18). Distributions reflect
// real-world ID-vs-selfie noise (glare on ID, ageing, hair changes
// in the live photo) being meaningfully wider than selfie-vs-
// selfie noise.
function generateSyntheticResults(n: number, seed: number): RawResult[] {
  const rng = mulberry32(seed);
  const results: RawResult[] = [];
  for (let i = 0; i < n; i++) {
    const isGenuine = i < n / 2;
    const mean = isGenuine ? 82 : 35;
    const sd = isGenuine ? 8 : 18;
    const sim = Math.max(0, Math.min(100, normal(rng, mean, sd)));
    results.push({
      pair: {
        id: `synthetic-${String(i).padStart(4, "0")}`,
        idPhotoPath: "",
        profilePhotoPath: "",
        expectedMatch: isGenuine,
      },
      similarity: sim,
    });
  }
  return results;
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
  let results: RawResult[];

  if (args.synthetic) {
    console.log(`Synthetic mode: generating ${args.syntheticPairs} pairs (seed=${args.seed})`);
    console.log(`Distributions: genuine ~ N(82,8); impostor ~ N(35,18); clamped 0..100.`);
    console.log(`Thresholds to evaluate: ${args.thresholds.join(", ")}`);
    console.log("");
    results = generateSyntheticResults(args.syntheticPairs, args.seed);
  } else {
    if (!args.samplesDir) {
      console.error("Missing --samples-dir <path> (or pass --synthetic).");
      console.error("See header for required directory layout.");
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

    results = [];
    for (const p of pairs) {
      process.stdout.write(`  → ${p.id} … `);
      const r = await comparePair(p, args.region);
      if (r.error) console.log(`ERROR (${r.error})`);
      else console.log(`similarity=${r.similarity.toFixed(2)} expected=${p.expectedMatch}`);
      results.push(r);
    }
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
