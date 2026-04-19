import { normalizeSaPhone, cleanContactPhone, saPhoneSchema, optionalSaPhoneSchema, patchSaPhoneSchema } from "../shared/phone";
import { z } from "zod";

let pass = 0, fail = 0;
function eq(actual: unknown, expected: unknown, name: string) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`); }
}

// normalizeSaPhone
eq(normalizeSaPhone("0501234567"),    "0501234567",  "already canonical");
eq(normalizeSaPhone("501234567"),     "0501234567",  "9-digit no prefix");
eq(normalizeSaPhone("+966501234567"), "0501234567",  "+966 prefix");
eq(normalizeSaPhone("966501234567"),  "0501234567",  "966 prefix");
eq(normalizeSaPhone("00966501234567"),"0501234567",  "00966 prefix");
eq(normalizeSaPhone("050 123 4567"),  "0501234567",  "spaces");
eq(normalizeSaPhone("050-123-4567"),  "0501234567",  "dashes");
eq(normalizeSaPhone("(050) 123.4567"),"0501234567",  "parens+dots");
eq(normalizeSaPhone("٠٥٠١٢٣٤٥٦٧"),     "0501234567",  "arabic-indic digits");
eq(normalizeSaPhone(" +966 50 123 4567 "), "0501234567","mixed");
eq(normalizeSaPhone("0411234567"),    null,          "reject landline");
eq(normalizeSaPhone("123"),           null,          "reject too short");
eq(normalizeSaPhone(""),              null,          "reject empty");
eq(normalizeSaPhone(null),            null,          "reject null");
eq(normalizeSaPhone("abc"),           null,          "reject letters");
eq(normalizeSaPhone("05012345678"),   null,          "reject 11 digits");

// cleanContactPhone — international permitted
eq(cleanContactPhone("+201234567890"), "+201234567890", "egypt international");
eq(cleanContactPhone("0501234567"),    "0501234567",    "saudi local");
eq(cleanContactPhone("abc"),           null,            "reject letters");

// saPhoneSchema (Zod)
eq(saPhoneSchema.safeParse("+966501234567").success, true,  "zod accepts +966");
eq(saPhoneSchema.safeParse("0501234567").success,    true,  "zod accepts canonical");
eq(saPhoneSchema.safeParse("0411234567").success,    false, "zod rejects landline");
eq(saPhoneSchema.safeParse("").success,              false, "zod rejects empty");
const ok = saPhoneSchema.safeParse("+966 50 123 4567");
eq(ok.success && ok.data, "0501234567", "zod normalizes mixed input");

// optional
eq(optionalSaPhoneSchema.safeParse(null).success,        true, "optional accepts null");
eq(optionalSaPhoneSchema.safeParse("").success,          true, "optional accepts empty string");
const opt = optionalSaPhoneSchema.safeParse("");
eq(opt.success && opt.data, null, "optional empty → null");
eq(optionalSaPhoneSchema.safeParse("garbage").success,   false,"optional rejects garbage");

// patchSaPhoneSchema — critical: omitted key MUST stay undefined (no DB clear)
const patchObj = z.object({ phone: patchSaPhoneSchema, name: z.string().optional() });
const omitted = patchObj.parse({ name: "x" });
eq(omitted.phone, undefined, "patch: omitted phone stays undefined");
const explicitNull = patchObj.parse({ phone: null });
eq(explicitNull.phone, null, "patch: explicit null clears");
const explicitEmpty = patchObj.parse({ phone: "" });
eq(explicitEmpty.phone, null, "patch: empty string clears");
const explicitValid = patchObj.parse({ phone: "+966501234567" });
eq(explicitValid.phone, "0501234567", "patch: valid value normalizes");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
