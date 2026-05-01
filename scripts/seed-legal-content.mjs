#!/usr/bin/env node
// Task #249 — Idempotently seed the bilingual (AR + EN) Privacy Policy
// and Terms & Conditions text into the `system_settings` table for
// the public legal pages (/privacy-policy, /terms-conditions).
//
// Behaviour:
//   - For each of `privacy_policy` and `terms_conditions`, reads the
//     current value. If it is NULL, missing, empty, or whitespace-only,
//     writes the canonical content below. Otherwise leaves it alone and
//     logs `skipped (already set)`.
//   - This makes the script safe to re-run; future admin edits via the
//     existing /api/settings/system PATCH endpoint are preserved.
//
// Usage:
//   node scripts/seed-legal-content.mjs                         # uses DATABASE_URL
//   DATABASE_URL=$PROD_DATABASE_URL node scripts/seed-legal-content.mjs   # seed prod
//
// Connects via DATABASE_URL only — operators run prod via the same
// pattern as migrate-prod.mjs (point DATABASE_URL at the prod DB
// explicitly), keeping accidental prod writes off the table when
// developers just want to populate their local dev DB.
// SSL handling matches the other backfill scripts so it works against
// managed Postgres providers without a CA bundle on disk.

import pg from "pg";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: DATABASE_URL must be set.");
  process.exit(1);
}

