// Payment-proofs Storage backup — PRODUCTION_READINESS_RECONCILIATION.md §10.7.
// No pg_dump/pg_restore equivalent exists for Supabase Storage objects, so
// this is the separate procedure that section calls for: list every object
// in the `payment-proofs` bucket, download it into a dated local folder
// (mirroring the existing pg_dump naming convention), and verify the
// downloaded count matches the bucket's actual object count.
//
// Deliberately does NOT read from .env.local — that file's Supabase vars
// point at staging, and this script must only ever run against the project
// you explicitly target. Pass the target's URL and service-role key as
// one-off environment variables on the command itself so neither ever
// touches a file in this repo:
//
//   SUPABASE_URL="https://<ref>.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="<service-role key, Production dashboard>" \
//   npx tsx scripts/backupPaymentProofsStorage.ts
//
// Output: ./payment-proofs-backup-YYYYMMDD/ (same directory naming pattern
// as ~/ordift-backups/ordift-production-YYYYMMDD-HHMMSS.dump), plus a
// summary line to append to backup-log.txt per DISASTER_RECOVERY.md §2.4.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUCKET = "payment-proofs";

type StorageObject = { path: string; name: string };

async function listAllObjects(supabase: SupabaseClient, prefix = ""): Promise<StorageObject[]> {
  const results: StorageObject[] = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`list("${prefix}") failed: ${error.message}`);

  for (const entry of data ?? []) {
    // A Storage "folder" is a synthetic entry with no id/metadata — recurse into it.
    const isFolder = entry.id === null;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isFolder) {
      results.push(...(await listAllObjects(supabase, path)));
    } else {
      results.push({ path, name: entry.name });
    }
  }
  return results;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backupPaymentProofsStorage.ts",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Listing all objects in "${BUCKET}"...`);
  const objects = await listAllObjects(supabase);
  console.log(`Found ${objects.length} object(s).`);

  if (objects.length === 0) {
    console.log("Nothing to back up — bucket is empty. No folder created.");
    return;
  }

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outDir = join(process.cwd(), `payment-proofs-backup-${dateStamp}`);
  await mkdir(outDir, { recursive: true });

  let downloaded = 0;
  for (const obj of objects) {
    const { data, error } = await supabase.storage.from(BUCKET).download(obj.path);
    if (error || !data) {
      console.error(`  ✗ failed to download ${obj.path}: ${error?.message}`);
      continue;
    }
    const destPath = join(outDir, obj.path.replace(/\//g, "__"));
    await writeFile(destPath, Buffer.from(await data.arrayBuffer()));
    downloaded += 1;
    console.log(`  ✓ ${obj.path}`);
  }

  console.log(`\nDownloaded ${downloaded}/${objects.length} object(s) into ${outDir}`);
  if (downloaded !== objects.length) {
    console.error("Count mismatch — do not consider this backup complete. Re-run or investigate the failures above.");
    process.exit(1);
  }

  const logLine = `${new Date().toISOString().slice(0, 16).replace("T", " ")} | payment-proofs-backup-${dateStamp}/ | ${downloaded} object(s) | download count matched bucket listing`;
  console.log(`\nVerified. Append this line to backup-log.txt:\n${logLine}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
