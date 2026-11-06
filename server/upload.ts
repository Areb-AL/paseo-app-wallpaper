import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { MAX_IMAGE_BYTES } from "../shared/background";
import { MIME, PLUGIN_ID, paseoHome } from "./background";

/**
 * Reçoit une image choisie dans l'appli et l'enregistre dans le dossier de données du plugin
 * ($PASEO_HOME/plugin-data/app-wallpaper). Un seul envoi à la fois : un nouveau début annule le précédent.
 */
let pending: { ext: string; size: number; received: number; chunks: Uint8Array[]; prefix: string } | undefined;

export const dataDir = () => join(paseoHome(), "plugin-data", PLUGIN_ID);

export function startUpload({ name, size, slot }: { name: string; size: number; slot: "landscape" | "portrait" }) {
  const ext = extname(name).toLowerCase();
  if (!MIME[ext]) throw new Error("aw:unsupported_format|" + name);
  if (size > MAX_IMAGE_BYTES) throw new Error("aw:too_large|" + name);
  pending = { ext: ext === ".jpeg" ? ".jpg" : ext, size, received: 0, chunks: [], prefix: slot === "portrait" ? "portrait-" : "wallpaper-" };
  return { ok: true };
}

export function addChunk({ data }: { data: string }) {
  if (!pending) throw new Error("aw:no_upload|");
  const bytes = Buffer.from(data, "base64");
  pending.received += bytes.byteLength;
  if (pending.received > pending.size) {
    pending = undefined;
    throw new Error("aw:upload_mismatch|");
  }
  pending.chunks.push(bytes);
  return { received: pending.received };
}

export async function finishUpload() {
  const upload = pending;
  pending = undefined;
  if (!upload) throw new Error("aw:no_upload|");
  if (upload.received !== upload.size) throw new Error("aw:upload_incomplete|");
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  // On ne garde que la dernière image envoyée de chaque sorte (principale, écran vertical).
  for (const entry of await readdir(dir)) {
    if (entry.startsWith(upload.prefix)) await rm(join(dir, entry), { force: true });
  }
  const path = join(dir, `${upload.prefix}${Date.now()}${upload.ext}`);
  await writeFile(path, Buffer.concat(upload.chunks));
  return { path };
}