const PRIVACY_POLICY = `# سياسة الخصوصية

**شركة العربة الفاخرة (Luxury Cart Company)**
**تاريخ السريان:** 30 أبريل 2026
**آخر تحديث:** 30 أبريل 2026

## 1. مقدمة
تُشغّل **شركة العربة الفاخرة** ("**الشركة**" أو "**نحن**") منصة **WORKFORCE** ("**المنصة**")، وهي نظام لإدارة التوظيف والتأهيل والحضور والرواتب يستخدمه أصحاب العمل والمختصون بالتوظيف والمرشحون والموظفون وشركات تزويد العمالة (**SMP**)، وذلك بشكل أساسي داخل المملكة العربية السعودية.

توضّح هذه السياسة البيانات الشخصية التي نجمعها، وكيفية استخدامها، والجهات التي نشاركها معها، وحقوقك بموجب **نظام حماية البيانات الشخصية السعودي (PDPL)** الصادر بالمرسوم الملكي رقم م/19، تحت إشراف الهيئة السعودية للبيانات والذكاء الاصطناعي (**سدايا**).

باستخدامك للمنصة، فإنك تُقرّ بأنك قرأت هذه السياسة وفهمتها.

## 2. صفة الشركة
بالنسبة للبيانات التي يُدخلها مسؤولو صاحب العمل عن المرشحين والموظفين، يُعدّ **صاحب العمل هو المتحكم في البيانات** وتعمل شركة العربة الفاخرة بصفتها **مُعالِجاً للبيانات**. أما بالنسبة لبيانات الحساب والأمن وتشغيل المنصة، فإن **شركة العربة الفاخرة هي المتحكم في البيانات**.

## 3. البيانات الشخصية التي نجمعها
حسب دورك (مرشح، موظف، مسؤول، أو مستخدم SMP)، قد نجمع:

**أ. بيانات الهوية**
- الاسم الكامل (بالعربية والإنجليزية)، الجنس، تاريخ الميلاد، الجنسية، الحالة الاجتماعية.
- رقم الهوية الوطنية، رقم الإقامة، رقم جواز السفر، والنسخ الرقمية لهذه الوثائق.

**ب. بيانات التواصل**
- رقم الجوال، رقم واتساب، البريد الإلكتروني، المدينة، المنطقة، وبيانات التواصل في حالات الطوارئ.

**ج. البيانات المهنية**
- المؤهلات، الجامعة، التخصص، الخبرات السابقة، المهارات، اللغات، الشهادات، السيرة الذاتية.

**د. البيانات المالية**
- رقم الآيبان، اسم البنك (يُستخرج تلقائياً من الآيبان)، رمز البنك، اسم صاحب الحساب — وتُستخدم حصراً لصرف الرواتب وفق نظام حماية الأجور (WPS).

**هـ. البيانات الصحية**
- شهادات التطعيم المطلوبة لاشتراطات الفعاليات.

**و. البيانات الحيوية (البيومترية)**
- البصمة الوجهية / درجة المطابقة المُولَّدة عبر خدمة **AWS Rekognition**، وتُستخدم **فقط** للتحقق من أن الشخص الذي يُسجّل الحضور هو الموظف المسجّل.

**ز. بيانات الموقع**
- الموقع الجغرافي اللحظي (GPS) عند تسجيل الدخول والخروج، للتحقق من تواجد العامل داخل النطاق الجغرافي المخصص.

**ح. بيانات الجهاز والسلامة التقنية**
- طراز الجهاز، إصدار النظام، إصدار التطبيق، نتيجة Play Integrity، مؤشرات تزوير الموقع، كشف المحاكيات، وعنوان IP.

**ط. بيانات الاستخدام والسجلات**
- الصفحات المُزارة، الإجراءات المنفّذة، الأوقات، سجلات الأخطاء، ومعرّفات الجلسات.

**ي. بيانات الاتصالات**
- محتوى الرسائل النصية والواتساب وإشعارات التطبيق التي تُرسل إليك (مثل تذكير المستندات، دعوات المقابلات، روابط توقيع العقود).

## 4. أغراض الاستخدام
نُعالج البيانات الشخصية للأغراض التالية:
1. تشغيل مسار التوظيف (الإعلانات، الطلبات، التقييم، المقابلات).
2. التأهيل والتحقق من المستندات.
3. إصدار وتوقيع وحفظ عقود العمل الرقمية ثنائية اللغة.
4. إدارة القوى العاملة (الورديات، الجداول، البطاقات التعريفية).
5. التحقق من الحضور عبر النطاق الجغرافي والتعرّف على الوجه.
6. احتساب الرواتب وإصدار ملفات WPS البنكية ومتابعة المدفوعات.
7. إرسال إشعارات تشغيلية عبر الرسائل النصية، واتساب، البريد الإلكتروني، أو داخل التطبيق.
8. مكافحة الاحتيال وفحص سلامة الجهاز وحماية أمن المنصة.
9. الالتزام بالأنظمة السعودية للعمل والضرائب وحماية البيانات.
10. إعداد إحصاءات مُجمَّعة وغير معرِّفة لتحسين الخدمة.

## 5. الأساس النظامي للمعالجة (PDPL)
نعتمد على واحد أو أكثر من الأسس التالية:
- **تنفيذ عقد** (مثل عقد العمل أو الرواتب).
- **الالتزام بنظام أو لائحة** (نظام العمل، WPS، الضرائب).
- **المصلحة المشروعة** لصاحب العمل / المتحكم (الأمن، مكافحة الاحتيال).
- **موافقتك الصريحة** على معالجة البيانات الحساسة كالبيومترية والصحية.

يحق لك **سحب الموافقة على معالجة البيانات الحيوية في أي وقت**، ويترتّب على ذلك التحقق من الحضور بطريقة بديلة يعتمدها صاحب العمل، وقد يؤثر ذلك على إمكانية تسجيل الحضور عبر تطبيق الجوال.

## 6. مشاركة البيانات
نشارك بياناتك فقط عند الحاجة ووفق ضمانات مناسبة مع:
- **صاحب العمل والمسؤولين والمختصين بالتوظيف المخوّلين لديه.**
- **شركات تزويد العمالة (SMP)** إذا تم تزويدك من خلالها (في حدود ما يخدم تلك العلاقة).
- **مزوّدي الخدمات** نيابة عنا: AWS (Rekognition وS3 وRDS)، DigitalOcean (الاستضافة وتخزين Spaces)، مزوّدو بوابات الرسائل النصية وواتساب، ومزوّدو البريد الإلكتروني.
- **البنوك ومنظومة WPS** لصرف الرواتب.
- **الجهات الحكومية** متى ما تطلّب ذلك النظام أو حكم قضائي أو طلب رقابي.
- **المستشارين المهنيين** (المدققين، المستشارين القانونيين) ضمن التزامات السرية.

نحن **لا نبيع** بياناتك الشخصية.

## 7. النقل خارج المملكة
قد يُعالج بعض مزوّدي الخدمات (مثل AWS) البيانات خارج المملكة. وعند حدوث ذلك، نُطبّق الضمانات التي يتطلبها نظام حماية البيانات الشخصية ولوائح سدايا، بما يشمل الالتزامات التعاقدية والاعتمادات الرسمية عند الحاجة.

## 8. مدة الاحتفاظ
نحتفظ بالبيانات للمدة اللازمة لتحقيق الأغراض المذكورة، وتشمل:
- **المرشحون والموظفون النشطون:** طوال فترة العلاقة الوظيفية أو التوظيفية.
- **سجلات الرواتب والعقود وWPS:** حسب ما يتطلبه نظام العمل والضرائب (عادةً حتى 10 سنوات).
- **القوالب البيومترية للوجه:** أثناء فترة عمل الموظف، ثم تُحذف عند انتهاء العلاقة الوظيفية ما لم يكن هناك نزاع قائم.
- **الملفات غير النشطة للمرشحين:** تُؤرشف (حذف ناعم) وتُراجع دورياً.

## 9. الأمن
نطبّق إجراءات تقنية وتنظيمية تشمل: تشفير البيانات أثناء النقل (TLS) وعند التخزين، تجزئة كلمات المرور (bcrypt)، مصادقة قائمة على الجلسات، تحكم بالوصول حسب الأدوار، سجلات تدقيق، إشارات سلامة الجهاز، وفصل قواعد بيانات الإنتاج.

لا يوجد نظام آمن بنسبة 100%. أنت مسؤول عن سرية بيانات الدخول الخاصة بك.

## 10. حقوقك بموجب PDPL
وفقاً للنظام، يحق لك:
- أن تكون **على علم** بكيفية معالجة بياناتك.
- **الوصول** إلى بياناتك.
- **طلب تصحيح** البيانات غير الدقيقة.
- **طلب حذف** البيانات (مع مراعاة متطلبات الاحتفاظ النظامية).
- **سحب الموافقة** عندما تكون المعالجة مبنية عليها.
- **تقديم شكوى** إلى سدايا.

لممارسة هذه الحقوق، تواصل معنا على **HR@luxurycartsgroup.com**. وللبيانات المُحتفَظ بها نيابة عن صاحب العمل، سنُحيل طلبك إلى صاحب العمل المعني.

## 11. بيانات الأطفال
المنصة غير مُوجَّهة لمن هم دون 18 عاماً، ولا نجمع عمداً أي بيانات تخصّ القُصّر.

## 12. الكوكيز والتقنيات المماثلة
تستخدم المنصة كوكيز جلسات ضرورية للمصادقة والأمن فقط، ولا نستخدم كوكيز إعلانية أو تتبعية لأطراف ثالثة.

## 13. التعديلات
قد نُحدّث هذه السياسة. سيتم إبلاغك بأي تغييرات جوهرية عبر المنصة أو وسائل التواصل المسجّلة.

## 14. التواصل معنا
**شركة العربة الفاخرة (Luxury Cart Company)**
العنوان: البغدادية الغربية، جدة، المملكة العربية السعودية
البريد الإلكتروني: HR@luxurycartsgroup.com

---

# Privacy Policy

**Luxury Cart Company (شركة العربة الفاخرة)**
**Effective Date:** April 30, 2026
**Last Updated:** April 30, 2026

## 1. Introduction
Luxury Cart Company ("**Luxury Cart**", "**we**", "**us**", or "**our**") operates the **WORKFORCE** platform (the "**Platform**"), a workforce hiring, onboarding, attendance, and payroll management system used by employers, recruiters, candidates, employees, and Sub-Manpower Provider ("**SMP**") partners, primarily in the Kingdom of Saudi Arabia ("**KSA**").

This Privacy Policy explains what personal data we collect, how we use it, with whom we share it, and the rights you have under the **Saudi Personal Data Protection Law (PDPL)** issued by Royal Decree M/19 and supervised by the Saudi Data & Artificial Intelligence Authority (**SDAIA**).

By accessing or using the Platform, you acknowledge that you have read and understood this Privacy Policy.

## 2. Who is the Data Controller
For data submitted by employer administrators about their candidates and employees, the **employer is the data controller** and Luxury Cart acts as a **data processor**. For account, security, and platform-operations data, **Luxury Cart is the data controller**.

## 3. Personal Data We Collect
Depending on your role (candidate, employee, admin, or SMP user), we may collect:

**a. Identity Data**
- Full name (English and Arabic), gender, date of birth, nationality, marital status.
- National ID (Saudi), Iqama number (residents), Passport number, and digital copies of those documents.

**b. Contact Data**
- Mobile number, WhatsApp number, email address, city, region, and emergency contact details.

**c. Professional Data**
- Education, university, major, work history, skills, languages, certifications, CV.

**d. Financial Data**
- IBAN, bank name (auto-resolved from IBAN), bank code, and account-holder name (used solely for WPS-compliant payroll).

**e. Health Data**
- Vaccination certificates required for event compliance.

**f. Biometric Data**
- Facial template / face match score generated via Amazon Web Services (**AWS**) Rekognition, used **only** to verify that the person clocking in is the enrolled employee.

**g. Location Data**
- Real-time GPS location collected at the moment of clock-in / clock-out to validate the worker is inside the assigned geofenced zone.

**h. Device & Integrity Data**
- Device model, OS version, app version, Play Integrity verdict, mock-location indicators, emulator detection, and IP address.

**i. Usage & Log Data**
- Pages visited, actions taken, timestamps, error logs, and session identifiers.

**j. Communication Data**
- SMS, WhatsApp, and in-app notification content sent to you (e.g., document reminders, interview invitations, contract signing links).

## 4. How We Use Your Personal Data
We process personal data for the following purposes:
1. Operating the hiring pipeline (job postings, applications, scoring, interviews).
2. Onboarding and document verification.
3. Generating, signing, and storing bilingual digital employment contracts.
4. Workforce management (shifts, schedules, ID cards).
5. Attendance verification using GPS geofencing and facial recognition.
6. Payroll calculation, WPS bank-file generation, and payment tracking.
7. Sending operational notifications by SMS, WhatsApp, email, or in-app.
8. Fraud prevention, device-integrity checks, and protecting platform security.
9. Complying with KSA labor, tax, and data-protection laws.
10. Generating aggregated, non-identifying analytics to improve the service.

## 5. Legal Basis for Processing (PDPL)
We rely on one or more of the following bases:
- **Performance of a contract** (e.g., employment, payroll).
- **Compliance with a legal obligation** (e.g., labor law, WPS, tax).
- **Legitimate interest** of the employer/controller (e.g., security, fraud prevention).
- **Your explicit consent** for sensitive data such as biometric and health data.

You may **withdraw consent for biometric processing at any time**; however, doing so means attendance must be verified by an alternative method approved by your employer, and may affect your ability to clock in via the mobile app.

## 6. Sharing of Personal Data
We share personal data only as needed and with appropriate safeguards:
- **Your employer and its authorized administrators / recruiters.**
- **SMP companies**, where you were supplied by one (limited to data relevant to that relationship).
- **Service providers** acting on our behalf: AWS (Rekognition, S3, RDS), DigitalOcean (hosting and Spaces storage), SMS/WhatsApp gateway providers, and email providers.
- **Banks and WPS systems** to execute salary payments.
- **Government authorities** when required by KSA law, court order, or regulatory request.
- **Professional advisors** (auditors, lawyers) under confidentiality obligations.

We do **not** sell your personal data.

## 7. International Transfers
Some processors (e.g., AWS) may process data outside KSA. When this occurs, we apply the safeguards required by PDPL and SDAIA regulations, including contractual commitments and, where applicable, adequacy or approval from the competent authority.

## 8. Data Retention
We retain personal data for as long as necessary to fulfill the purposes described above, including:
- **Active candidates / employees:** for the duration of the hiring or employment relationship.
- **Payroll, contracts, and WPS records:** as required by KSA labor and tax law (typically up to 10 years).
- **Biometric face templates:** while the employee is active; deleted on termination of employment unless retention is required for an open dispute.
- **Inactive candidate profiles:** archived (soft-deleted) and reviewed periodically.

## 9. Security
We implement technical and organizational measures including: encrypted data in transit (TLS) and at rest, hashed passwords (bcrypt), session-based authentication, role-based access control, audit logs, device-trust signals, and segregated production databases.

No system is 100% secure. You are responsible for keeping your credentials confidential.

## 10. Your Rights under PDPL
Subject to PDPL, you have the right to:
- Be **informed** about how your data is processed.
- **Access** your personal data.
- **Request correction** of inaccurate data.
- **Request deletion** of your data (subject to legal retention requirements).
- **Withdraw consent** where processing is based on consent.
- **Lodge a complaint** with SDAIA.

To exercise these rights, contact us at **HR@luxurycartsgroup.com**. For data held on behalf of an employer, we will forward your request to that employer.

## 11. Children's Data
The Platform is not intended for individuals under 18. We do not knowingly collect personal data from minors.

## 12. Cookies & Similar Technologies
The Platform uses strictly necessary session cookies for authentication and security. We do not use third-party advertising or tracking cookies.

## 13. Changes to this Policy
We may update this Privacy Policy. Material changes will be communicated via the Platform or by notice to your registered contact.

## 14. Contact Us
**Luxury Cart Company (شركة العربة الفاخرة)**
Address: Albaghdadiyah Algharbiyah, Jeddah, Kingdom of Saudi Arabia
Email: HR@luxurycartsgroup.com
`;

