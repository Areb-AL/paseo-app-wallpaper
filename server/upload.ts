import { appendFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { MAX_IMAGE_BYTES } from "../shared/background";
import { MIME, PLUGIN_ID, paseoHome } from "./background";

/**
 * Reçoit une image ou une vidéo choisie dans l'appli et l'enregistre dans le dossier de données du plugin
 * ($PASEO_HOME/plugin-data/app-wallpaper). Les morceaux sont écrits au fur et à mesure dans un fichier
 * temporaire (pas de fichier entier en mémoire). Un seul envoi à la fois : un nouveau début annule le précédent.
 */
let pending: { ext: string; size: number; received: number; prefix: string; temp: string } | undefined;

export const dataDir = () => join(paseoHome(), "plugin-data", PLUGIN_ID);

export async function startUpload({ name, size, slot }: { name: string; size: number; slot: "landscape" | "portrait" | "gallery" }) {
  const ext = extname(name).toLowerCase();
  if (!MIME[ext]) throw new Error("aw:unsupported_format|" + name);
  if (size > MAX_IMAGE_BYTES) throw new Error("aw:too_large|" + name);
  if (pending) await rm(pending.temp, { force: true });
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.upload-${Date.now()}.part`);
  await writeFile(temp, new Uint8Array(0));
  pending = {
    ext: ext === ".jpeg" ? ".jpg" : ext,
    size,
    received: 0,
    prefix: slot === "portrait" ? "portrait-" : slot === "gallery" ? "gallery-" : "wallpaper-",
    temp,
  };
  return { ok: true };
}

export async function addChunk({ data }: { data: string }) {
  if (!pending) throw new Error("aw:no_upload|");
  const bytes = Buffer.from(data, "base64");
  pending.received += bytes.byteLength;
  if (pending.received > pending.size) {
    await rm(pending.temp, { force: true });
    pending = undefined;
    throw new Error("aw:upload_mismatch|");
  }
  await appendFile(pending.temp, bytes);
  return { received: pending.received };
}

export async function finishUpload() {
  const upload = pending;
  pending = undefined;
  if (!upload) throw new Error("aw:no_upload|");
  if (upload.received !== upload.size) {
    await rm(upload.temp, { force: true });
    throw new Error("aw:upload_incomplete|");
  }
  const dir = dataDir();
  // On ne garde que le dernier fichier principal et le dernier fichier vertical ;
  // ceux de la galerie s'accumulent jusqu'à ce qu'on les retire.
  if (upload.prefix !== "gallery-") {
    for (const entry of await readdir(dir)) {
      if (entry.startsWith(upload.prefix)) await rm(join(dir, entry), { force: true });
    }
  }
  const path = join(dir, `${upload.prefix}${Date.now()}${upload.ext}`);
  await rename(upload.temp, path);
  return { path };
}

/** Supprime un fichier de la galerie, seulement s'il est dans notre dossier et a été envoyé par nous. */
export async function removeGalleryFile({ path }: { path: string }) {
  const dir = dataDir();
  const name = basename(path);
  if (dirname(path) !== dir || !name.startsWith("gallery-")) return { deleted: false };
  await rm(path, { force: true });
  return { deleted: true };
}
