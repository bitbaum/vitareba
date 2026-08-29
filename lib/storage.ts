import { mkdir, writeFile, unlink, readFile, readdir } from "fs/promises";
import path from "path";

// Local-disk file storage (replaces @vercel/blob on the self-hosted box).
// Files land in UPLOADS_DIR and are read back through an AUTHENTICATED route
// (/api/documents/[id]/file) — nothing serves this directory to the public.
// The stored URL stays root-relative so it survives a domain change.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

function safeKey(key: string): string {
  const clean = path.posix
    .normalize(key)
    .replace(/^(\.\.\/?)+/, "")
    .replace(/^\/+/, "");
  if (clean.includes("..")) throw new Error("invalid storage key");
  return clean;
}

export async function putLocal(key: string, file: File | Buffer): Promise<{ url: string }> {
  const k = safeKey(key);
  const dest = path.join(UPLOADS_DIR, k);
  await mkdir(path.dirname(dest), { recursive: true });
  const data = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
  await writeFile(dest, data);
  return { url: `/uploads/${k}` };
}

/** Marker for a locally-stored file. Documents may also carry an external URL
 *  (an admin can attach a link), which is not ours to read off disk. */
export const LOCAL_URL_PREFIX = "/uploads/";

export function isLocalUrl(url: string): boolean {
  return url.startsWith(LOCAL_URL_PREFIX);
}

/**
 * Read a stored file back. `url` is the value held in documents.fileUrl.
 * safeKey() is what stops a crafted key from escaping UPLOADS_DIR — the
 * caller has already proven the requester may see this document, but the
 * path itself still comes from the database and is treated as untrusted.
 */
export async function readLocal(url: string): Promise<Buffer> {
  if (!isLocalUrl(url)) throw new Error("not a local storage url");
  const k = safeKey(url.slice(LOCAL_URL_PREFIX.length));
  return readFile(path.join(UPLOADS_DIR, k));
}

/**
 * Every file currently stored, as `/uploads/<key>` URLs — the same shape held
 * in documents.fileUrl, so the two sides can be compared directly.
 * Returns [] when the directory does not exist yet (nothing uploaded).
 */
export async function listLocal(): Promise<string[]> {
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      }),
    );
    return nested.flat();
  };

  try {
    const files = await walk(UPLOADS_DIR);
    return files.map((f) => `${LOCAL_URL_PREFIX}${path.relative(UPLOADS_DIR, f)}`);
  } catch {
    return [];
  }
}

export async function delLocal(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const k = safeKey(url.slice("/uploads/".length));
  await unlink(path.join(UPLOADS_DIR, k)).catch(() => {});
}
