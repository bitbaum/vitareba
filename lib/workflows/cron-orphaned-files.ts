import { db } from "@/lib/db";
import { listLocal, delLocal, isLocalUrl } from "@/lib/storage";

export type CronOrphanedFilesResult =
  | { success: true; deleted: number; kept: number }
  | { success: false; error: "Database unavailable" };

/**
 * Delete stored files that no document row points at.
 *
 * Erasing a patient removes their document ROWS through the database cascade,
 * and a cascade cannot call application code — so the bytes stayed on disk
 * forever. A record deleted while the medical file it names survives is not
 * erasure (GDPR Art. 17), it is bookkeeping. This reconciler is the only thing
 * that can close that gap, because it is the only part that runs after the
 * database has already decided what no longer exists.
 *
 * Direction matters: it deletes files with no row, never rows with no file.
 * A row whose file is missing is a restore artefact and is handled at read
 * time (410); deleting the row would destroy the patient's history instead.
 */
export async function runCronOrphanedFiles(): Promise<CronOrphanedFilesResult> {
  let referenced: Set<string>;
  try {
    const rows = await db.query.documents.findMany({ columns: { fileUrl: true } });
    referenced = new Set(rows.map((r) => r.fileUrl).filter(isLocalUrl));
  } catch (err) {
    // Never delete on a failed read: an unreachable database is not evidence
    // that every file is unreferenced. Failing closed here is the difference
    // between a no-op and wiping every patient document on the box.
    console.error("[cron/orphaned-files] document read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  const stored = await listLocal();
  const orphans = stored.filter((url) => !referenced.has(url));

  let deleted = 0;
  for (const url of orphans) {
    try {
      await delLocal(url);
      deleted++;
    } catch (err) {
      console.error(`[cron/orphaned-files] could not delete ${url}:`, err);
    }
  }

  if (deleted > 0) {
    console.log(`[cron/orphaned-files] deleted ${deleted} orphaned file(s)`);
  }
  return { success: true, deleted, kept: stored.length - deleted };
}
