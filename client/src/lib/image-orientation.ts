// Normalize an uploaded image so its pixels are already in the
// orientation the user sees, with any EXIF orientation tag baked in.
//
// Why this exists: phones (especially iOS) save portrait photos as
// landscape JPEGs plus an EXIF Orientation tag (e.g. 6 = "rotate 90°
// CW on display"). The HTML <img> tag renders that correctly, but
// the canvas crop helper in candidate-portal draws from the raw
// pixel buffer, so the cropped output ends up sideways even though
// the user saw it upright. Calling `createImageBitmap` with
// `imageOrientation: "from-image"` is the modern, dependency-free
// way to ask the browser to bake the EXIF rotation into the
// returned bitmap; we then redraw it to a fresh JPEG with the EXIF
// metadata stripped, so every downstream consumer (the cropper,
// the server, AWS Rekognition) sees an upright photo.
//
// Falls open: if the browser doesn't expose `createImageBitmap`
// (very old browsers), or if anything in the rotation pipeline
// throws, we return the original `File` unchanged so we never block
// an upload because of an EXIF normaliser bug.

const ORIENTED_FROM_EXIF = "image-oriented-from-exif";

export async function normalizePhotoOrientation(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;
  if (typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[image-orientation] normalize failed, using original file", err);
    }
    return file;
  }
}

// Exported for tests so they can assert that an unsupported
// browser path leaves the file untouched without having to fake
// `createImageBitmap` / `HTMLCanvasElement`.
export function _isSupported(): boolean {
  return typeof createImageBitmap === "function" && typeof document !== "undefined";
}

export const _ORIENTED_TAG = ORIENTED_FROM_EXIF;
