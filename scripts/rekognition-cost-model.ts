// Task #108 (Workstream 2 prototype) — attendance Rekognition
// CompareFaces cost model + synthetic FAR simulator.
//
// Models the four candidate strategies described in
// docs/rd/02-attendance-cost.md against a synthetic 10k-worker
// event stream. Outputs:
//   1. A deterministic cost comparison table (calls + USD per season).
//   2. A Monte Carlo false-accept-rate (FAR) measurement per strategy
//      using a documented synthetic similarity distribution.
//
// Run: `npx tsx scripts/rekognition-cost-model.ts`
//      `npx tsx scripts/rekognition-cost-model.ts --workers 5000 --days 30`
//      `npx tsx scripts/rekognition-cost-model.ts --simulate-far`
//      `npx tsx scripts/rekognition-cost-model.ts --simulate-far --shifts 200000 --seed 42`
//
// FAR caveat: the simulator uses parameterized synthetic similarity
// distributions (impostor: mean=30 sd=15; genuine: mean=92 sd=5),
// not measurements from a real labeled dataset. The numbers are
// useful for *relative* comparison between strategies (which is what
// Workstream 2 requires for the rollout decision); absolute FAR
// values must be re-measured against real attendance traffic before
// any production rollout.

interface ModelInputs {
  workers: number;
  days: number;
  eventsPerWorkerPerDay: number;
  pricePerCompareFaces: number; // USD
  // Strategy C — assumed escalation rate (fraction of events that
  // fall below the on-device confidence threshold and trigger a
  // server-side CompareFaces).
  onDeviceEscalationRate: number;
  // Strategy D — sampling N (verify every Nth event after the
  // first event of a shift).
  samplingN: number;
}

interface StrategyResult {
  name: string;
  description: string;
  compareFacesCalls: number;
  costUsd: number;
}

function model(inp: ModelInputs): StrategyResult[] {
  const totalEvents = inp.workers * inp.days * inp.eventsPerWorkerPerDay;
  const totalShifts = inp.workers * inp.days; // 1 shift / worker / day

  const strategies: StrategyResult[] = [
    {
      name: "A — per-event (status quo)",
      description: "CompareFaces on every clock event",
      compareFacesCalls: totalEvents,
      costUsd: totalEvents * inp.pricePerCompareFaces,
    },
    {
      name: "B — once-per-shift token",
      description: "CompareFaces on first event of each shift; token covers the rest",
      compareFacesCalls: totalShifts,
      costUsd: totalShifts * inp.pricePerCompareFaces,
    },
    {
      name: "C — on-device + escalation",
      description: `On-device verification with ${(inp.onDeviceEscalationRate * 100).toFixed(0)}% escalation to server`,
      compareFacesCalls: Math.round(totalEvents * inp.onDeviceEscalationRate),
      costUsd: Math.round(totalEvents * inp.onDeviceEscalationRate) * inp.pricePerCompareFaces,
    },
    {
      name: `D — sampled, N=${inp.samplingN}`,
      description: `First event of every shift + every ${inp.samplingN}th event afterwards`,
      compareFacesCalls: totalShifts + Math.floor((totalEvents - totalShifts) / inp.samplingN),
      costUsd: (totalShifts + Math.floor((totalEvents - totalShifts) / inp.samplingN)) * inp.pricePerCompareFaces,
    },
  ];

  return strategies;
}

// ─────────────────────────────────────────────────────────────────────
// Monte Carlo FAR simulator.
//
// Setup: each "shift" has E events. With probability p_attack a
// shift contains an impostor attempting to clock in for someone
// else; otherwise the genuine worker. For each verification call,
// we draw a similarity score from the appropriate distribution and
// accept iff score >= threshold (default 80, matching production).
// FAR is the fraction of impostor shifts that result in at least
// one accepted clock event.

interface SimInputs {
  shifts: number;
  eventsPerShift: number;
  attackProbability: number;
  threshold: number;
  // On-device verifier (Strategy C) is modeled as a coarser check:
  // we shift the impostor distribution mean +5 (more permissive) to
  // reflect lower-quality on-device models. 5% of events escalate.
  onDeviceImpostorBias: number;
  onDeviceEscalationRate: number;
  samplingN: number;
  seed: number;
}

