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
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const { resolve } = path;

    const client = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    async function loadImageBytes(url: string): Promise<Uint8Array> {
      if (!url.startsWith("/uploads/")) {
        throw new Error("Only /uploads/ paths are allowed for face comparison");
      }
      const filename = path.basename(url);
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
      const ext = path.extname(filename).toLowerCase();
      if (!allowedExts.includes(ext)) {
        throw new Error(`Unsupported image extension: ${ext}`);
      }
      const safePath = resolve("uploads", filename);
      if (!safePath.startsWith(resolve("uploads"))) {
        throw new Error("Path traversal detected");
      }
      return readFileSync(safePath);
    }

    const [sourceBytes, targetBytes] = await Promise.all([
      loadImageBytes(sourcePhotoUrl),
      loadImageBytes(targetPhotoUrl),
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