const TERMS_CONDITIONS = `# الشروط والأحكام

**شركة العربة الفاخرة (Luxury Cart Company) — منصة WORKFORCE**
**تاريخ السريان:** 30 أبريل 2026

## 1. قبول الشروط
باستخدامك لمنصة **WORKFORCE** ("**المنصة**")، فإنك ("**المستخدم**") توافق على الالتزام بهذه الشروط والأحكام ("**الشروط**"). إن لم توافق عليها، فلا تستخدم المنصة.

## 2. تعريفات
- **"الشركة" أو "نحن"**: شركة العربة الفاخرة (Luxury Cart Company).
- **"صاحب العمل"**: الجهة التي تمتلك حساب مسؤول على المنصة وتُدير المرشحين والموظفين.
- **"المرشح"**: الشخص الذي يتقدم للوظائف عبر المنصة.
- **"الموظف"**: العامل الذي تم توظيفه وإدارته عبر المنصة.
- **"SMP"**: شركة تزويد العمالة التي تُورّد دفعات من العمال.
- **"المسؤول"**: مستخدم لديه صلاحيات إدارية ضمن حساب صاحب العمل.

## 3. الأهلية
يجب ألا يقل عمرك عن 18 عاماً وأن تكون مؤهلاً نظاماً للدخول في عقد ملزم بموجب أنظمة المملكة العربية السعودية لاستخدام المنصة.

## 4. الحسابات والأمن
- أنت مسؤول عن دقة البيانات التي تُدخلها.
- يجب الحفاظ على سرية بيانات الدخول، وإبلاغنا فوراً عن أي وصول غير مصرح به.
- أنت مسؤول عن جميع الأنشطة التي تتم تحت حسابك.
- يحق لنا تعليق أو إنهاء الحسابات المخالفة للشروط أو الأنظمة المعمول بها.

## 5. الاستخدام المقبول
توافق على عدم القيام بما يلي:
1. تقديم بيانات شخصية أو وثائق غير صحيحة أو مضللة أو احتيالية.
2. رفع وثائق هوية أو صورة أو بيانات حيوية تخص شخصاً آخر دون تفويض نظامي.
3. استخدام مواقع GPS مزيفة أو محاكيات أو أجهزة مُعدَّلة (rooted) أو أي وسيلة لتجاوز ضوابط الحضور والنطاق الجغرافي والتحقق من الوجه.
4. محاولة الوصول إلى بيانات تخص جهة أخرى أو صاحب عمل آخر أو مرشح أو موظف آخر.
5. الهندسة العكسية أو نسخ المنصة أو بياناتها أو سحبها بطرق مؤتمتة.
6. استخدام المنصة لإرسال رسائل غير مصرّح بها خارج نطاق الإشعارات التشغيلية المخصصة لها.
7. التأثير على أمن المنصة أو توافرها أو سلامتها.

تستوجب المخالفات إيقاف الحساب فوراً وقد يُبلَّغ عنها للجهات المختصة.

## 6. العقود والتوقيعات الإلكترونية
تُصدر المنصة عقود عمل ثنائية اللغة وتدعم التوقيع الإلكتروني. وبتوقيعك إلكترونياً، فإنك تُقر بأن للتوقيع الإلكتروني الأثر النظامي ذاته للتوقيع اليدوي وفقاً **لنظام التعاملات الإلكترونية السعودي**.

## 7. الحضور والنطاق الجغرافي والتحقق البيومتري
- يستلزم تسجيل الدخول والخروج تحديد الموقع الجغرافي والتقاط صورة حيّة تتم مقارنتها بقالبك الوجهي المسجّل.
- المحاولات التي تُكتشف على أنها احتيالية (موقع وهمي، محاكي، صورة من صورة، …) سترفض وقد يترتب عليها إجراءات تأديبية من صاحب العمل.
- لا تحلّ المنصة محلّ القرار الإداري لصاحب العمل، وقرارات الحضور النهائية تعود لصاحب العمل.

## 8. الرواتب والمدفوعات
- تُحتسب الرواتب وتُولَّد ملفات WPS بناءً على الحضور والجداول والقواعد التي يضبطها صاحب العمل.
- **لا تقوم الشركة** بصرف الرواتب؛ ويبقى صاحب العمل وحده مسؤولاً عن دفع المستحقات للموظفين.
- يجب الإبلاغ عن أي خطأ إلى صاحب العمل عبر قنوات الأعذار / الاعتراضات داخل التطبيق.

## 9. الإشعارات
باستخدامك للمنصة، فإنك توافق على تلقّي إشعارات تشغيلية (رسائل نصية، واتساب، بريد إلكتروني، إشعارات داخل التطبيق) تشمل تذكير المستندات ودعوات المقابلات وروابط العقود وتنبيهات الرواتب والأمن. وهذه ليست رسائل تسويقية.

## 10. الملكية الفكرية
جميع البرمجيات والتصاميم والشعارات والنصوص ومحتوى المنصة مملوكة للشركة أو مرخّصة لها. ويُمنح لك ترخيص محدود وغير حصري وغير قابل للنقل وقابل للإلغاء لاستخدام المنصة في الغرض المخصصة له. ولا يجوز لك نسخها أو تعديلها أو توزيعها أو اشتقاق أعمال منها.

## 11. بيانات صاحب العمل / العميل
- يحتفظ أصحاب العمل بملكية البيانات التي يرفعونها.
- يتحمّل أصحاب العمل مسؤولية وجود الأساس النظامي لرفع ومعالجة بيانات المرشحين والموظفين والحصول على الموافقات اللازمة.
- تُعالج الشركة هذه البيانات نيابةً عن صاحب العمل وفق سياسة الخصوصية ونظام حماية البيانات الشخصية.

## 12. توافر الخدمة
نسعى لإتاحة المنصة على مدار الساعة، لكننا لا نضمن استمرارية الخدمة دون انقطاع. وقد تتسبب أعمال الصيانة أو التحديثات أو الاعتماديات الخارجية (AWS، DigitalOcean، مزوّدو الاتصالات) في توقف مؤقت.

## 13. إخلاء المسؤولية
تُقدَّم المنصة "**كما هي**" و"**حسب توفّرها**". وإلى أقصى حد يسمح به النظام، تُخلي الشركة مسؤوليتها عن جميع الضمانات الصريحة أو الضمنية، بما في ذلك ضمانات القابلية للتسويق والملاءمة لغرض معين وعدم الانتهاك.

## 14. تحديد المسؤولية
إلى الحد الذي تُجيزه أنظمة المملكة العربية السعودية، لا تتحمّل الشركة أي مسؤولية عن الأضرار غير المباشرة أو العَرَضية أو الخاصة أو التبعية أو التأديبية، أو فقدان الأرباح أو الإيرادات أو البيانات أو السمعة، الناتجة عن استخدامك للمنصة. ولا تتجاوز مسؤوليتنا الإجمالية الرسوم التي دفعها صاحب العمل للشركة خلال 12 شهراً السابقة للمطالبة، أو **1,000 ريال سعودي**، أيهما أقل، ما لم يحظر النظام ذلك.

## 15. التعويض
توافق على تعويض الشركة ومديريها وموظفيها وشركائها وحمايتهم من أي مطالبة أو خسارة أو نفقة (بما فيها الأتعاب القانونية) ناتجة عن إخلالك بهذه الشروط أو سوء استخدامك للمنصة.

## 16. الإنهاء
يحق لنا تعليق أو إنهاء وصولك فوراً عند مخالفتك للشروط أو النظام، أو عند إغلاق حساب صاحب العمل التابع له. وعند الإنهاء، ينتهي حقك في استخدام المنصة، مع بقاء الأحكام التي يقتضي طبيعتها الاستمرار (الملكية الفكرية، المسؤولية، التعويض، النظام الحاكم) سارية.

## 17. تعديل الشروط
يحق لنا تعديل هذه الشروط من حين لآخر، ويتم إبلاغك بالتغييرات الجوهرية عبر المنصة. ويُعدّ استمرارك في استخدام المنصة بعد تاريخ سريان التعديل قبولاً به.

## 18. النظام الحاكم والاختصاص القضائي
تخضع هذه الشروط لأنظمة **المملكة العربية السعودية**. وتختص بالنظر في أي نزاع المحاكم المختصة في **جدة**.

## 19. التواصل
**شركة العربة الفاخرة (Luxury Cart Company)**
البريد الإلكتروني: HR@luxurycartsgroup.com
العنوان: البغدادية الغربية، جدة، المملكة العربية السعودية

---

# Terms & Conditions

**Luxury Cart Company (شركة العربة الفاخرة) — WORKFORCE Platform**
**Effective Date:** April 30, 2026

## 1. Acceptance of Terms
By accessing or using the WORKFORCE platform (the "**Platform**"), you ("**User**" or "**you**") agree to be bound by these Terms & Conditions (the "**Terms**"). If you do not agree, do not use the Platform.

## 2. Definitions
- **"Company", "we", "our"** – Luxury Cart Company (شركة العربة الفاخرة).
- **"Employer"** – The organization that holds an admin account on the Platform and manages candidates/employees.
- **"Candidate"** – An individual applying for a job through the Platform.
- **"Employee"** – A worker hired and managed via the Platform.
- **"SMP"** – Sub-Manpower Provider supplying batches of workers.
- **"Admin"** – A user with administrative privileges within an employer's tenant.

## 3. Eligibility
You must be at least 18 years old and legally able to enter into a binding contract under KSA law to use the Platform.

## 4. Accounts and Security
- You are responsible for the accuracy of the data you submit.
- You must keep your credentials confidential and notify us immediately of any unauthorized access.
- You are responsible for all activity under your account.
- We may suspend or terminate accounts that violate these Terms or applicable law.

## 5. Acceptable Use
You agree not to:
1. Submit false, misleading, or fraudulent personal or document information.
2. Upload another person's identity documents, photo, or biometric data without lawful authority.
3. Use mock locations, emulators, rooted devices, or other tools to circumvent attendance, geofence, or face-verification controls.
4. Attempt to access data belonging to another tenant, employer, candidate, or employee.
5. Reverse engineer, scrape, or copy the Platform or its data.
6. Use the Platform to send unsolicited messages outside the operational notifications it is designed for.
7. Interfere with the Platform's security, availability, or integrity.

Violations may result in immediate account suspension and may be reported to authorities.

## 6. Digital Contracts and Signatures
The Platform generates and stores bilingual employment contracts and supports electronic signatures. By signing electronically, you acknowledge that the electronic signature has the same legal effect as a handwritten signature under the **KSA Electronic Transactions Law**.

## 7. Attendance, Geofencing & Biometric Verification
- Clock-in / clock-out require GPS location and a live selfie compared against your enrolled face template.
- Attempts detected as fraudulent (mock GPS, emulator, photo-of-photo, etc.) will be rejected and may be subject to disciplinary action by the Employer.
- The Platform does not replace the Employer's HR judgment; final attendance decisions belong to the Employer.

## 8. Payroll & Payments
- Payroll calculations and WPS exports are generated based on attendance, schedules, and Employer-configured rules.
- The Company does **not** disburse salaries; the Employer remains solely responsible for paying employees.
- Errors must be reported to the Employer through the in-app excuse / dispute channels.

## 9. Notifications
By using the Platform you consent to receive operational notifications (SMS, WhatsApp, email, in-app), including document reminders, interview invitations, contract links, payroll notices, and security alerts. These are not marketing communications.

## 10. Intellectual Property
All software, designs, logos, text, and content of the Platform are owned by or licensed to the Company. You receive a limited, non-exclusive, non-transferable, revocable license to use the Platform for its intended purpose. You may not copy, modify, distribute, or create derivative works.

## 11. Employer / Customer Data
- Employers retain ownership of the data they upload.
- Employers are responsible for the lawful basis to upload and process candidate/employee data and for obtaining required consents.
- The Company processes such data on behalf of the Employer in accordance with the Privacy Policy and PDPL.

## 12. Service Availability
We strive to keep the Platform available 24/7 but do not guarantee uninterrupted service. Maintenance, updates, or external dependencies (AWS, DigitalOcean, telecom providers) may cause downtime.

## 13. Disclaimers
The Platform is provided **"as is"** and **"as available"**. To the maximum extent permitted by law, the Company disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.

## 14. Limitation of Liability
To the extent permitted by KSA law, the Company shall not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or goodwill arising from your use of the Platform. Our aggregate liability shall not exceed the fees paid by the Employer to the Company in the 12 months preceding the claim, or **SAR 1,000**, whichever is lower, unless prohibited by law.

## 15. Indemnification
You agree to indemnify and hold harmless the Company, its directors, employees, and partners from any claim, loss, or expense (including legal fees) arising from your breach of these Terms or misuse of the Platform.

## 16. Termination
We may suspend or terminate your access immediately if you violate these Terms or applicable law, or if your Employer's account is closed. Upon termination, your right to use the Platform ends, but provisions that by their nature should survive (IP, liability, indemnification, governing law) will remain in effect.

## 17. Changes to the Terms
We may modify these Terms from time to time. Material changes will be notified via the Platform. Continued use of the Platform after the effective date of changes constitutes acceptance.

## 18. Governing Law and Jurisdiction
These Terms are governed by the laws and regulations of the **Kingdom of Saudi Arabia**. Any dispute shall be submitted to the competent courts of **Jeddah**.

## 19. Contact
**Luxury Cart Company (شركة العربة الفاخرة)**
Email: HR@luxurycartsgroup.com
Address: Albaghdadiyah Algharbiyah, Jeddah, Kingdom of Saudi Arabia
`;

