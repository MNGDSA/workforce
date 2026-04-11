import { db } from "./db";
import {
  geofenceZones,
  attendanceSubmissions,
  attendanceRecords,
  workforce,
  candidates,
  inboxItems,
  systemSettings,
  type GeofenceZone,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { compareFaces } from "./rekognition";

async function getOrgTimezone(): Promise<string> {
  try {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, "organization_timezone"));
    return row?.value ?? "Asia/Riyadh";
  } catch { return "Asia/Riyadh"; }
}

function formatInTimezone(date: Date, timezone: string): { dateStr: string; timeStr: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateStr = formatter.format(date);
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const timeStr = timeFmt.format(date);
  return { dateStr, timeStr };
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInsideGeofence(
  lat: number, lng: number,
  zone: GeofenceZone
): boolean {
  const distance = haversineDistance(
    lat, lng,
    Number(zone.centerLat), Number(zone.centerLng)
  );
  return distance <= zone.radiusMeters;
}

export async function findMatchingGeofence(
  lat: number, lng: number
): Promise<{ zone: GeofenceZone; distance: number } | null> {
  const zones = await db
    .select()
    .from(geofenceZones)
    .where(eq(geofenceZones.isActive, true));

  for (const zone of zones) {
    const distance = haversineDistance(
      lat, lng,
      Number(zone.centerLat), Number(zone.centerLng)
    );
    if (distance <= zone.radiusMeters) {
      return { zone, distance };
    }
  }
  return null;
}

export async function runVerificationPipeline(submissionId: string): Promise<{
  status: "verified" | "flagged";
  confidence: number;
  gpsInside: boolean;
  flagReason?: string;
}> {
  const [submission] = await db
    .select()
    .from(attendanceSubmissions)
    .where(eq(attendanceSubmissions.id, submissionId));

  if (!submission) throw new Error("Submission not found");

  const [wf] = await db
    .select()
    .from(workforce)
    .where(eq(workforce.id, submission.workforceId));
  if (!wf) throw new Error("Workforce record not found");

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, wf.candidateId));

  const referencePhotoUrl = candidate?.photoUrl ?? null;

  let confidence = 0;
  let faceError: string | undefined;

  if (!referencePhotoUrl) {
    faceError = "no_reference_photo";
  } else {
    const result = await compareFaces(referencePhotoUrl, submission.photoUrl);
    confidence = result.confidence;
    faceError = result.error;
  }

  const gpsResult = await findMatchingGeofence(
    Number(submission.gpsLat),
    Number(submission.gpsLng)
  );
  const gpsInside = !!gpsResult;

  const hasMockLocation = submission.mockLocationDetected === true;
  const hasEmulator = submission.isEmulator === true;
  const hasRoot = submission.rootDetected === true;
  const faceOk = !faceError && confidence >= 95;
  const isVerified = faceOk && gpsInside && !hasMockLocation && !hasEmulator && !hasRoot;

  const flagReasons: string[] = [];
  if (faceError === "no_reference_photo") flagReasons.push("No reference photo on file");
  else if (faceError) flagReasons.push(`Face verification error: ${faceError}`);
  else if (confidence < 95) flagReasons.push(`Face confidence ${confidence}% (below 95% threshold)`);
  if (!gpsInside) flagReasons.push("GPS location outside all geofence zones");
  if (hasMockLocation) flagReasons.push("Mock/fake GPS location detected on device");
  if (hasEmulator) flagReasons.push("Android emulator detected — possible spoofing attempt");
  if (hasRoot) flagReasons.push("Rooted/Magisk device detected — possible tampering attempt");

  const status = isVerified ? "verified" : "flagged";
  const flagReason = flagReasons.length > 0 ? flagReasons.join("; ") : undefined;

  const existingFlagReason = submission.flagReason;
  const wasAlreadyFlagged = submission.status === "flagged" && existingFlagReason;
  let mergedFlagReason = flagReason ?? null;
  if (wasAlreadyFlagged) {
    mergedFlagReason = existingFlagReason + (flagReason ? "; " + flagReason : "");
  }
  const finalStatus = wasAlreadyFlagged ? "flagged" : (status as "verified" | "flagged");

  const updateData: Partial<typeof attendanceSubmissions.$inferInsert> & { verifiedAt?: Date } = {
    status: finalStatus,
    rekognitionConfidence: String(confidence),
    gpsInsideGeofence: gpsInside,
    matchedGeofenceId: gpsResult?.zone.id ?? null,
    referencePhotoUrl,
    flagReason: mergedFlagReason,
  };

  if (finalStatus === "verified") {
    updateData.verifiedAt = new Date();

    const orgTz = await getOrgTimezone();
    const submittedTime = submission.submittedAt ? new Date(submission.submittedAt) : new Date();
    const { dateStr, timeStr: clockIn } = formatInTimezone(submittedTime, orgTz);

    const existing = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.workforceId, submission.workforceId),
          eq(attendanceRecords.date, dateStr)
        )
      );

    if (existing.length === 0) {
      const [record] = await db
        .insert(attendanceRecords)
        .values({
          workforceId: submission.workforceId,
          date: dateStr,
          status: "present",
          clockIn,
          source: "mobile",
          notes: `Auto-verified via mobile (confidence: ${confidence}%)`,
        })
        .returning();
      updateData.linkedAttendanceRecordId = record.id;
    } else {
      updateData.linkedAttendanceRecordId = existing[0].id;
    }
  } else {
    await db.insert(inboxItems).values({
      type: "attendance_verification",
      priority: "high",
      status: "pending",
      title: `Attendance verification needed — ${candidate?.fullNameEn ?? "Unknown"}`,
      body: flagReason,
      entityType: "attendance_submission",
      entityId: submissionId,
      metadata: {
        workforceId: submission.workforceId,
        employeeNumber: wf.employeeNumber,
        candidateName: candidate?.fullNameEn,
        submittedPhotoUrl: submission.photoUrl,
        referencePhotoUrl,
        confidence,
        gpsLat: submission.gpsLat,
        gpsLng: submission.gpsLng,
        gpsInside,
        mockLocationDetected: submission.mockLocationDetected,
        isEmulator: submission.isEmulator,
        rootDetected: submission.rootDetected,
        locationProvider: submission.locationProvider,
        deviceFingerprint: submission.deviceFingerprint,
      },
    });
  }

  await db
    .update(attendanceSubmissions)
    .set(updateData)
    .where(eq(attendanceSubmissions.id, submissionId));

  return { status, confidence, gpsInside, flagReason };
}

