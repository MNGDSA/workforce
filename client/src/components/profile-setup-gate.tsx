import { useState, useEffect, ReactNode, useMemo } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { nationalityLabel } from "@/lib/i18n/nationalities";
import {
  Building2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  User,
  Heart,
  BookOpen,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { resolveSaudiBank } from "@/lib/saudi-banks";
import { formatNumber } from "@/lib/format";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoredCandidate = {
  id: string;
  fullNameEn: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  profileCompleted?: boolean;
  source?: string;
};

// ─── Constants (canonical English values; UI labels resolved via i18n) ───────

const PINNED_NATIONALITIES = [
  "Saudi Arabian", "Yemeni", "Burmese", "Syrian", "Jordanian", "Egyptian",
  "Pakistani", "Indian", "Bangladeshi", "Nigerian", "Eritrean", "Chadian",
  "Ethiopian", "Filipino", "Thai",
];

const ALL_NATIONALITIES = [
  "Afghan", "Albanian", "Algerian", "American", "Andorran", "Angolan",
  "Antiguan and Barbudan", "Argentine", "Armenian", "Australian", "Austrian",
  "Azerbaijani", "Bahamian", "Bahraini", "Bangladeshi", "Barbadian",
  "Belarusian", "Belgian", "Belizean", "Beninese", "Bhutanese", "Bolivian",
  "Bosnian and Herzegovinian", "Botswanan", "Brazilian", "Bruneian",
  "Bulgarian", "Burkinabé", "Burmese", "Burundian", "Cabo Verdean",
  "Cambodian", "Cameroonian", "Canadian", "Central African", "Chadian",
  "Chilean", "Chinese", "Colombian", "Comorian", "Congolese (DRC)",
  "Congolese (Republic)", "Costa Rican", "Croatian", "Cuban", "Cypriot",
  "Czech", "Danish", "Djiboutian", "Dominican", "Dominican (Republic)",
  "Dutch", "East Timorese", "Ecuadorian", "Egyptian", "Emirati",
  "Equatorial Guinean", "Eritrean", "Estonian", "Eswatini", "Ethiopian",
  "Fijian", "Finnish", "French", "Gabonese", "Gambian", "Georgian",
  "German", "Ghanaian", "Greek", "Grenadian", "Guatemalan", "Guinean",
  "Guinea-Bissauan", "Guyanese", "Haitian", "Honduran", "Hungarian",
  "I-Kiribati", "Indian", "Indonesian", "Iranian", "Iraqi", "Irish",
  "Israeli", "Italian", "Ivorian", "Jamaican", "Japanese", "Jordanian",
  "Kazakhstani", "Kenyan", "Korean (North)", "Korean (South)", "Kuwaiti",
  "Kyrgyzstani", "Laotian", "Latvian", "Lebanese", "Lesothan", "Liberian",
  "Libyan", "Liechtenstein", "Lithuanian", "Luxembourgish", "Malagasy",
  "Malawian", "Malaysian", "Maldivian", "Malian", "Maltese", "Marshallese",
  "Mauritanian", "Mauritian", "Mexican", "Micronesian", "Moldovan",
  "Monacan", "Mongolian", "Montenegrin", "Moroccan", "Mozambican",
  "Namibian", "Nauruan", "Nepalese", "New Zealander", "Nicaraguan",
  "Nigerian", "Nigerien", "Norwegian", "Omani", "Pakistani", "Palauan",
  "Palestinian", "Panamanian", "Papua New Guinean", "Paraguayan", "Peruvian",
  "Filipino", "Polish", "Portuguese", "Qatari", "Romanian", "Russian",
  "Rwandan", "Saint Kittian and Nevisian", "Saint Lucian",
  "Saint Vincentian", "Samoan", "San Marinese", "São Toméan", "Saudi Arabian",
  "Senegalese", "Serbian", "Seychellois", "Sierra Leonean", "Singaporean",
  "Slovak", "Slovenian", "Solomon Islander", "Somali", "South African",
  "South Sudanese", "Spanish", "Sri Lankan", "Sudanese", "Surinamese",
  "Swedish", "Swiss", "Syrian", "Taiwanese", "Tajikistani", "Tanzanian",
  "Thai", "Togolese", "Tongan", "Trinidadian and Tobagonian", "Tunisian",
  "Turkish", "Turkmenistani", "Tuvaluan", "Ugandan", "Ukrainian",
  "Uruguayan", "Uzbekistani", "Vanuatuan", "Venezuelan", "Vietnamese",
  "Yemeni", "Zambian", "Zimbabwean", "Other",
];

const NATIONALITIES_RAW = [
  ...PINNED_NATIONALITIES,
  "---",
  ...ALL_NATIONALITIES.filter((n) => !PINNED_NATIONALITIES.includes(n)),
];
export const NATIONALITY_OPTIONS_LIST = NATIONALITIES_RAW;

const KSA_CITIES = [
  "Makkah", "Madinah", "Jeddah", "Riyadh", "Taif", "Dammam", "Khobar",
  "Dhahran", "Tabuk", "Abha", "Khamis Mushait", "Hail", "Buraidah",
  "Hofuf", "Yanbu", "Najran", "Jazan", "Other",
];

const KSA_REGIONS = [
  "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir",
  "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran",
  "Al Bahah", "Al Jawf", "Qassim",
];

const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];
const EDU_OPTIONS = ["High School and below", "University and higher"];

