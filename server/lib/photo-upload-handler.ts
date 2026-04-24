import type { Request, Response, RequestHandler } from "express";
import type { FaceQualityResult } from "../rekognition";
import type {
  persistRotationRescue as PersistRotationRescue,
  RotationRescueRecordKind,
} from "./photo-rotation";

export type FallbackDecision =
  | { kind: "proceed" }
  | { kind: "block"; telemetry: any }
  | { kind: "allow"; telemetry: any };

export interface PhotoUploadStorage {
  getCandidate(id: string): Promise<any>;
  getWorkforceByCandidateId(id: string): Promise<any>;
  updateCandidate(id: string, payload: Record<string, any>): Promise<any>;
  getOnboardingRecords(args: { candidateId: string }): Promise<any[]>;
  updateOnboardingRecord(id: string, payload: Record<string, any>): Promise<any>;
  createPhotoChangeRequest(payload: any): Promise<any>;
}

export interface PhotoUploadDeps {
  storage: PhotoUploadStorage;
  uploadFile(localPath: string, name: string, mime: string, opts: { isPublic: boolean }): Promise<string>;
  deleteFile(url: string): Promise<void>;
  overwriteFile(url: string, buffer: Buffer, mime: string): Promise<void>;
  getMimeType(name: string): string;
  validateFaceQuality(fileUrl: string): Promise<FaceQualityResult>;
  decideRekognitionFallbackAction(args: { qualityCheckSkipped: boolean; hasPreviouslyValidatedPhoto: boolean }): FallbackDecision;
  recordRekognitionFallback(telemetry: any, candidateId: string): void;
  persistRotationRescue: typeof PersistRotationRescue;
  // Task #166 — sink for the rotation-rescue rolling counter. The
  // route wires this to `recordRotationRescueOutcome`; callers in
  // tests can pass a no-op or spy.
  recordRotationRescueOutcome(kind: RotationRescueRecordKind): void;
  tr(req: Request, key: string): string;
  assertCandidateOwnerOrAdmin(req: Request, res: Response, candidateId: string): Promise<boolean>;
  handleError(res: Response, err: unknown): Response | void;
  computeOnboardingStatus(rec: any, isSmpRec: boolean): string;
  supersedePendingPhotoChanges(candidateId: string): Promise<void>;
  createPhotoChangeInboxItem(args: {
    candidate: any;
    activeRecord: any;
    changeRequest: any;
    fileUrl: string;
    candidateId: string;
  }): Promise<void>;
}