export async function approveSubmission(
  submissionId: string,
  reviewedBy: string,
  notes?: string
): Promise<void> {
  const [submission] = await db
    .select()
    .from(attendanceSubmissions)
    .where(eq(attendanceSubmissions.id, submissionId));

  if (!submission) throw new Error("Submission not found");
  if (submission.status !== "flagged") throw new Error("Only flagged submissions can be approved");

  const orgTz = await getOrgTimezone();
  const { dateStr, timeStr: clockIn } = formatInTimezone(submission.submittedAt, orgTz);

  const existing = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.workforceId, submission.workforceId),
        eq(attendanceRecords.date, dateStr)
      )
    );

  let linkedRecordId: string;

  if (existing.length === 0) {
    const [record] = await db
      .insert(attendanceRecords)
      .values({
        workforceId: submission.workforceId,
        date: dateStr,
        status: "present",
        clockIn,
        source: "mobile",
        recordedBy: reviewedBy,
        notes: `Manually approved by HR${notes ? `: ${notes}` : ""}`,
      })
      .returning();
    linkedRecordId = record.id;
  } else {
    linkedRecordId = existing[0].id;
  }

  await db
    .update(attendanceSubmissions)
    .set({
      status: "verified",
      verifiedAt: new Date(),
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
      linkedAttendanceRecordId: linkedRecordId,
    })
    .where(eq(attendanceSubmissions.id, submissionId));

  await db
    .update(inboxItems)
    .set({ status: "resolved", resolvedBy: reviewedBy, resolvedAt: new Date() })
    .where(
      and(
        eq(inboxItems.entityType, "attendance_submission"),
        eq(inboxItems.entityId, submissionId),
        eq(inboxItems.status, "pending")
      )
    );
}

export async function rejectSubmission(
  submissionId: string,
  reviewedBy: string,
  notes?: string
): Promise<void> {
  const [submission] = await db
    .select()
    .from(attendanceSubmissions)
    .where(eq(attendanceSubmissions.id, submissionId));

  if (!submission) throw new Error("Submission not found");
  if (submission.status !== "flagged") throw new Error("Only flagged submissions can be rejected");

  await db
    .update(attendanceSubmissions)
    .set({
      status: "rejected",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
    })
    .where(eq(attendanceSubmissions.id, submissionId));

  await db
    .update(inboxItems)
    .set({ status: "dismissed", resolvedBy: reviewedBy, resolvedAt: new Date() })
    .where(
      and(
        eq(inboxItems.entityType, "attendance_submission"),
        eq(inboxItems.entityId, submissionId),
        eq(inboxItems.status, "pending")
      )
    );
}
