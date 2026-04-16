export interface FaceQualityCheck {
  name: string;
  passed: boolean;
  tip?: string;
}

export interface FaceQualityResult {
  passed: boolean;
  checks: FaceQualityCheck[];
  qualityCheckSkipped?: boolean;
}

export async function validateFaceQuality(photoPath: string): Promise<FaceQualityResult> {
  const awsRegion = process.env.AWS_REGION ?? "me-south-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKey || !secretKey) {
    console.warn("[Rekognition] AWS credentials not configured — skipping face quality check");
    return { passed: true, checks: [], qualityCheckSkipped: true };
  }

  try {
    const { RekognitionClient, DetectFacesCommand } = await import("@aws-sdk/client-rekognition");
    const { getFileBuffer } = await import("./file-storage");

    const imageBytes = await getFileBuffer(photoPath);

    const client = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const command = new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ["ALL"],
    });

    let response;
    try {
      response = await client.send(command, { abortSignal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const faces = response.FaceDetails ?? [];
    console.log("[Rekognition] DetectFaces returned", faces.length, "face(s)");

    const checks: FaceQualityCheck[] = [];

    checks.push({
      name: "Face detected",
      passed: faces.length >= 1,
      tip: faces.length === 0 ? "No face found. Make sure your face is clearly visible in the photo." : undefined,
    });

    checks.push({
      name: "Single face",
      passed: faces.length === 1,
      tip: faces.length > 1 ? "Multiple faces detected. Use a photo with only your face." : faces.length === 0 ? "No face detected." : undefined,
    });

    if (faces.length === 1) {
      const face = faces[0];
      const faceConf = face.Confidence ?? 0;
      checks.push({
        name: "Face confidence",
        passed: faceConf >= 90,
        tip: faceConf < 90 ? "Face is not clearly recognisable. Use a well-lit photo showing your full face." : undefined,
      });

      const box = face.BoundingBox;
      const boxArea = (box?.Width ?? 0) * (box?.Height ?? 0);
      checks.push({
        name: "Face size sufficient",
        passed: boxArea >= 0.04,
        tip: boxArea < 0.04 ? "Face is too small. Move closer to the camera or crop tighter." : undefined,
      });

      const yaw = Math.abs(face.Pose?.Yaw ?? 0);
      const pitch = Math.abs(face.Pose?.Pitch ?? 0);
      checks.push({
        name: "Face facing forward",
        passed: yaw <= 30 && pitch <= 25,
        tip: yaw > 30 || pitch > 25 ? "Face the camera directly. Avoid turning or tilting your head." : undefined,
      });

      const landmarks = face.Landmarks ?? [];
      const nose = landmarks.find(l => l.Type === "nose");
      const mouthLeft = landmarks.find(l => l.Type === "mouthLeft");
      const mouthRight = landmarks.find(l => l.Type === "mouthRight");
      const boxBottom = (box?.Top ?? 0) + (box?.Height ?? 0);
      const noseInBox = nose && box ? (nose.Y! <= boxBottom + 0.02) : false;
      const mouthInBox = mouthLeft && mouthRight && box
        ? (mouthLeft.Y! <= boxBottom + 0.05 && mouthRight.Y! <= boxBottom + 0.05)
        : false;
      checks.push({
        name: "Full face visible",
        passed: noseInBox && mouthInBox,
        tip: !(noseInBox && mouthInBox) ? "Your entire face must be visible — forehead to chin. Do not crop or cut off any part." : undefined,
      });

      const sharpness = face.Quality?.Sharpness ?? 0;
      checks.push({
        name: "Sharpness acceptable",
        passed: sharpness >= 40,
        tip: sharpness < 40 ? "Photo is too blurry. Hold steady and ensure good focus." : undefined,
      });

      const brightness = face.Quality?.Brightness ?? 0;
      checks.push({
        name: "Brightness acceptable",
        passed: brightness >= 30,
        tip: brightness < 30 ? "Photo is too dark. Retake in better lighting." : undefined,
      });

      const eyesOpen = face.EyesOpen?.Value ?? false;
      const eyesConf = face.EyesOpen?.Confidence ?? 0;
      checks.push({
        name: "Eyes visible",
        passed: eyesOpen && eyesConf >= 70,
        tip: !eyesOpen || eyesConf < 70 ? "Eyes should be clearly open and visible. Remove sunglasses if worn." : undefined,
      });
    } else {
      checks.push({ name: "Face confidence", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Face size sufficient", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Face facing forward", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Full face visible", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Sharpness acceptable", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Brightness acceptable", passed: false, tip: "Cannot evaluate — no single face detected." });
      checks.push({ name: "Eyes visible", passed: false, tip: "Cannot evaluate — no single face detected." });
    }

    const allPassed = checks.every(c => c.passed);
    return { passed: allPassed, checks };
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    const errName = err?.name ?? "";
    const httpCode = err?.$metadata?.httpStatusCode;

    const isTimeout = errMsg.includes("aborted") || errMsg.includes("AbortError") || errName === "AbortError";
    const isServiceError = httpCode >= 500 || errName === "ThrottlingException" || errName === "ProvisionedThroughputExceededException" || errMsg.includes("ECONNREFUSED") || errMsg.includes("ENOTFOUND") || errMsg.includes("ETIMEDOUT") || errMsg.includes("NetworkingError");

    if (isTimeout || isServiceError) {
      console.warn(`[Rekognition] DetectFaces unavailable (${isTimeout ? "timeout" : errName || errMsg}) — allowing photo through`);
      return { passed: true, checks: [], qualityCheckSkipped: true };
    }

    console.error("[Rekognition] DetectFaces FAILED (non-transient) —", errMsg);
    return {
      passed: false,
      checks: [{
        name: "Photo validation",
        passed: false,
        tip: "Could not validate photo. Please ensure the file is a valid image (JPG or PNG).",
      }],
    };
  }
}

export interface FaceCompareResult {
  confidence: number;
  matched: boolean;
  error?: string;
}

export async function compareFaces(
  sourcePhotoUrl: string,
  targetPhotoUrl: string
): Promise<FaceCompareResult> {
  if (!sourcePhotoUrl || !targetPhotoUrl) {
    return { confidence: 0, matched: false, error: "missing_photo" };
  }

  const awsRegion = process.env.AWS_REGION ?? "me-south-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKey || !secretKey) {
    console.warn("[Rekognition] AWS credentials not configured — flagging for manual review");
    return {
      confidence: 0,
      matched: false,
      error: "rekognition_unavailable",
    };
  }

  try {
    const { RekognitionClient, CompareFacesCommand } = await import("@aws-sdk/client-rekognition");
    const { getFileBuffer } = await import("./file-storage");

    const client = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const [sourceBytes, targetBytes] = await Promise.all([
      getFileBuffer(sourcePhotoUrl),
      getFileBuffer(targetPhotoUrl),
    ]);

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: 70,
    });

    console.log("[Rekognition] Sending CompareFaces request to", awsRegion, "source size:", sourceBytes.length, "target size:", targetBytes.length);
    const response = await client.send(command);
    console.log("[Rekognition] Response received — FaceMatches:", response.FaceMatches?.length ?? 0, "UnmatchedFaces:", response.UnmatchedFaces?.length ?? 0);
    const topMatch = response.FaceMatches?.[0];
    const confidence = topMatch?.Similarity ?? 0;
    console.log("[Rekognition] Top match confidence:", confidence);

    return {
      confidence: Math.round(confidence * 100) / 100,
      matched: confidence >= 95,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "rekognition_error";
    const errName = err instanceof Error ? err.constructor.name : "Unknown";
    console.error("[Rekognition] CompareFaces FAILED —", errName, ":", errMsg);
    if (err instanceof Error && 'Code' in err) console.error("[Rekognition] AWS Error Code:", (err as any).Code);
    return {
      confidence: 0,
      matched: false,
      error: errMsg,
    };
  }
}
