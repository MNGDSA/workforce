import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
    if (!spacesEndpoint || !spacesKey || !spacesSecret) {
      throw new Error("DO Spaces environment variables (SPACES_ENDPOINT, SPACES_KEY, SPACES_SECRET) are required in production");
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

export async function uploadFile(localFilePath: string, filename: string, contentType?: string): Promise<string> {
  if (!isProduction) {
    return `/uploads/${filename}`;
  }

  const client = getS3Client();
  const fileContent = fs.readFileSync(localFilePath);
  const key = `uploads/${filename}`;

  await client.send(new PutObjectCommand({
    Bucket: spacesBucket,
    Key: key,
    Body: fileContent,
    ContentType: contentType || "application/octet-stream",
    ACL: "public-read",
  }));

  fs.unlinkSync(localFilePath);

  return `https://${spacesBucket}.${spacesEndpoint}/${key}`;
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
