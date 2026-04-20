// Task #108 (Workstream 2 prototype) — attendance Rekognition
// CompareFaces cost model.
//
// Models the four candidate strategies described in
// docs/rd/02-attendance-cost.md against synthetic seasonal event
// streams. Outputs a comparison table.
//
// Run: `npx tsx scripts/rekognition-cost-model.ts`
//      `npx tsx scripts/rekognition-cost-model.ts --workers 5000 --days 30`
//
// This is a deterministic model, not a Monte Carlo simulation. All
// numbers are derivable from the inputs by hand — the script just
// makes it easy to sweep different tenant sizes.

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
}

main();