// Mulberry32 — small, deterministic PRNG so runs with --seed are
// reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller normal sample.
function normal(rng: () => number, mean: number, sd: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clampSimilarity(s: number): number {
  return Math.max(0, Math.min(100, s));
}

interface SimResult {
  strategy: string;
  impostorShifts: number;
  successfulImpostorShifts: number; // ≥1 accepted event in impostor shift
  far: number;                       // successful / impostor shifts
}

function simulate(sim: SimInputs): SimResult[] {
  const rng = mulberry32(sim.seed);
  const results: Record<string, { impostor: number; success: number }> = {
    A: { impostor: 0, success: 0 },
    B: { impostor: 0, success: 0 },
    C: { impostor: 0, success: 0 },
    D: { impostor: 0, success: 0 },
  };

  for (let shift = 0; shift < sim.shifts; shift++) {
    const isImpostor = rng() < sim.attackProbability;
    const meanGood = 92, sdGood = 5;
    const meanBad = 30, sdBad = 15;
    if (isImpostor) {
      results.A.impostor++;
      results.B.impostor++;
      results.C.impostor++;
      results.D.impostor++;
    }

    // Pre-draw all per-event similarity scores for this shift so
    // the same draws are evaluated consistently across strategies.
    const serverScores: number[] = [];
    const onDeviceScores: number[] = [];
    for (let e = 0; e < sim.eventsPerShift; e++) {
      const baseMean = isImpostor ? meanBad : meanGood;
      const baseSd = isImpostor ? sdBad : sdGood;
      serverScores.push(clampSimilarity(normal(rng, baseMean, baseSd)));
      // On-device is more lenient: bias impostor mean upward.
      const odMean = isImpostor ? baseMean + sim.onDeviceImpostorBias : baseMean;
      onDeviceScores.push(clampSimilarity(normal(rng, odMean, baseSd)));
    }

    const accept = (s: number) => s >= sim.threshold;

    // Strategy A — verify every event server-side. Impostor succeeds
    // if ANY server score happens to clear threshold.
    if (isImpostor && serverScores.some(accept)) results.A.success++;

    // Strategy B — verify only first event server-side; rest covered
    // by session token (no further checks). Impostor succeeds if
    // first server score clears.
    if (isImpostor && accept(serverScores[0])) results.B.success++;

    // Strategy C — on-device verify each event; escalate to server
    // with probability `escalationRate` per event. Impostor succeeds
    // if on every event either on-device passes or (escalation fires
    // AND server passes — server is genuine path so impostor is
    // unlikely to pass after escalation).
    let cFailed = false;
    for (let e = 0; e < sim.eventsPerShift; e++) {
      const onDevicePass = accept(onDeviceScores[e]);
      const escalates = rng() < sim.onDeviceEscalationRate;
      const serverPassIfEscalated = accept(serverScores[e]);
      const eventAccepted =
        onDevicePass && (!escalates || serverPassIfEscalated);
      if (!eventAccepted) { cFailed = true; break; }
    }
    if (isImpostor && !cFailed) results.C.success++;

    // Strategy D — verify event 0 + every Nth event after. Other
    // events accepted unconditionally.
    let dFailed = false;
    for (let e = 0; e < sim.eventsPerShift; e++) {
      const verified = e === 0 || ((e - 0) % sim.samplingN === 0);
      if (verified && !accept(serverScores[e])) { dFailed = true; break; }
    }
    if (isImpostor && !dFailed) results.D.success++;
  }

  return [
    { strategy: "A — per-event (status quo)",  impostorShifts: results.A.impostor, successfulImpostorShifts: results.A.success, far: results.A.impostor === 0 ? 0 : results.A.success / results.A.impostor },
    { strategy: "B — once-per-shift token",    impostorShifts: results.B.impostor, successfulImpostorShifts: results.B.success, far: results.B.impostor === 0 ? 0 : results.B.success / results.B.impostor },
    { strategy: "C — on-device + escalation",  impostorShifts: results.C.impostor, successfulImpostorShifts: results.C.success, far: results.C.impostor === 0 ? 0 : results.C.success / results.C.impostor },
    { strategy: "D — sampled, N=4",            impostorShifts: results.D.impostor, successfulImpostorShifts: results.D.success, far: results.D.impostor === 0 ? 0 : results.D.success / results.D.impostor },
  ];
}

function parseArgs(argv: string[]): ModelInputs {
  const get = (k: string, fallback: number): number => {
    const idx = argv.indexOf(`--${k}`);
    if (idx >= 0 && idx + 1 < argv.length) {
      const v = Number(argv[idx + 1]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return fallback;
  };
  return {
    workers: get("workers", 10000),
    days: get("days", 30),
    eventsPerWorkerPerDay: get("events-per-day", 2),
    pricePerCompareFaces: get("price", 0.001),
    onDeviceEscalationRate: get("escalation-rate", 0.05),
    samplingN: get("sampling-n", 4),
  };
}

function fmtUsd(n: number): string {
  return "$" + n.toFixed(2);
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function parseSimArgs(argv: string[], samplingN: number): SimInputs {
  const get = (k: string, fallback: number): number => {
    const idx = argv.indexOf(`--${k}`);
    if (idx >= 0 && idx + 1 < argv.length) {
      const v = Number(argv[idx + 1]);
      if (Number.isFinite(v)) return v;
    }
    return fallback;
  };
  return {
    shifts: get("shifts", 100000),
    eventsPerShift: get("events-per-shift", 2),
    attackProbability: get("attack-rate", 0.01),
    threshold: get("threshold", 80),
    onDeviceImpostorBias: get("on-device-bias", 5),
    onDeviceEscalationRate: get("escalation-rate", 0.05),
    samplingN,
    seed: get("seed", 1337),
  };
}

function main() {
  const inputs = parseArgs(process.argv.slice(2));
  const results = model(inputs);

  console.log("=".repeat(80));
  console.log("Rekognition CompareFaces cost model");
  console.log("=".repeat(80));
  console.log(`Workers per tenant:           ${fmtInt(inputs.workers)}`);
  console.log(`Days per season:              ${inputs.days}`);
  console.log(`Events per worker per day:    ${inputs.eventsPerWorkerPerDay}`);
  console.log(`Price per CompareFaces:       ${fmtUsd(inputs.pricePerCompareFaces)}`);
  console.log(`On-device escalation rate:    ${(inputs.onDeviceEscalationRate * 100).toFixed(1)}%`);
  console.log(`Sampling N (strategy D):      ${inputs.samplingN}`);
  console.log("");

  const headers = ["Strategy", "Calls/season", "Cost/season", "vs status quo"];
  const baseline = results[0].compareFacesCalls;

  const rows = results.map(r => {
    const reduction = ((baseline - r.compareFacesCalls) / baseline * 100);
    return [
      r.name,
      fmtInt(r.compareFacesCalls),
      fmtUsd(r.costUsd),
      reduction === 0 ? "—" : `-${reduction.toFixed(0)}%`,
    ];
  });

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length)),
  );

  const printRow = (cells: string[]) => {
    console.log(cells.map((c, i) => c.padEnd(widths[i])).join(" │ "));
  };

  printRow(headers);
  console.log(widths.map(w => "─".repeat(w)).join("─┼─"));
  for (const row of rows) printRow(row);

  console.log("");
  console.log("Per-worker per-season cost:");
  for (const r of results) {
    const perWorker = r.costUsd / inputs.workers;
    console.log(`  ${r.name.padEnd(40)}  ${fmtUsd(perWorker)}`);
  }
  console.log("");
  console.log("Notes:");
  for (const r of results) {
    console.log(`  • ${r.name}: ${r.description}`);
  }

  if (process.argv.includes("--simulate-far")) {
    const sim = parseSimArgs(process.argv.slice(2), inputs.samplingN);
    const simResults = simulate(sim);
    console.log("");
    console.log("=".repeat(80));
    console.log("Synthetic FAR simulation");
    console.log("=".repeat(80));
    console.log(`Shifts simulated:           ${fmtInt(sim.shifts)}`);
    console.log(`Events per shift:           ${sim.eventsPerShift}`);
    console.log(`Attack probability/shift:   ${(sim.attackProbability * 100).toFixed(2)}%`);
    console.log(`Threshold:                  ${sim.threshold}`);
    console.log(`Seed:                       ${sim.seed}`);
    console.log(`Genuine sim ~ N(92,5)  Impostor sim ~ N(30,15)  (clamped 0..100)`);
    console.log(`On-device impostor bias:    +${sim.onDeviceImpostorBias} (less accurate verifier)`);
    console.log("");
    console.log("Strategy                       │ Impostor shifts │ Bypassed │   FAR");
    console.log("───────────────────────────────┼─────────────────┼──────────┼──────────");
    for (const r of simResults) {
      console.log(
        `${r.strategy.padEnd(30)} │ ${String(r.impostorShifts).padStart(15)} │ ${String(r.successfulImpostorShifts).padStart(8)} │ ${(r.far * 100).toFixed(3).padStart(7)}%`,
      );
    }
    console.log("");
    console.log("Caveat: synthetic distributions, not real Rekognition output.");
    console.log("Useful for relative comparison only.");
  }
}

main();
