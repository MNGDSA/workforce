#!/usr/bin/env node
// Generate a PDF report combining k6 summary, artillery summary, DO Insights metrics,
// droplet load averages, and the load-test config.
//
// Usage: node generate-report.mjs <out.pdf>
//   Reads JSON from /tmp/wf-report/*.json
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const outPath = process.argv[2] || "docs/staging-load-test-report.pdf";
const reportDir = process.env.REPORT_DIR || "/tmp/wf-report";

function loadJson(name) {
  const p = path.join(reportDir, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function loadText(name) {
  const p = path.join(reportDir, name);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

const k6 = loadJson("k6-summary.json") || {};
const artillery = loadJson("artillery-report.json") || {};
const insights = loadJson("do-insights.json") || {};
const droplet = loadJson("droplet-stats.json") || {};
const meta = loadJson("meta.json") || {};

const doc = new PDFDocument({ margin: 48, size: "A4", info: {
  Title: "Workforce Staging Load Test Report",
  Author: "Replit Agent",
  Subject: "DigitalOcean staging 100k burst — k6 + artillery",
}});
doc.pipe(fs.createWriteStream(outPath));

function h1(t) { doc.moveDown(0.6).fontSize(20).fillColor("#111").text(t); doc.moveDown(0.3); }
function h2(t) { doc.moveDown(0.4).fontSize(14).fillColor("#222").text(t); doc.moveDown(0.2); }
function p(t)  { doc.fontSize(10).fillColor("#333").text(t, { lineGap: 2 }); }
function kv(k, v) {
  doc.fontSize(10).fillColor("#555").text(`${k}: `, { continued: true }).fillColor("#000").text(String(v));
}
function table(rows) {
  const col1 = 220, col2 = 280, lineH = 14;
  rows.forEach(([k,v]) => {
    const y = doc.y;
    doc.fontSize(10).fillColor("#555").text(k, doc.page.margins.left, y, { width: col1 });
    doc.fontSize(10).fillColor("#000").text(String(v), doc.page.margins.left + col1, y, { width: col2 });
    doc.y = y + lineH;
  });
  doc.moveDown(0.3);
}
function pre(text, max=4000) {
  if (!text) return;
  const trimmed = text.length > max ? text.slice(0, max) + "\n…(truncated)" : text;
  doc.font("Courier").fontSize(8).fillColor("#222").text(trimmed, { lineGap: 1 });
  doc.font("Helvetica");
}

// Title
doc.fontSize(24).fillColor("#0a3").text("Workforce Staging Load Test Report");
doc.fontSize(11).fillColor("#666").text(`Generated ${new Date().toISOString()}`);
doc.moveDown(0.5);
h2("Test environment");
table([
  ["Region", meta.region || "fra1"],
  ["App droplet", `${meta.appDroplet || "workforce-staging-loadtest-app"} (${meta.appSize || "s-4vcpu-8gb"})`],
  ["Driver droplet", `${meta.driverDroplet || "workforce-staging-loadtest-driver"} (${meta.driverSize || "s-2vcpu-4gb"})`],
  ["Managed Postgres", `${meta.dbName || "workforce-staging-loadtest-db"} (${meta.dbSize || "db-s-2vcpu-4gb"} pg16)`],
  ["Spaces bucket", meta.spacesBucket || "workforce-staging-loadtest"],
  ["pgbouncer pool mode", "transaction, default_pool_size=80, max_client_conn=2000"],
  ["App env flags", "NODE_ENV=production + ENABLE_DEV_OTP_LOG=true + ALLOW_DEV_BYPASS_IN_PROD=true + LOAD_TEST_BYPASS_THROTTLE=1"],
  ["SMS plugin", "staging-stub (NO real goinfinito calls)"],
  ["Target URL", meta.targetUrl || "n/a"],
]);

// k6 results
doc.addPage();
h1("k6 results");
const m = k6.metrics || {};
const get = (name, sub="value") => {
  const v = m[name];
  if (!v) return "—";
  return v[sub] ?? v.values?.[sub] ?? JSON.stringify(v.values || v);
};
table([
  ["Total requests", get("http_reqs", "count")],
  ["Total signups (iterations)", get("iterations", "count")],
  ["Throughput (req/s avg)", get("http_reqs", "rate")],
  ["Failed checks", get("checks", "fails")],
  ["Passed checks", get("checks", "passes")],
  ["http_req_duration p50 (ms)", get("http_req_duration", "med")],
  ["http_req_duration p95 (ms)", get("http_req_duration", "p(95)")],
  ["http_req_duration p99 (ms)", get("http_req_duration", "p(99)")],
  ["http_req_failed rate", get("http_req_failed", "rate")],
  ["VUs (max)", get("vus_max", "max") || get("vus_max", "value")],
  ["Test wall clock (s)", k6.state?.testRunDurationMs ? (k6.state.testRunDurationMs/1000).toFixed(1) : "—"],
]);
h2("Threshold outcomes");
const tho = m;
const failedThresh = Object.entries(tho).filter(([_,v]) => v.thresholds && Object.values(v.thresholds).some(t => t.ok === false));
if (failedThresh.length === 0) p("All k6 thresholds passed.");
else failedThresh.forEach(([n,v]) => p(`FAILED ${n}: ${JSON.stringify(v.thresholds)}`));

// Artillery
doc.addPage();
h1("Artillery results");
const a = artillery.aggregate || artillery;
const ac = a.counters || {};
const as = a.summaries || {};
table([
  ["Scenarios completed", ac["vusers.completed"] ?? "—"],
  ["Scenarios created", ac["vusers.created"] ?? "—"],
  ["Scenarios failed", ac["vusers.failed"] ?? "—"],
  ["Total HTTP requests", ac["http.requests"] ?? "—"],
  ["HTTP 2xx", ac["http.codes.200"] ?? "—"],
  ["HTTP 4xx", Object.entries(ac).filter(([k]) => k.startsWith("http.codes.4")).reduce((s, [,v]) => s+v, 0)],
  ["HTTP 5xx", Object.entries(ac).filter(([k]) => k.startsWith("http.codes.5")).reduce((s, [,v]) => s+v, 0)],
  ["Mean req/s", ac["http.request_rate"] ?? "—"],
  ["http.response_time mean", as["http.response_time"]?.mean ?? "—"],
  ["http.response_time p50", as["http.response_time"]?.p50 ?? "—"],
  ["http.response_time p95", as["http.response_time"]?.p95 ?? "—"],
  ["http.response_time p99", as["http.response_time"]?.p99 ?? "—"],
  ["http.response_time max", as["http.response_time"]?.max ?? "—"],
]);

// DO Insights / DB metrics
doc.addPage();
h1("Managed Postgres metrics (DO Insights)");
if (insights.cpu) {
  table([
    ["DB CPU avg %", insights.cpu.avg?.toFixed?.(1) ?? insights.cpu.avg],
    ["DB CPU peak %", insights.cpu.max?.toFixed?.(1) ?? insights.cpu.max],
    ["DB memory avg %", insights.memory?.avg?.toFixed?.(1) ?? "—"],
    ["DB memory peak %", insights.memory?.max?.toFixed?.(1) ?? "—"],
    ["DB load 1m peak", insights.load1?.max?.toFixed?.(2) ?? "—"],
    ["DB connections peak", insights.connections?.max ?? "—"],
    ["Disk IO read peak (B/s)", insights.disk_read?.max ?? "—"],
    ["Disk IO write peak (B/s)", insights.disk_write?.max ?? "—"],
  ]);
} else {
  p("No DB metrics captured (insights.cpu missing).");
}

h2("App droplet load averages");
if (droplet.load1) {
  table([
    ["load1 peak", droplet.load1.max?.toFixed?.(2) ?? droplet.load1.max],
    ["load5 peak", droplet.load5?.max?.toFixed?.(2) ?? "—"],
    ["load15 peak", droplet.load15?.max?.toFixed?.(2) ?? "—"],
    ["CPU user% peak", droplet.cpu_user?.max?.toFixed?.(1) ?? "—"],
    ["Memory used peak (MB)", droplet.mem_mb?.max ?? "—"],
    ["Disk free min (GB)", droplet.disk_free_gb?.min ?? "—"],
  ]);
} else {
  p("No droplet stats captured.");
}

// Raw outputs
doc.addPage();
h1("Raw test artifacts (excerpts)");
h2("k6 stdout (last lines)");
pre(loadText("k6-stdout.txt"));
doc.addPage();
h2("Artillery stdout (last lines)");
pre(loadText("artillery-stdout.txt"));
doc.addPage();
h2("App service log (last lines)");
pre(loadText("app.log"));

// Conclusions
doc.addPage();
h1("Findings & recommendations");
p((meta.conclusions || "See docs/infra-recommendation.md for the comparable analysis from local burst. The DO staging numbers above either confirm or refine those sizing recommendations. If 5xx error count is non-zero or p95 exceeds 5s, scale the app droplet horizontally (add a 2nd s-4vcpu-8gb behind a DO Load Balancer) and raise pgbouncer default_pool_size to 120 before re-running."));

doc.end();
console.log("WROTE", outPath);