const LANGUAGE_OPTIONS = [
  "Arabic", "English", "Hindi", "Urdu", "Turkish",
  "Burmese", "Yoruba / Nigerian", "Tagalog / Filipino", "Bengali", "French",
];

// ─── Zod Schema (validation messages resolved at submit via t()) ─────────────

function buildSchemas(t: (key: string, opts?: Record<string, unknown>) => string) {
  const step1 = z.object({
    firstName:       z.string().min(2, t("profileSetup:validation.firstNameRequired")),
    lastName:        z.string().min(2, t("profileSetup:validation.lastNameRequired")),
    gender:          z.string().min(1, t("profileSetup:validation.genderRequired")),
    nationalityText: z.string().min(1, t("profileSetup:validation.nationalityRequired")),
    dateOfBirth:     z.string().min(8, t("profileSetup:validation.dobRequired")).refine(val => {
      const dob = new Date(val);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      return age >= 15;
    }, t("profileSetup:validation.ageMin")),
    city:            z.string().min(1, t("profileSetup:validation.cityRequired")),
    region:          z.string().min(1, t("profileSetup:validation.regionRequired")),
    email:           z.string().email(t("profileSetup:validation.emailInvalid")).optional().or(z.literal("")),
    maritalStatus:   z.string().min(1, t("profileSetup:validation.maritalRequired")),
  });

  const step2 = z.object({
    hasChronicDiseases:  z.boolean(),
    chronicDiseases:     z.string().optional(),
    isEmployedElsewhere: z.boolean(),
    currentEmployer:     z.string().optional(),
    currentRole:         z.string().optional(),
    emergencyContactName:  z.string().min(2, t("profileSetup:validation.emergencyNameRequired")),
    emergencyContactPhone: z.string().min(7, t("profileSetup:validation.emergencyPhoneRequired")),
    ibanAccountFirstName: z.string().min(1, t("profileSetup:validation.ibanFirstNameRequired")),
    ibanAccountLastName:  z.string().min(1, t("profileSetup:validation.ibanLastNameRequired")),
    ibanNumber:          z.string().min(1, t("profileSetup:validation.ibanRequired")),
    ibanBankName:        z.string().optional(),
    ibanBankCode:        z.string().optional(),
  }).superRefine((d, ctx) => {
    if (d.hasChronicDiseases && !d.chronicDiseases?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.describeCondition"), path: ["chronicDiseases"] });
    }
    if (d.isEmployedElsewhere && !d.currentEmployer?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.employerRequired"), path: ["currentEmployer"] });
    }
    if (d.isEmployedElsewhere && !d.currentRole?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.positionRequired"), path: ["currentRole"] });
    }
    const ibanClean = (d.ibanNumber || "").replace(/\s+/g, "").toUpperCase();
    if (!ibanClean.startsWith("SA")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.ibanInvalidPrefix"), path: ["ibanNumber"] });
    } else if (ibanClean.length !== 24) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.ibanInvalidLength", { count: ibanClean.length }), path: ["ibanNumber"] });
    } else if (!/^SA\d{22}$/.test(ibanClean)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.ibanInvalidChars"), path: ["ibanNumber"] });
    }
  });

  const step3 = z.object({
    educationLevel:  z.string().min(1, t("profileSetup:validation.educationRequired")),
    major:           z.string().optional(),
    languages:       z.array(z.string()).min(1, t("profileSetup:validation.languagesRequired")),
    otherLanguage:   z.string().optional(),
  }).superRefine((d, ctx) => {
    if (d.educationLevel === "University and higher" && !d.major?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("profileSetup:validation.majorRequired"), path: ["major"] });
    }
  });

  return { step1, step2, step3 };
}

