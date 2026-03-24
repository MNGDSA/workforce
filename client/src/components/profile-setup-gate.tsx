import { useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoredCandidate = {
  id: string;
  fullNameEn: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  profileCompleted?: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const NATIONALITIES = [
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

const GENDER_OPTIONS = [
  { label: "Male",   value: "male" },
  { label: "Female", value: "female" },
];

const KSA_CITIES = [
  "Makkah", "Madinah", "Jeddah", "Riyadh", "Taif", "Dammam", "Khobar",
  "Dhahran", "Tabuk", "Abha", "Khamis Mushait", "Hail", "Buraidah",
  "Hofuf", "Yanbu", "Najran", "Jazan", "Other",
];

const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];
const EDU_OPTIONS = ["High School and below", "University and higher"];

const LANGUAGE_OPTIONS = [
  "Arabic", "English", "Hindi", "Urdu", "Turkish",
  "Burmese", "Yoruba / Nigerian", "Tagalog / Filipino", "Bengali", "French",
];

// ─── Zod Schema ──────────────────────────────────────────────────────────────

const step1Schema = z.object({
  firstName:       z.string().min(2, "First name is required"),
  lastName:        z.string().min(2, "Last name is required"),
  gender:          z.string().min(1, "Gender is required"),
  nationalityText: z.string().min(1, "Nationality is required"),
  dateOfBirth:     z.string().min(8, "Date of birth is required"),
  city:            z.string().min(1, "City is required"),
  email:           z.string().email("Enter a valid email").optional().or(z.literal("")),
  maritalStatus:   z.string().min(1, "Marital status is required"),
});

const step2Schema = z.object({
  hasChronicDiseases:  z.boolean(),
  chronicDiseases:     z.string().optional(),
  isEmployedElsewhere: z.boolean(),
  currentEmployer:     z.string().optional(),
  currentRole:         z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.hasChronicDiseases && !d.chronicDiseases?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please describe your condition(s)", path: ["chronicDiseases"] });
  }
  if (d.isEmployedElsewhere && !d.currentEmployer?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please enter your employer", path: ["currentEmployer"] });
  }
  if (d.isEmployedElsewhere && !d.currentRole?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please enter your position", path: ["currentRole"] });
  }
});

const step3Schema = z.object({
  educationLevel:  z.string().min(1, "Education level is required"),
  major:           z.string().optional(),
  languages:       z.array(z.string()).min(1, "Select at least one language"),
  otherLanguage:   z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.educationLevel === "University and higher" && !d.major?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please enter your major", path: ["major"] });
  }
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

// ─── Step Components ──────────────────────────────────────────────────────────

function FieldWrapper({ label, required, children, error }: {
  label: string; required?: boolean; children: ReactNode; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder, error }: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 bg-muted/30 border border-border rounded-sm px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
      >
        <option value="" className="bg-card text-muted-foreground">{placeholder ?? "Select..."}</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-card text-white">{o}</option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function ToggleGroup({ value, onChange, label, required }: {
  value: boolean; onChange: (v: boolean) => void; label: string; required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="flex gap-2">
        {[true, false].map((opt) => (
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
            {opt ? "Yes" : "No"}
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
  const { register, handleSubmit, control, formState: { errors } } = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      firstName:       defaults.firstName ?? (candidate.fullNameEn?.split(" ")[0] ?? ""),
      lastName:        defaults.lastName  ?? (candidate.fullNameEn?.split(" ").slice(1).join(" ") ?? ""),
      gender:          defaults.gender ?? "",
      nationalityText: defaults.nationalityText ?? "",
      dateOfBirth:     defaults.dateOfBirth ?? "",
      city:            defaults.city ?? "",
      email:           defaults.email ?? candidate.email ?? "",
      maritalStatus:   defaults.maritalStatus ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label="First Name" required error={errors.firstName?.message}>
          <Input {...register("firstName")} placeholder="Mohammed" className="bg-muted/30 border-border" data-testid="input-firstName" />
        </FieldWrapper>
        <FieldWrapper label="Last Name" required error={errors.lastName?.message}>
          <Input {...register("lastName")} placeholder="Al-Harbi" className="bg-muted/30 border-border" data-testid="input-lastName" />
        </FieldWrapper>
      </div>

      <FieldWrapper label="Gender" required error={errors.gender?.message}>
        <Controller control={control} name="gender" render={({ field }) => (
          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((opt) => (
              <button
                key={opt.value} type="button"
                onClick={() => field.onChange(opt.value)}
                data-testid={`button-gender-${opt.value}`}
                className={`h-10 rounded-sm border text-sm font-medium transition-colors ${
                  field.value === opt.value
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

      <FieldWrapper label="Nationality" required error={errors.nationalityText?.message}>
        <Controller control={control} name="nationalityText" render={({ field }) => (
          <SelectField value={field.value} onChange={field.onChange} options={NATIONALITIES} placeholder="Select nationality" error={errors.nationalityText?.message} />
        )} />
      </FieldWrapper>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label="National ID / Iqama">
          <Input value={candidate.nationalId ?? ""} disabled className="bg-muted/10 border-border text-muted-foreground font-mono opacity-60" />
        </FieldWrapper>
        <FieldWrapper label="Phone Number">
          <Input value={candidate.phone ?? ""} disabled className="bg-muted/10 border-border text-muted-foreground font-mono opacity-60" />
        </FieldWrapper>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label="Date of Birth" required error={errors.dateOfBirth?.message}>
          <Input {...register("dateOfBirth")} type="date" className="bg-muted/30 border-border" data-testid="input-dob" />
        </FieldWrapper>
        <FieldWrapper label="City of Residence" required error={errors.city?.message}>
          <Controller control={control} name="city" render={({ field }) => (
            <SelectField value={field.value} onChange={field.onChange} options={KSA_CITIES} placeholder="Select city" error={errors.city?.message} />
          )} />
        </FieldWrapper>
      </div>

      <FieldWrapper label="Email Address" error={errors.email?.message}>
        <Input {...register("email")} type="email" placeholder="optional" className="bg-muted/30 border-border" data-testid="input-email" />
      </FieldWrapper>

      <FieldWrapper label="Marital Status" required error={errors.maritalStatus?.message}>
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
                {opt}
              </button>
            ))}
          </div>
        )} />
        {errors.maritalStatus && <p className="text-red-400 text-xs">{errors.maritalStatus.message}</p>}
      </FieldWrapper>

      <div className="flex justify-end pt-2">
        <Button type="submit" className="bg-primary text-primary-foreground font-bold px-8 gap-2" data-testid="button-step1-next">
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

// ─── Step 2: Health & Employment ─────────────────────────────────────────────

function Step2Form({
  defaults, onNext, onBack,
}: {
  defaults: Partial<Step2>; onNext: (d: Step2) => void; onBack: () => void;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      hasChronicDiseases:  defaults.hasChronicDiseases  ?? false,
      chronicDiseases:     defaults.chronicDiseases     ?? "",
      isEmployedElsewhere: defaults.isEmployedElsewhere ?? false,
      currentEmployer:     defaults.currentEmployer     ?? "",
      currentRole:         defaults.currentRole         ?? "",
    },
  });

  const hasChronic    = watch("hasChronicDiseases");
  const isEmployed    = watch("isEmployedElsewhere");

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {/* Chronic diseases */}
      <div className="space-y-4 p-4 rounded-md bg-muted/10 border border-border">
        <ToggleGroup
          value={hasChronic}
          onChange={(v) => setValue("hasChronicDiseases", v)}
          label="Do you suffer from any chronic diseases?"
          required
        />
        {hasChronic && (
          <FieldWrapper label="Please describe your condition(s)" required error={errors.chronicDiseases?.message}>
            <Input
              {...register("chronicDiseases")}
              placeholder="e.g. Diabetes, hypertension..."
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
          label="Are you currently a full-time employee somewhere else?"
          required
        />
        {isEmployed && (
          <div className="space-y-4">
            <FieldWrapper label="Employer / Company Name" required error={errors.currentEmployer?.message}>
              <Input
                {...register("currentEmployer")}
                placeholder="e.g. Saudi Aramco"
                className="bg-muted/30 border-border"
                data-testid="input-employer"
              />
            </FieldWrapper>
            <FieldWrapper label="Your Position / Job Title" required error={errors.currentRole?.message}>
              <Input
                {...register("currentRole")}
                placeholder="e.g. Operations Manager"
                className="bg-muted/30 border-border"
                data-testid="input-current-role"
              />
            </FieldWrapper>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-step2-back">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button type="submit" className="bg-primary text-primary-foreground font-bold px-8 gap-2" data-testid="button-step2-next">
          Next <ChevronRight className="h-4 w-4" />
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
          Education Level<span className="text-red-500 ml-0.5">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {EDU_OPTIONS.map((opt) => (
            <button
              key={opt} type="button"
              onClick={() => setValue("educationLevel", opt, { shouldValidate: true })}
              className={`h-12 px-3 rounded-sm border text-sm font-medium transition-colors text-left leading-tight ${
                educationLevel === opt
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
              }`}
              data-testid={`button-edu-${opt.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {opt}
            </button>
          ))}
        </div>
        {errors.educationLevel && <p className="text-red-400 text-xs">{errors.educationLevel.message}</p>}

        {educationLevel === "University and higher" && (
          <FieldWrapper label="Field of Study / Major" required error={errors.major?.message}>
            <Input
              {...register("major")}
              placeholder="e.g. Business Administration, Engineering..."
              className="bg-muted/30 border-border mt-1"
              data-testid="input-major"
            />
          </FieldWrapper>
        )}
      </div>

      {/* Languages */}
      <div className="space-y-3 p-4 rounded-md bg-muted/10 border border-border">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          Languages You Speak<span className="text-red-500 ml-0.5">*</span>
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
              <span className="text-sm text-muted-foreground group-hover:text-white transition-colors">{lang}</span>
            </label>
          ))}
        </div>
        {errors.languages && <p className="text-red-400 text-xs">{errors.languages.message}</p>}

        <div className="pt-1">
          <FieldWrapper label="Other languages (specify)">
            <Input
              {...register("otherLanguage")}
              placeholder="e.g. Swahili, Hausa..."
              className="bg-muted/30 border-border"
              data-testid="input-other-language"
            />
          </FieldWrapper>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-step3-back">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          type="submit"
          className="bg-primary text-primary-foreground font-bold px-8 gap-2 min-w-[160px]"
          disabled={isLoading}
          data-testid="button-step3-submit"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><CheckCircle2 className="h-4 w-4" /> Complete Profile</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Gate Component ──────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Personal Info",       icon: User },
  { id: 2, label: "Health & Work",       icon: Heart },
  { id: 3, label: "Education & Languages", icon: BookOpen },
];

export default function ProfileSetupGate({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read candidate from localStorage
  const stored = localStorage.getItem("workforce_candidate");
  const candidate: StoredCandidate | null = stored ? JSON.parse(stored) : null;

  const [step,     setStep]     = useState(1);
  const [s1data,   setS1data]   = useState<Partial<Step1>>({});
  const [s2data,   setS2data]   = useState<Partial<Step2>>({});
  const [completed, setCompleted] = useState(candidate?.profileCompleted ?? false);

  const updateCandidate = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/candidates/${candidate!.id}`, payload);
      return res.json();
    },
    onSuccess: (updated) => {
      const merged = { ...candidate!, ...updated };
      localStorage.setItem("workforce_candidate", JSON.stringify(merged));
      setCompleted(true);
      toast({ title: "Profile completed!", description: "Your information has been saved." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
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
      email:               s1data.email || undefined,
      maritalStatus:       s1data.maritalStatus,
      hasChronicDiseases:  s2data.hasChronicDiseases,
      chronicDiseases:     s2data.chronicDiseases || null,
      isEmployedElsewhere: s2data.isEmployedElsewhere,
      currentEmployer:     s2data.currentEmployer || null,
      currentRole:         s2data.currentRole || null,
      educationLevel:      d.educationLevel,
      major:               d.major || null,
      languages:           langs,
      profileCompleted:    true,
    });
  }

  // No candidate in localStorage → redirect to auth
  if (!candidate) {
    setLocation("/auth");
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
          <div className="h-8 w-8 bg-primary rounded-sm flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg text-white">
            WORKFORCE<span className="text-primary">.IO</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => { localStorage.removeItem("workforce_candidate"); setLocation("/auth"); }}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start py-8 px-4 overflow-y-auto">
        <div className="w-full max-w-xl space-y-8">

          {/* Header */}
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-white">Complete Your Profile</h1>
            <p className="text-muted-foreground text-sm">
              Please fill in the required information before accessing the portal. This will not take more than 2 minutes.
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
                Step {step} of {STEPS.length}
              </p>
              <h2 className="font-display font-bold text-lg text-white mt-0.5">
                {STEPS[step - 1].label}
              </h2>
            </div>

            {step === 1 && (
              <Step1Form defaults={s1data} onNext={handleStep1} candidate={candidate} />
            )}
            {step === 2 && (
              <Step2Form defaults={s2data} onNext={handleStep2} onBack={() => setStep(1)} />
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

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline" className="border-border text-muted-foreground text-xs">
              Secure & confidential
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground text-xs">
              Filled once — editable later
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground text-xs">
              Required for applications
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