export function createUploadDocumentsHandler(deps: PhotoUploadDeps): RequestHandler {
  const {
    storage,
    uploadFile,
    deleteFile,
    overwriteFile,
    getMimeType,
    validateFaceQuality,
    decideRekognitionFallbackAction,
    recordRekognitionFallback,
    persistRotationRescue,
    recordRotationRescueOutcome,
    tr,
    assertCandidateOwnerOrAdmin,
    handleError,
    computeOnboardingStatus,
    supersedePendingPhotoChanges,
    createPhotoChangeInboxItem,
  } = deps;

  return async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!(await assertCandidateOwnerOrAdmin(req, res, id))) return;
      const docType = req.body.docType as string;
      if (!req.file) return res.status(400).json({ message: tr(req, "file.noUpload") });
      if (!["photo", "nationalId", "iban", "resume"].includes(docType)) {
        return res.status(400).json({ message: tr(req, "file.invalidDocType") });
      }
      const localPath = req.file.path;
      const fileUrl = await uploadFile(localPath, req.file.filename, getMimeType(req.file.filename), { isPublic: docType === "photo" });
      let photoQualityResult: FaceQualityResult | undefined;
      let rotationApplied: 90 | -90 | undefined;

      if (docType === "photo") {
        const allowedPhotoMimes = ["image/jpeg", "image/jpg", "image/png"];
        if (!allowedPhotoMimes.includes(req.file.mimetype.toLowerCase())) {
          try { await deleteFile(fileUrl); } catch {}
          return res.status(400).json({ message: tr(req, "file.photoFormat") });
        }
        const candidate = await storage.getCandidate(id);
        if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });
        const activeRecord = await storage.getWorkforceByCandidateId(id);
        const isActiveEmployee = activeRecord && activeRecord.isActive;
        const isPhotoChange = isActiveEmployee && candidate.hasPhoto && candidate.photoUrl;

        const qualityResult = await validateFaceQuality(fileUrl);
        photoQualityResult = qualityResult;

        const hasPreviouslyValidatedPhoto = !!(candidate.hasPhoto && candidate.photoUrl);
        const fallbackDecision = decideRekognitionFallbackAction({
          qualityCheckSkipped: !!qualityResult.qualityCheckSkipped,
          hasPreviouslyValidatedPhoto,
        });
        if (fallbackDecision.kind === "block") {
          recordRekognitionFallback(fallbackDecision.telemetry, id);
          try { await deleteFile(fileUrl); } catch {}
          return res.status(503).json({
            message: tr(req, "photo.verifyUnavailable"),
            qualityResult: { passed: false, checks: [{ code: "service_unavailable", name: "Face verification service", passed: false, tipReason: "service_unavailable", tip: "The verification service is currently unreachable. Your photo cannot be processed until the service is available." }], qualityCheckSkipped: true },
          });
        }
        if (fallbackDecision.kind === "allow") {
          recordRekognitionFallback(fallbackDecision.telemetry, id);
          qualityResult.serviceUnavailableNotice = tr(req, "photo.verifySkipped");
        }

        if (!qualityResult.passed && !qualityResult.qualityCheckSkipped) {
          try { await deleteFile(fileUrl); } catch {}
          const { rotatedBuffer: _rb0, ...qualityResultForClient } = qualityResult;
          return res.status(422).json({
            message: tr(req, "photo.qualityFailed"),
            qualityResult: qualityResultForClient,
          });
        }

        // Task #161 — persistence + response-field composition lives in
        // `persistRotationRescue` so it's unit-testable without the
        // route. Behaviour is unchanged: only set `rotationApplied`
        // when the overwrite actually succeeded.
        const rotationOutcome = await persistRotationRescue(
          qualityResult,
          fileUrl,
          id,
          {
            overwriteFile,
            log: (msg) => console.log(msg),
            warn: (msg, err) => console.warn(msg, err),
            // Task #166 — increments the rolling counter exposed by
            // GET /api/admin/telemetry/rotation-rescue.
            recordOutcome: recordRotationRescueOutcome,
          },
        );
        rotationApplied = rotationOutcome.rotationApplied;

        if (isPhotoChange) {
          await supersedePendingPhotoChanges(id);
          const changeRequest = await storage.createPhotoChangeRequest({
            candidateId: id,
            newPhotoUrl: fileUrl,
            previousPhotoUrl: candidate.photoUrl,
            status: "pending",
          });
          await createPhotoChangeInboxItem({
            candidate,
            activeRecord,
            changeRequest,
            fileUrl,
            candidateId: id,
          });
          const { rotatedBuffer: _rb1, ...qualityResultForClient } = qualityResult;
          return res.json({ url: fileUrl, docType, pendingReview: true, changeRequestId: changeRequest.id, qualityResult: qualityResultForClient, rotationApplied, message: tr(req, "photo.submittedForReview") });
        }
      }

      const updatePayload: Record<string, any> = {};
      if (docType === "photo") { updatePayload.photoUrl = fileUrl; updatePayload.hasPhoto = true; }
      if (docType === "nationalId") { updatePayload.hasNationalId = true; updatePayload.nationalIdFileUrl = fileUrl; }
      if (docType === "iban") { updatePayload.hasIban = true; updatePayload.ibanFileUrl = fileUrl; }
      if (docType === "resume") { updatePayload.resumeUrl = fileUrl; updatePayload.hasResume = true; }
      const updated = await storage.updateCandidate(id, updatePayload);
      if (!updated) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      const onboardingRecords = await storage.getOnboardingRecords({ candidateId: id });
      for (const rec of onboardingRecords) {
        if (rec.status === "converted" || rec.status === "rejected" || rec.status === "terminated") continue;
        const isSmpRec = !rec.applicationId;
        const syncPayload: Record<string, any> = {};
        if (docType === "photo") syncPayload.hasPhoto = true;
        if (docType === "nationalId") syncPayload.hasNationalId = true;
        if (docType === "iban") syncPayload.hasIban = true;
        if (Object.keys(syncPayload).length > 0) {
          const merged = { ...rec, ...syncPayload };
          syncPayload.status = computeOnboardingStatus(merged, isSmpRec);
          await storage.updateOnboardingRecord(rec.id, syncPayload);
        }
      }
      const response: Record<string, any> = { url: fileUrl, docType, candidate: updated };
      if (photoQualityResult) {
        const { rotatedBuffer: _rb2, ...qualityResultForClient } = photoQualityResult;
        response.qualityResult = qualityResultForClient;
      }
      if (rotationApplied) response.rotationApplied = rotationApplied;
      return res.json(response);
    } catch (err) {
      return handleError(res, err);
    }
  };
}