type Step1 = {
  firstName: string; lastName: string; gender: string;
  nationalityText: string; dateOfBirth: string; city: string;
  region: string; email?: string; maritalStatus: string;
};
type Step2 = {
  hasChronicDiseases: boolean; chronicDiseases?: string;
  isEmployedElsewhere: boolean; currentEmployer?: string; currentRole?: string;
  emergencyContactName: string; emergencyContactPhone: string;
  ibanAccountFirstName: string; ibanAccountLastName: string;
  ibanNumber: string; ibanBankName?: string; ibanBankCode?: string;
};
type Step3 = {
  educationLevel: string; major?: string;
  languages: string[]; otherLanguage?: string;
};

// ─── Step Components ──────────────────────────────────────────────────────────

function FieldWrapper({ label, required, children, error }: {
  label: string; required?: boolean; children: ReactNode; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
        {label}{required && <span className="text-red-500 ms-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function SelectField({ value, onChange, options, labels, placeholder, error, "data-testid": dataTestId, dir }: {
  value: string; onChange: (v: string) => void; options: string[];
  labels?: Record<string, string>;
  placeholder?: string; error?: string; "data-testid"?: string; dir?: "ltr" | "rtl";
}) {
  return (
    <div className="space-y-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        className="w-full h-10 bg-muted/30 border border-border rounded-sm px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
        data-testid={dataTestId}
      >
        <option value="" className="bg-card text-muted-foreground">{placeholder ?? "..."}</option>
        {options.map((o, i) =>
          o === "---" ? (
            <option key={`sep-${i}`} disabled className="bg-card text-muted-foreground">{"─".repeat(20)}</option>
          ) : (
            <option key={o} value={o} className="bg-card text-white">{labels?.[o] ?? o}</option>
          )
        )}
      </select>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function ToggleGroup({ value, onChange, label, required }: {
  value: boolean; onChange: (v: boolean) => void; label: string; required?: boolean;
}) {
  const { t, i18n } = useTranslation(["profileSetup"]);
  // In Arabic the user expects "No" on the right and "Yes" on the left, so
  // swap the DOM order so RTL reading flow lands them in the right spots.
  const isRtl = i18n.language?.startsWith("ar");
  const order: boolean[] = isRtl ? [false, true] : [true, false];
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
        {label}{required && <span className="text-red-500 ms-0.5">*</span>}
      </Label>
      <div className="flex gap-2">
        {order.map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 h-10 rounded-sm border text-sm font-medium transition-colors ${
              value === opt
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {opt ? t("profileSetup:common.yes") : t("profileSetup:common.no")}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Personal Info ───────────────────────────────────────────────────

function Step1Form({
  defaults, onNext, candidate,
}: {
  defaults: Partial<Step1>; onNext: (d: Step1) => void; candidate: StoredCandidate;
}) {
  const { t, i18n } = useTranslation(["profileSetup"]);
  const { step1: step1Schema } = useMemo(() => buildSchemas(t), [t]);

  // Translated lookup tables
  const cityLabels = useMemo(() => Object.fromEntries(
    KSA_CITIES.map(c => [c, t(`profileSetup:cities.${c}`)])
  ), [t]);
  const regionLabels = useMemo(() => Object.fromEntries(
    KSA_REGIONS.map(r => [r, t(`profileSetup:regions.${r}`)])
  ), [t]);
  const maritalLabels = useMemo(() => Object.fromEntries(
    MARITAL_OPTIONS.map(m => [m, t(`profileSetup:marital.${m}`)])
  ), [t]);
  const nationalityLabels = useMemo(() => Object.fromEntries(
    NATIONALITIES_RAW.filter(n => n !== "---").map(n => [n, nationalityLabel(n, i18n.language)])
  ), [i18n.language]);

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      firstName:       defaults.firstName ?? (candidate.fullNameEn?.split(" ")[0] ?? ""),
      lastName:        defaults.lastName  ?? (candidate.fullNameEn?.split(" ").slice(1).join(" ") ?? ""),
      gender:          defaults.gender ?? "",
      nationalityText: defaults.nationalityText ?? "",
      dateOfBirth:     defaults.dateOfBirth ?? "",
      city:            defaults.city ?? "",
      region:          defaults.region ?? "",
      email:           defaults.email ?? "",
      maritalStatus:   defaults.maritalStatus ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label={t("profileSetup:step1.firstName")} required error={errors.firstName?.message}>
          <Input {...register("firstName")} placeholder={t("profileSetup:step1.firstNamePh")} className="bg-muted/30 border-border" data-testid="input-firstName" />
        </FieldWrapper>
        <FieldWrapper label={t("profileSetup:step1.lastName")} required error={errors.lastName?.message}>
          <Input {...register("lastName")} placeholder={t("profileSetup:step1.lastNamePh")} className="bg-muted/30 border-border" data-testid="input-lastName" />
        </FieldWrapper>
      </div>

      <FieldWrapper label={t("profileSetup:step1.gender")} required error={errors.gender?.message}>
        <Controller control={control} name="gender" render={({ field }) => (
          <div className="grid grid-cols-2 gap-2">
            {[{ key: "male", label: t("profileSetup:step1.male") }, { key: "female", label: t("profileSetup:step1.female") }].map((opt) => (
              <button
                key={opt.key} type="button"
                onClick={() => field.onChange(opt.key)}
                data-testid={`button-gender-${opt.key}`}
                className={`h-10 rounded-sm border text-sm font-medium transition-colors ${
                  field.value === opt.key
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )} />
      </FieldWrapper>

      <FieldWrapper label={t("profileSetup:step1.nationality")} required error={errors.nationalityText?.message}>
        <Controller control={control} name="nationalityText" render={({ field }) => (
          <SelectField value={field.value} onChange={field.onChange} options={NATIONALITIES_RAW} labels={nationalityLabels} placeholder={t("profileSetup:common.selectNationality")} />
        )} />
      </FieldWrapper>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label={t("profileSetup:step1.nationalId")}>
          <Input value={candidate.nationalId ?? ""} disabled dir="ltr" className="bg-muted/10 border-border text-muted-foreground font-mono opacity-60" />
        </FieldWrapper>
        <FieldWrapper label={t("profileSetup:step1.phone")}>
          <Input value={candidate.phone ?? ""} disabled dir="ltr" className="bg-muted/10 border-border text-muted-foreground font-mono opacity-60" />
        </FieldWrapper>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label={t("profileSetup:step1.dob")} required error={errors.dateOfBirth?.message}>
          <DatePickerField value={watch("dateOfBirth")} onChange={(v) => setValue("dateOfBirth", v)} className="bg-muted/30 border-border" data-testid="input-dob" />
        </FieldWrapper>
        <FieldWrapper label={t("profileSetup:step1.city")} required error={errors.city?.message}>
          <Controller control={control} name="city" render={({ field }) => (
            <SelectField value={field.value} onChange={field.onChange} options={KSA_CITIES} labels={cityLabels} placeholder={t("profileSetup:common.selectCity")} data-testid="select-city" />
          )} />
        </FieldWrapper>
      </div>

      <FieldWrapper label={t("profileSetup:step1.region")} required error={errors.region?.message}>
        <Controller control={control} name="region" render={({ field }) => (
          <SelectField value={field.value} onChange={field.onChange} options={KSA_REGIONS} labels={regionLabels} placeholder={t("profileSetup:common.selectRegion")} data-testid="select-region" />
        )} />
      </FieldWrapper>

      <FieldWrapper label={t("profileSetup:step1.email")} error={errors.email?.message}>
        <Input {...register("email")} type="email" dir="ltr" placeholder={t("profileSetup:step1.emailPh")} className="bg-muted/30 border-border" data-testid="input-email" />
      </FieldWrapper>

      <FieldWrapper label={t("profileSetup:step1.marital")} required error={errors.maritalStatus?.message}>
        <Controller control={control} name="maritalStatus" render={({ field }) => (
          <div className="grid grid-cols-4 gap-2">
            {MARITAL_OPTIONS.map((opt) => (
              <button
                key={opt} type="button"
                onClick={() => field.onChange(opt)}
                className={`h-10 rounded-sm border text-xs font-medium transition-colors ${
                  field.value === opt
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {maritalLabels[opt]}
              </button>
            ))}
          </div>
        )} />
      </FieldWrapper>

      <div className="flex justify-end pt-2">
        <Button type="submit" className="bg-primary text-primary-foreground font-bold px-8 gap-2" data-testid="button-step1-next">
          {t("profileSetup:common.next")} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </form>
  );
}

// ─── Step 2: Health & Employment ─────────────────────────────────────────────

function Step2Form({
  defaults, onNext, onBack, isSmp,
}: {
  defaults: Partial<Step2>; onNext: (d: Step2) => void; onBack: () => void; isSmp: boolean;
}) {
  const { t } = useTranslation(["profileSetup"]);
  const { step2: step2Schema } = useMemo(() => buildSchemas(t), [t]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      hasChronicDiseases:  defaults.hasChronicDiseases  ?? false,
      chronicDiseases:     defaults.chronicDiseases     ?? "",
      isEmployedElsewhere: defaults.isEmployedElsewhere ?? false,
      currentEmployer:     defaults.currentEmployer     ?? "",
      currentRole:         defaults.currentRole         ?? "",
      emergencyContactName:  defaults.emergencyContactName  ?? "",
      emergencyContactPhone: defaults.emergencyContactPhone ?? "",
      ibanAccountFirstName: defaults.ibanAccountFirstName  ?? "",
      ibanAccountLastName:  defaults.ibanAccountLastName   ?? "",
      ibanNumber:          defaults.ibanNumber             ?? "",
      ibanBankName:        defaults.ibanBankName           ?? "",
      ibanBankCode:        defaults.ibanBankCode           ?? "",
    },
  });

  const hasChronic    = watch("hasChronicDiseases");
  const isEmployed    = watch("isEmployedElsewhere");
  const ibanValue     = watch("ibanNumber");

  useEffect(() => {
    const resolved = resolveSaudiBank(ibanValue || "");
    setValue("ibanBankName", resolved?.ibanBankName ?? "");
    setValue("ibanBankCode", resolved?.ibanBankCode ?? "");
  }, [ibanValue, setValue]);

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-10">
      {/* Chronic diseases */}
      <div className="space-y-4 p-4 rounded-md bg-muted/10 border border-border">
        <ToggleGroup
          value={hasChronic}
          onChange={(v) => setValue("hasChronicDiseases", v)}
          label={t("profileSetup:step2.chronicQ")}
          required
        />
        {hasChronic && (
          <FieldWrapper label={t("profileSetup:step2.chronicDesc")} required error={errors.chronicDiseases?.message}>
            <Input
              {...register("chronicDiseases")}
              placeholder={t("profileSetup:step2.chronicPh")}
              className="bg-muted/30 border-border"
              data-testid="input-chronic-diseases"
            />
          </FieldWrapper>
        )}
      </div>

      {/* Employment */}
      <div className="space-y-4 p-4 rounded-md bg-muted/10 border border-border">
        <ToggleGroup
          value={isEmployed}
          onChange={(v) => setValue("isEmployedElsewhere", v)}
          label={t("profileSetup:step2.employedQ")}
          required
        />
        {isEmployed && (
          <div className="space-y-4">
            <FieldWrapper label={t("profileSetup:step2.employer")} required error={errors.currentEmployer?.message}>
              <Input
                {...register("currentEmployer")}
                placeholder={t("profileSetup:step2.employerPh")}
                className="bg-muted/30 border-border"
                data-testid="input-employer"
              />
            </FieldWrapper>
            <FieldWrapper label={t("profileSetup:step2.position")} required error={errors.currentRole?.message}>
              <Input
                {...register("currentRole")}
                placeholder={t("profileSetup:step2.positionPh")}
                className="bg-muted/30 border-border"
                data-testid="input-current-role"
              />
            </FieldWrapper>
          </div>
        )}
      </div>

      {!isSmp && (
        <div className="space-y-4 p-4 rounded-md bg-muted/10 border border-border">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            {t("profileSetup:step2.bankDetails")}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">{t("profileSetup:step2.bankDesc")}</p>

          {/* Account holder name warning */}
          <div className="flex items-start gap-2 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2.5">
            <span className="mt-0.5 text-red-400 shrink-0">⚠</span>
            <p className="text-xs text-red-400 leading-relaxed font-medium">
              {t("profileSetup:step2.ibanWarning")}
            </p>
          </div>

          {/* First / Last name as on debit card */}
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("profileSetup:step2.ibanFirstName")} required error={errors.ibanAccountFirstName?.message}>
              <Input
                {...register("ibanAccountFirstName")}
                placeholder={t("profileSetup:step2.ibanFirstNamePh")}
                className="bg-muted/30 border-border"
                data-testid="input-iban-first-name"
              />
            </FieldWrapper>
            <FieldWrapper label={t("profileSetup:step2.ibanLastName")} required error={errors.ibanAccountLastName?.message}>
              <Input
                {...register("ibanAccountLastName")}
                placeholder={t("profileSetup:step2.ibanLastNamePh")}
                className="bg-muted/30 border-border"
                data-testid="input-iban-last-name"
              />
            </FieldWrapper>
          </div>

          <FieldWrapper label={t("profileSetup:step2.ibanNumber")} required error={errors.ibanNumber?.message}>
            <Input
              {...register("ibanNumber", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
                  const grouped = cleaned.replace(/(.{4})/g, "$1 ").trim();
                  e.target.value = grouped;
                  setValue("ibanNumber", grouped, { shouldValidate: true });
                },
              })}
              placeholder="SA00 0000 0000 0000 0000 0000"
              maxLength={29}
              dir="ltr"
              inputMode="text"
              autoComplete="off"
              className="bg-muted/30 border-border font-mono uppercase"
              data-testid="input-iban"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{t("profileSetup:step2.ibanFormat")}</p>
          </FieldWrapper>

          {/* Auto-detected bank info */}
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("profileSetup:step2.bankName")} error={undefined}>
              <Input
                value={watch("ibanBankName") || ""}
                readOnly
                dir="ltr"
                placeholder={t("profileSetup:step2.bankNamePh")}
                className="bg-muted/10 border-border text-muted-foreground cursor-not-allowed select-none"
                data-testid="input-bank-name"
              />
            </FieldWrapper>
            <FieldWrapper label={t("profileSetup:step2.bankCode")} error={undefined}>
              <Input
                value={watch("ibanBankCode") || ""}
                readOnly
                dir="ltr"
                placeholder={t("profileSetup:step2.bankCodePh")}
                className="bg-muted/10 border-border text-muted-foreground cursor-not-allowed select-none"
                data-testid="input-bank-code"
              />
            </FieldWrapper>
          </div>
        </div>
      )}

      {/* Emergency Contact */}
      <div className="space-y-4 p-4 rounded-md bg-muted/10 border border-border">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          {t("profileSetup:step2.emergencyTitle")}<span className="text-red-500 ms-0.5">*</span>
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{t("profileSetup:step2.emergencyDesc")}</p>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("profileSetup:step2.emergencyName")} required error={errors.emergencyContactName?.message}>
            <Input
              {...register("emergencyContactName")}
              placeholder={t("profileSetup:step2.emergencyNamePh")}
              className="bg-muted/30 border-border"
              data-testid="input-emergency-name"
            />
          </FieldWrapper>
          <FieldWrapper label={t("profileSetup:step2.emergencyPhone")} required error={errors.emergencyContactPhone?.message}>
            <Input
              {...register("emergencyContactPhone")}
              placeholder={t("profileSetup:step2.emergencyPhonePh")}
              dir="ltr"
              className="bg-muted/30 border-border"
              data-testid="input-emergency-phone"
            />
          </FieldWrapper>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-step2-back">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("profileSetup:common.back")}
        </Button>
        <Button type="submit" className="bg-primary text-primary-foreground font-bold px-8 gap-2" data-testid="button-step2-next">
          {t("profileSetup:common.next")} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </form>
  );
}

