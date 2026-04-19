import { insertSMPCompanySchema } from "../shared/schema";

let pass = 0, fail = 0;
function eq(actual: unknown, expected: unknown, name: string) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`); }
}

const base = { name: "Acme SMP", contactName: "Jane Doe" };

// Accepts and normalizes valid Saudi mobile inputs
const r1 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "+966501234567" });
eq(r1.success, true, "create accepts +966 form");
eq(r1.success && r1.data.contactPhone, "0501234567", "create normalizes +966 → canonical");

const r2 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "00966 50 123 4567" });
eq(r2.success && r2.data.contactPhone, "0501234567", "create normalizes 00966+spaces");

const r3 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "٠٥٠١٢٣٤٥٦٧" });
eq(r3.success && r3.data.contactPhone, "0501234567", "create normalizes Arabic-Indic digits");

const r4 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "0501234567" });
eq(r4.success && r4.data.contactPhone, "0501234567", "create accepts already-canonical");

// Rejects malformed values with invalid_sa_mobile
const r5 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "0411234567" });
eq(r5.success, false, "create rejects landline");
eq(!r5.success && r5.error.issues[0].message, "invalid_sa_mobile", "landline error code");

const r6 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "abc" });
eq(r6.success, false, "create rejects letters");
eq(!r6.success && r6.error.issues[0].message, "invalid_sa_mobile", "letters error code");

const r7 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "05012345678" });
eq(r7.success, false, "create rejects 11 digits");

// Optional + nullable: empty/null/missing all coalesce to null (not invalid)
const r8 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: "" });
eq(r8.success && r8.data.contactPhone, null, "create empty string → null");

const r9 = insertSMPCompanySchema.safeParse({ ...base, contactPhone: null });
eq(r9.success && r9.data.contactPhone, null, "create null preserved");

const r10 = insertSMPCompanySchema.safeParse(base);
eq(r10.success, true, "create accepts missing contactPhone");

// PATCH semantics via .partial() — same shape used by the PATCH route
const patchSchema = insertSMPCompanySchema.partial();

const p1 = patchSchema.safeParse({ contactPhone: "+966501234567" });
eq(p1.success && p1.data.contactPhone, "0501234567", "patch normalizes +966");

const p2 = patchSchema.safeParse({ contactPhone: "0411234567" });
eq(p2.success, false, "patch rejects landline");
eq(!p2.success && p2.error.issues[0].message, "invalid_sa_mobile", "patch landline error code");

const p3 = patchSchema.safeParse({ contactPhone: null });
eq(p3.success && p3.data.contactPhone, null, "patch null clears");

const p4 = patchSchema.safeParse({ contactPhone: "" });
eq(p4.success && p4.data.contactPhone, null, "patch empty → null");

const p5 = patchSchema.safeParse({ name: "Renamed SMP" });
eq(p5.success, true, "patch without contactPhone field allowed");
eq(p5.success && "contactPhone" in p5.data, false, "patch omitted contactPhone is absent (preserves DB value)");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