const ENTRIES = [
  { key: "privacy_policy", value: PRIVACY_POLICY },
  { key: "terms_conditions", value: TERMS_CONDITIONS },
];

const sslmodeMatch = DB_URL.match(/[?&]sslmode=([^&]*)/);
const sslmode = sslmodeMatch?.[1] ?? null;
const useSsl = sslmode !== null && sslmode !== "disable";
const url = DB_URL.replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, "");
const client = new pg.Client({
  connectionString: url,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
});

let exitCode = 0;
try {
  await client.connect();
  console.log(`[seed-legal] connected to ${new URL(DB_URL).hostname}`);

  for (const { key, value } of ENTRIES) {
    const existing = await client.query(
      "SELECT value FROM system_settings WHERE key = $1",
      [key],
    );
    const current = existing.rows[0]?.value;
    if (current && current.trim() !== "") {
      console.log(`[seed-legal] ${key}: skipped (already set, ${current.length} chars)`);
      continue;
    }
    await client.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key, value],
    );
    console.log(`[seed-legal] ${key}: written (${value.length} chars)`);
  }
  console.log("[seed-legal] done.");
} catch (err) {
  console.error("[seed-legal] FAILED:", err.message);
  if (err.stack) console.error(err.stack);
  exitCode = 1;
} finally {
  try { await client.end(); } catch {}
  process.exit(exitCode);
}
