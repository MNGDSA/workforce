#!/usr/bin/env tsx
// Task #198 follow-up — backfill helper for the ID-card-template
// background-image private-file bug. Before the forward fix in
// `server/routes.ts` POST /api/id-card-templates/:id/background, the
// route uploaded the file to DigitalOcean Spaces with the default
// "private" ACL, so the browser received 403 on every reload of the
// designer / print preview. The forward fix now passes
// `{ isPublic: true }`, but every background uploaded before the fix
// is still private at rest, so admins still see "the background didn't
// survive saving" on existing templates.
//
// This script flips the ACL on existing
// `id_card_templates.background_image_url` objects from "private" to
// "public-read" using `PutObjectAclCommand`. It does NOT re-upload the
// bytes — only the ACL is modified, so the existing URLs remain valid
// and no DB update is needed.
//
// Usage:
//   tsx scripts/backfill-public-id-card-backgrounds.ts            # dry-run (default)
//   tsx scripts/backfill-public-id-card-backgrounds.ts --apply    # apply changes
//
// Requires the same DO Spaces env vars as the running server:
//   SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET,
//   SPACES_REGION (optional, defaults to "nyc3").
//
// In dev (no `NODE_ENV=production`) all background URLs look like
// `/uploads/<filename>` and live on local disk — there is nothing to
// flip and the script exits with a no-op message.

import { S3Client, PutObjectAclCommand } from "@aws-sdk/client-s3";
import { db } from "../server/db";
import { idCardTemplates } from "../shared/schema";
import { isNotNull } from "drizzle-orm";
import { extractStorageKeyFromUrl } from "../server/file-storage";

const apply = process.argv.includes("--apply");

async function main() {
  const spacesEndpoint = process.env.SPACES_ENDPOINT || "";
  const spacesBucket = process.env.SPACES_BUCKET || "";
  const spacesKey = process.env.SPACES_KEY || "";
  const spacesSecret = process.env.SPACES_SECRET || "";
  const spacesRegion = process.env.SPACES_REGION || "nyc3";

  const rows = await db
    .select({
      id: idCardTemplates.id,
      name: idCardTemplates.name,
      backgroundImageUrl: idCardTemplates.backgroundImageUrl,
    })
    .from(idCardTemplates)
    .where(isNotNull(idCardTemplates.backgroundImageUrl));

  if (rows.length === 0) {
    console.log("No ID card templates with a backgroundImageUrl found. Nothing to do.");
    return;
  }

  const remoteRows = rows.filter(
    (r) => r.backgroundImageUrl && !r.backgroundImageUrl.startsWith("/uploads/"),
  );
  const localRows = rows.filter(
    (r) => r.backgroundImageUrl && r.backgroundImageUrl.startsWith("/uploads/"),
  );

  console.log(`Found ${rows.length} ID card template(s) with a backgroundImageUrl:`);
  console.log(`  - ${remoteRows.length} on remote object storage (eligible for ACL flip)`);
  console.log(`  - ${localRows.length} on local /uploads (no-op, dev only)`);

  if (remoteRows.length === 0) {
    console.log("Nothing to flip on remote storage. Exiting.");
    return;
  }

  // Credentials are only required when --apply is set. Dry-run is a pure
  // database audit (lists which keys would be flipped) so it should be
  // runnable from a workstation without Spaces creds in scope.
  let client: S3Client | null = null;
  if (apply) {
    if (!spacesEndpoint || !spacesBucket || !spacesKey || !spacesSecret) {
      console.error(
        "ERROR: SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET must be set to flip ACLs on remote storage with --apply.",
      );
      process.exit(1);
    }
    client = new S3Client({
      endpoint: `https://${spacesEndpoint}`,
      region: spacesRegion,
      credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
      forcePathStyle: false,
    });
  } else if (!spacesEndpoint) {
    console.warn(
      "WARN: SPACES_ENDPOINT is not set — `extractStorageKeyFromUrl` will fail on every row. Set SPACES_ENDPOINT (creds NOT required for dry-run) to audit which keys would be flipped.",
    );
  }

  let ok = 0;
  let failed = 0;
  for (const row of remoteRows) {
    let key: string;
    try {
      key = extractStorageKeyFromUrl(row.backgroundImageUrl!);
    } catch (err: any) {
      console.error(`  [skip] template ${row.id} (${row.name}): ${err.message}`);
      failed++;
      continue;
    }

    if (!apply) {
      console.log(`  [dry-run] would flip ACL → public-read: ${key} (template ${row.id} "${row.name}")`);
      ok++;
      continue;
    }

    try {
      await client!.send(
        new PutObjectAclCommand({
          Bucket: spacesBucket,
          Key: key,
          ACL: "public-read",
        }),
      );
      console.log(`  [ok] flipped ACL → public-read: ${key} (template ${row.id} "${row.name}")`);
      ok++;
    } catch (err: any) {
      console.error(`  [fail] ${key} (template ${row.id} "${row.name}"): ${err.message}`);
      failed++;
    }
  }

  console.log("");
  console.log(`Done. ${ok} succeeded, ${failed} failed.`);
  if (!apply) {
    console.log("This was a dry-run. Re-run with --apply to actually flip the ACLs.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
