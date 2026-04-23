#!/usr/bin/env node
// Quick verification script for the IBAN mod-97 checksum logic that lives
// in client/src/lib/saudi-banks.ts. Re-implemented inline here so the script
// is runnable with plain Node (no TypeScript loader required).
//
// Run with: node scripts/verify-iban-checksum.mjs

function validateIbanChecksum(iban) {
  const clean = (iban || "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 5) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) numeric += ch;
    else if (code >= 65 && code <= 90) numeric += (code - 55).toString();
    else return false;
  }
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}

const cases = [
  { iban: "SA0380000000608010167519", expect: true,  label: "known-good SA IBAN" },
  { iban: "SA0380000000608010167518", expect: false, label: "typo'd last digit" },
  { iban: "SA0480000000608010167519", expect: false, label: "typo'd check digit" },
  { iban: "GB82WEST12345698765432",   expect: true,  label: "GB cross-check (good)" },
  { iban: "GB83WEST12345698765432",   expect: false, label: "GB cross-check (typo)" },
];

let failed = 0;
for (const c of cases) {
  const got = validateIbanChecksum(c.iban);
  const ok = got === c.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.label.padEnd(32)} ${c.iban}  -> ${got}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll IBAN checksum checks passed.");
