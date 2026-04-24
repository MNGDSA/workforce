import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

const spacesEndpoint = process.env.SPACES_ENDPOINT || "";
const spacesBucket = process.env.SPACES_BUCKET || "";
const spacesKey = process.env.SPACES_KEY || "";
const spacesSecret = process.env.SPACES_SECRET || "";
const spacesRegion = process.env.SPACES_REGION || "nyc3";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!spacesEndpoint || !spacesKey || !spacesSecret || !spacesBucket) {
      throw new Error("DO Spaces environment variables (SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET) are required in production");
    }
    s3Client = new S3Client({
      endpoint: `https://${spacesEndpoint}`,
      region: spacesRegion,
      credentials: {
        accessKeyId: spacesKey,
        secretAccessKey: spacesSecret,
      },
      forcePathStyle: false,
    });
  }
  return s3Client;
}

export async function uploadFile(
  localFilePath: string,
  filename: string,
  contentType?: string,
  opts: { isPublic?: boolean } = {},
): Promise<string> {
  if (!isProduction) {
    return `/uploads/${filename}`;
  }

  const client = getS3Client();
  const key = `uploads/${filename}`;

  try {
    const fileContent = fs.readFileSync(localFilePath);
    await client.send(new PutObjectCommand({
      Bucket: spacesBucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType || "application/octet-stream",
      ACL: opts.isPublic ? "public-read" : "private",
      // Photos are immutable per upload (filenames are random); use a
      // private cache so the OkHttp / Coil disk cache on the worker's device
      // can revalidate after 24h without intermediaries sharing the bytes.
      CacheControl: opts.isPublic
        ? "private, max-age=86400, must-revalidate"
        : "private, max-age=300",
    }));
    return `https://${spacesBucket}.${spacesEndpoint}/${key}`;
  } finally {
    try { fs.unlinkSync(localFilePath); } catch {}
  }
}

// Task #156 — parse an S3-style storage URL back into the object
// key we wrote at upload time. This is exported so the rotation
// rescue (and any other in-place writer) can fail loudly at the
// first deploy where the URL format drifts (CDN swap, custom
// domain, signed URLs, …) instead of silently dropping the write
// and leaving the candidate's photo sideways. The contract is:
// either return a non-empty key, or throw a descriptive error —
// never return `undefined` / empty string.
export function extractStorageKeyFromUrl(fileUrl: string): string {
  if (!spacesEndpoint) {
    throw new Error(
      `Cannot extract storage key from URL "${fileUrl}": SPACES_ENDPOINT is not configured`,
    );
  }
  const marker = `${spacesEndpoint}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) {
    throw new Error(
      `Cannot extract storage key from URL "${fileUrl}": expected endpoint "${spacesEndpoint}" to appear in the URL`,
    );
  }
  const rawKey = fileUrl.slice(idx + marker.length);
  const key = rawKey.split("?")[0].split("#")[0];
  if (!key) {
    throw new Error(
      `Cannot extract storage key from URL "${fileUrl}": URL contains the endpoint but no object key`,
    );
  }
  return key;
}

// Task #153 — overwrite the bytes at an existing storage URL in
// place, preserving the same key/path so URLs already handed out
// (e.g. a candidate's photoUrl) continue to resolve. Used by the
// rotation rescue to replace a sideways upload with the
// auto-corrected version. Photos are public by default; we keep
// the same ACL and cache-control we use in `uploadFile`.
//
// Task #156 — refuse to silently no-op when the URL doesn't match
// the expected `<bucket>.<endpoint>/<key>` shape. If the production
// URL format ever drifts, the rotation rescue would otherwise run,
// log success, and leave the bad bytes in place. We throw a loud,
// descriptive error so the first occurrence surfaces in logs.
export async function overwriteFile(
  fileUrl: string,
  bytes: Buffer,
  contentType: string,
  opts: { isPublic?: boolean } = { isPublic: true },
): Promise<void> {
  if (!isProduction || fileUrl.startsWith("/uploads/")) {
    const localPath = fileUrl.startsWith("/uploads/")
      ? path.join(path.resolve("uploads"), path.basename(fileUrl))
      : fileUrl;
    fs.writeFileSync(localPath, bytes);
    return;
  }

  const key = extractStorageKeyFromUrl(fileUrl);
  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: spacesBucket,
    Key: key,
    Body: bytes,
    ContentType: contentType,
    ACL: opts.isPublic ? "public-read" : "private",
    CacheControl: opts.isPublic
      ? "private, max-age=86400, must-revalidate"
      : "private, max-age=300",
  }));
}

export async function deleteFile(fileUrl: string): Promise<void> {
  if (!isProduction) {
    if (fileUrl.startsWith("/uploads/")) {
      const localPath = path.join(path.resolve("uploads"), path.basename(fileUrl));
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
    return;
  }

  if (fileUrl.includes(spacesEndpoint)) {
    const key = fileUrl.split(`${spacesEndpoint}/`)[1];
    if (key) {
      const client = getS3Client();
      await client.send(new DeleteObjectCommand({
        Bucket: spacesBucket,
        Key: key,
      }));
    }
  }
}

export async function getFileBuffer(fileUrl: string): Promise<Buffer> {
  if (!isProduction || fileUrl.startsWith("/uploads/")) {
    const localPath = fileUrl.startsWith("/uploads/")
      ? path.join(path.resolve("uploads"), path.basename(fileUrl))
      : fileUrl;
    return fs.readFileSync(localPath);
  }

  if (fileUrl.includes(spacesEndpoint)) {
    const key = fileUrl.split(`${spacesEndpoint}/`)[1];
    if (key) {
      const client = getS3Client();
      const resp = await client.send(new GetObjectCommand({
        Bucket: spacesBucket,
        Key: key,
      }));
      const chunks: Buffer[] = [];
      for await (const chunk of resp.Body as any) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
  }

  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`Failed to fetch file: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

export function getPublicUrl(storedUrl: string): string {
  return storedUrl;
}

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
  };
  return mimeMap[ext] || "application/octet-stream";
}