// ─── Step 3: Education & Languages ───────────────────────────────────────────

function Step3Form({
  defaults, onSubmit, onBack, isLoading,
}: {
  defaults: Partial<Step3>; onSubmit: (d: Step3) => void; onBack: () => void; isLoading: boolean;
}) {
  const { t } = useTranslation(["profileSetup"]);
  const { step3: step3Schema } = useMemo(() => buildSchemas(t), [t]);

  const eduLabels = useMemo(() => ({
    "High School and below": t("profileSetup:step3.highSchool"),
    "University and higher": t("profileSetup:step3.university"),
  } as Record<string, string>), [t]);
  const langLabels = useMemo(() => Object.fromEntries(
    LANGUAGE_OPTIONS.map(l => [l, t(`profileSetup:languages.${l}`)])
  ), [t]);

  const { handleSubmit, watch, setValue, register, formState: { errors } } = useForm<Step3>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      educationLevel: defaults.educationLevel ?? "",
      major:          defaults.major ?? "",
      languages:      defaults.languages ?? [],
      otherLanguage:  defaults.otherLanguage ?? "",
    },
  });

  const educationLevel = watch("educationLevel");
  const selectedLangs  = watch("languages");

  function toggleLang(lang: string) {
    setValue(
      "languages",
      selectedLangs.includes(lang)
        ? selectedLangs.filter((l) => l !== lang)
        : [...selectedLangs, lang],
      { shouldValidate: true }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Education */}
      <div className="space-y-3 p-4 rounded-md bg-muted/10 border border-border">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          {t("profileSetup:step3.educationLevel")}<span className="text-red-500 ms-0.5">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {EDU_OPTIONS.map((opt) => (
            <button
              key={opt} type="button"
              onClick={() => setValue("educationLevel", opt, { shouldValidate: true })}
              className={`h-12 px-3 rounded-sm border text-sm font-medium transition-colors text-start leading-tight ${
                educationLevel === opt
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
              }`}
              data-testid={`button-edu-${opt.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {eduLabels[opt]}
            </button>
          ))}
        </div>
        {errors.educationLevel && <p className="text-red-400 text-xs">{errors.educationLevel.message}</p>}

        {educationLevel === "University and higher" && (
          <FieldWrapper label={t("profileSetup:step3.major")} required error={errors.major?.message}>
            <Input
              {...register("major")}
              placeholder={t("profileSetup:step3.majorPh")}
              className="bg-muted/30 border-border mt-1"
              data-testid="input-major"
            />
          </FieldWrapper>
        )}
      </div>

      {/* Languages */}
      <div className="space-y-3 p-4 rounded-md bg-muted/10 border border-border">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          {t("profileSetup:step3.languages")}<span className="text-red-500 ms-0.5">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <label key={lang} className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                checked={selectedLangs.includes(lang)}
                onCheckedChange={() => toggleLang(lang)}
                className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                data-testid={`checkbox-lang-${lang}`}
              />
              <span className="text-sm text-muted-foreground group-hover:text-white transition-colors">{langLabels[lang]}</span>
            </label>
          ))}
        </div>
        {errors.languages && <p className="text-red-400 text-xs">{errors.languages.message}</p>}

        <div className="pt-1">
          <FieldWrapper label={t("profileSetup:step3.otherLanguages")}>
            <Input
              {...register("otherLanguage")}
              placeholder={t("profileSetup:step3.otherLanguagesPh")}
              className="bg-muted/30 border-border"
              data-testid="input-other-language"
            />
          </FieldWrapper>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-step3-back">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("profileSetup:common.back")}
        </Button>
        <Button
          type="submit"
          className="bg-primary text-primary-foreground font-bold px-8 gap-2 min-w-[160px]"
          disabled={isLoading}
          data-testid="button-step3-submit"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><CheckCircle2 className="h-4 w-4" /> {t("profileSetup:common.submit")}</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Gate Component ──────────────────────────────────────────────────────

export default function ProfileSetupGate({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation(["profileSetup", "common"]);

  const STEPS = [
    { id: 1, label: t("profileSetup:steps.personal"),  icon: User },
    { id: 2, label: t("profileSetup:steps.health"),    icon: Heart },
    { id: 3, label: t("profileSetup:steps.education"), icon: BookOpen },
  ];

  // Read candidate from localStorage
  const stored = localStorage.getItem("workforce_candidate");
  const candidate: StoredCandidate | null = stored ? JSON.parse(stored) : null;

  const [step,     setStep]     = useState(1);
  const [s1data,   setS1data]   = useState<Partial<Step1>>({});
  const [s2data,   setS2data]   = useState<Partial<Step2>>({});
  const [completed, setCompleted] = useState(candidate?.profileCompleted ?? false);

  // Always start each step at the top of the page (some browsers, especially
  // when the document direction flips to RTL, otherwise restore a stale
  // scroll position that lands the user halfway down the form).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  const updateCandidate = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/candidates/${candidate!.id}`, payload);
      return res.json();
    },
    onSuccess: (updated) => {
      const merged = { ...candidate!, ...updated };
      localStorage.setItem("workforce_candidate", JSON.stringify(merged));
      setCompleted(true);
      toast({
        title: t("profileSetup:common.profileCompleted"),
        description: t("profileSetup:common.profileCompletedDesc"),
      });
    },
    onError: (err: any) => {
      const raw: string = String(err?.message ?? "");
      const errorCodes: Record<string, string> = {
        invalid_contact_phone: t("profileSetup:common.errInvalidContactPhone"),
        invalid_sa_mobile:     t("profileSetup:common.errInvalidSaMobile"),
      };
      let friendly = "";
      try {
        const m = raw.match(/\{[\s\S]*\}$/);
        if (m) {
          const body = JSON.parse(m[0]);
          const errs: any[] = body?.errors ?? [];
          const codes = errs.map(e => e?.message).filter(Boolean);
          friendly = codes.map(c => errorCodes[c] ?? c).join("\n");
        }
      } catch { /* ignore */ }
      toast({
        title: t("profileSetup:common.saveFailed"),
        description: friendly || t("profileSetup:common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  function handleStep1(d: Step1) {
    setS1data(d);
    setStep(2);
  }
  function handleStep2(d: Step2) {
    setS2data(d);
    setStep(3);
  }
  function handleStep3(d: Step3) {
    const langs = d.otherLanguage?.trim()
      ? [...d.languages, d.otherLanguage.trim()]
      : d.languages;

    const fullNameEn = `${s1data.firstName} ${s1data.lastName}`.trim();
    const isNonSaudi = s1data.nationalityText !== "Saudi Arabian";

    updateCandidate.mutate({
      fullNameEn,
      gender:              (s1data.gender as "male" | "female" | "prefer_not_to_say") || undefined,
      nationalityText:     s1data.nationalityText,
      nationality:         isNonSaudi ? "non_saudi" : "saudi",
      dateOfBirth:         s1data.dateOfBirth,
      city:                s1data.city,
      region:              s1data.region || undefined,
      email:               s1data.email || undefined,
      maritalStatus:       s1data.maritalStatus,
      hasChronicDiseases:  s2data.hasChronicDiseases,
      chronicDiseases:     s2data.chronicDiseases || null,
      isEmployedElsewhere: s2data.isEmployedElsewhere,
      currentEmployer:     s2data.currentEmployer || null,
      currentRole:         s2data.currentRole || null,
      emergencyContactName:  s2data.emergencyContactName,
      emergencyContactPhone: s2data.emergencyContactPhone,
      ibanAccountFirstName: s2data.ibanAccountFirstName || null,
      ibanAccountLastName:  s2data.ibanAccountLastName  || null,
      ibanNumber:          s2data.ibanNumber ? s2data.ibanNumber.replace(/\s+/g, "").toUpperCase() : null,
      ibanBankName:        s2data.ibanBankName || null,
      ibanBankCode:        s2data.ibanBankCode || null,
      educationLevel:      d.educationLevel,
      major:               d.major || null,
      languages:           langs,
      profileCompleted:    true,
    });
  }

  useEffect(() => {
    if (!candidate) setLocation("/auth");
  }, [candidate, setLocation]);

  if (!candidate) {
    return null;
  }

  // Profile already completed → show portal
  if (completed) {
    return <>{children}</>;
  }

  // ── Profile Setup Screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">

      {/* Top bar */}
      <header className="h-14 border-b border-border px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/workforce-logo.svg" alt="Workforce" className="h-8 w-8" />
          <span className="font-display font-bold text-lg text-white">
            {t("common:app.name")}
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
            localStorage.removeItem("workforce_candidate");
            queryClient.clear();
            setLocation("/auth");
          }}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("profileSetup:header.signOut")}
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start py-8 px-4 overflow-y-auto">
        <div className="w-full max-w-xl space-y-8">

          {/* Header */}
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-white">{t("profileSetup:header.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("profileSetup:header.subtitle")}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done    = step > s.id;
              const current = step === s.id;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 relative">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                      done    ? "bg-primary border-primary text-primary-foreground" :
                      current ? "border-primary bg-primary/10 text-primary" :
                                "border-border bg-muted/20 text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap ${current ? "text-white" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 mb-5 transition-colors ${done ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Form card */}
          <div className="bg-card border border-border rounded-md p-6 shadow-lg">
            <div className="mb-6 pb-4 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t("profileSetup:header.stepOf", {
                  step: formatNumber(step),
                  total: formatNumber(STEPS.length),
                })}
              </p>
              <h2 className="font-display font-bold text-lg text-white mt-0.5">
                {STEPS[step - 1].label}
              </h2>
            </div>

            {step === 1 && (
              <Step1Form defaults={s1data} onNext={handleStep1} candidate={candidate} />
            )}
            {step === 2 && (
              <Step2Form defaults={s2data} onNext={handleStep2} onBack={() => setStep(1)} isSmp={(candidate as any).classification === "smp"} />
            )}
            {step === 3 && (
              <Step3Form
                defaults={{}}
                onSubmit={handleStep3}
                onBack={() => setStep(2)}
                isLoading={updateCandidate.isPending}
              />
            )}
          </div>

          {/* PDPL Notice */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed max-w-md mx-auto">
            {t("profileSetup:header.pdpl")}
          </p>
        </div>
      </div>
    </div>
  );
}
