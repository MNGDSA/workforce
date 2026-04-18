import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enApply from "./locales/en/apply.json";
import enPortal from "./locales/en/portal.json";
import enLayout from "./locales/en/layout.json";
import enDashboard from "./locales/en/dashboard.json";
import enProfile from "./locales/en/profile.json";
import enAudit from "./locales/en/audit.json";
import enGeofences from "./locales/en/geofences.json";
import enReports from "./locales/en/reports.json";
import enAutomation from "./locales/en/automation.json";
import enPayroll from "./locales/en/payroll.json";
import enAdminUsers from "./locales/en/adminUsers.json";
import enSettings from "./locales/en/settings.json";
import enQuestionSets from "./locales/en/questionSets.json";
import enOrgChart from "./locales/en/orgChart.json";
import enNotifications from "./locales/en/notifications.json";
import enDepartments from "./locales/en/departments.json";
import enLegal from "./locales/en/legal.json";
import enBroadcast from "./locales/en/broadcast.json";
import enScheduleInterview from "./locales/en/scheduleInterview.json";
import enEvents from "./locales/en/events.json";
import enSmpContracts from "./locales/en/smpContracts.json";
import enOffboarding from "./locales/en/offboarding.json";
import enInbox from "./locales/en/inbox.json";
import enJobPosting from "./locales/en/jobPosting.json";
import enInterviews from "./locales/en/interviews.json";
import enRolesAccess from "./locales/en/rolesAccess.json";
import enAssets from "./locales/en/assets.json";
import enIdCards from "./locales/en/idCards.json";
import enTalent from "./locales/en/talent.json";
import enWorkforce from "./locales/en/workforce.json";
import enOnboarding from "./locales/en/onboarding.json";

import arCommon from "./locales/ar/common.json";
import arAuth from "./locales/ar/auth.json";
import arApply from "./locales/ar/apply.json";
import arPortal from "./locales/ar/portal.json";
import arLayout from "./locales/ar/layout.json";
import arDashboard from "./locales/ar/dashboard.json";
import arProfile from "./locales/ar/profile.json";
import arAudit from "./locales/ar/audit.json";
import arGeofences from "./locales/ar/geofences.json";
import arReports from "./locales/ar/reports.json";
import arAutomation from "./locales/ar/automation.json";
import arPayroll from "./locales/ar/payroll.json";
import arAdminUsers from "./locales/ar/adminUsers.json";
import arSettings from "./locales/ar/settings.json";
import arQuestionSets from "./locales/ar/questionSets.json";
import arOrgChart from "./locales/ar/orgChart.json";
import arNotifications from "./locales/ar/notifications.json";
import arDepartments from "./locales/ar/departments.json";
import arLegal from "./locales/ar/legal.json";
import arBroadcast from "./locales/ar/broadcast.json";
import arScheduleInterview from "./locales/ar/scheduleInterview.json";
import arEvents from "./locales/ar/events.json";
import arSmpContracts from "./locales/ar/smpContracts.json";
import arOffboarding from "./locales/ar/offboarding.json";
import arInbox from "./locales/ar/inbox.json";
import arJobPosting from "./locales/ar/jobPosting.json";
import arInterviews from "./locales/ar/interviews.json";
import arRolesAccess from "./locales/ar/rolesAccess.json";
import arAssets from "./locales/ar/assets.json";
import arIdCards from "./locales/ar/idCards.json";
import arTalent from "./locales/ar/talent.json";
import arWorkforce from "./locales/ar/workforce.json";
import arOnboarding from "./locales/ar/onboarding.json";

export const SUPPORTED_LOCALES = ["ar", "en"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = "ar";

export const LOCALE_STORAGE_KEY = "workforce_locale";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, auth: enAuth, apply: enApply, portal: enPortal, layout: enLayout, dashboard: enDashboard, profile: enProfile, audit: enAudit, geofences: enGeofences, reports: enReports, automation: enAutomation, payroll: enPayroll, adminUsers: enAdminUsers, settings: enSettings, questionSets: enQuestionSets, orgChart: enOrgChart, notifications: enNotifications, departments: enDepartments, legal: enLegal, broadcast: enBroadcast, scheduleInterview: enScheduleInterview, events: enEvents, smpContracts: enSmpContracts, offboarding: enOffboarding, inbox: enInbox, jobPosting: enJobPosting, interviews: enInterviews, rolesAccess: enRolesAccess, assets: enAssets, idCards: enIdCards, talent: enTalent, workforce: enWorkforce, onboarding: enOnboarding },
      ar: { common: arCommon, auth: arAuth, apply: arApply, portal: arPortal, layout: arLayout, dashboard: arDashboard, profile: arProfile, audit: arAudit, geofences: arGeofences, reports: arReports, automation: arAutomation, payroll: arPayroll, adminUsers: arAdminUsers, settings: arSettings, questionSets: arQuestionSets, orgChart: arOrgChart, notifications: arNotifications, departments: arDepartments, legal: arLegal, broadcast: arBroadcast, scheduleInterview: arScheduleInterview, events: arEvents, smpContracts: arSmpContracts, offboarding: arOffboarding, inbox: arInbox, jobPosting: arJobPosting, interviews: arInterviews, rolesAccess: arRolesAccess, assets: arAssets, idCards: arIdCards, talent: arTalent, workforce: arWorkforce, onboarding: arOnboarding },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    ns: ["common", "auth", "apply", "portal", "layout", "dashboard", "profile", "audit", "geofences", "reports", "automation", "payroll", "adminUsers", "settings", "questionSets", "orgChart", "notifications", "departments", "legal", "broadcast", "scheduleInterview", "events", "smpContracts", "offboarding", "inbox", "jobPosting", "interviews", "rolesAccess", "assets", "idCards", "talent", "workforce", "onboarding"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "htmlTag", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    react: { useSuspense: false },
  });

export function isRtl(locale: string): boolean {
  return locale.startsWith("ar");
}

export function setHtmlDirAttr(locale: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
}

setHtmlDirAttr(i18n.language || DEFAULT_LOCALE);
i18n.on("languageChanged", (lng) => setHtmlDirAttr(lng));

export default i18n;
