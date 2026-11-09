import type { PluginSettings } from "@getpaseo/plugin/server";
import { readFileSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
import { MAX_IMAGE_BYTES, UPLOAD_CHUNK_BYTES, type BackgroundView, type backgroundSettings } from "../shared/background";

type Settings = PluginSettings<(typeof backgroundSettings)["schema"]>;

export const PLUGIN_ID = "app-wallpaper";
const DEFAULT_IMAGE = "assets/default-3840x3840.jpg";
const MAX_BYTES = MAX_IMAGE_BYTES;
export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
};

export const paseoHome = () => process.env.PASEO_HOME || join(homedir(), ".paseo");

/**
 * Dossier du plugin. Paseo évalue le bundle serveur depuis une chaîne (import.meta.url est vide) :
 * on cherche dans $PASEO_HOME/config.json l'installation dont le manifeste porte notre id. Ainsi,
 * l'image par défaut est trouvée même si le plugin a été installé sous un autre id (--id).
 */
function pluginDir(): string | undefined {
  try {
    const config = JSON.parse(readFileSync(join(paseoHome(), "config.json"), "utf8")) as {
      plugins?: Record<string, { path?: string }>;
    };
    const entries = Object.entries(config.plugins ?? {});
    const direct = config.plugins?.[PLUGIN_ID]?.path;
    if (direct) return direct;
    for (const [, entry] of entries) {
      if (!entry.path) continue;
      try {
        const manifest = JSON.parse(readFileSync(join(entry.path, "paseo-plugin.json"), "utf8")) as { id?: string };
        if (manifest.id === PLUGIN_ID) return entry.path;
      } catch {
        // Installation sans manifeste lisible : on passe à la suivante.
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveImage(setting: string): string | undefined {
  const raw = setting.trim();
  if (!raw) {
    const dir = pluginDir();
    return dir ? join(dir, DEFAULT_IMAGE) : undefined;
  }
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return isAbsolute(raw) ? raw : join(homedir(), raw);
}

/** Fichiers récemment décrits, pour servir leurs morceaux : clé → chemin (quelques entrées). */
const known = new Map<string, string>();

async function describeMedia(path: string): Promise<NonNullable<BackgroundView["media"]>> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error("aw:unsupported_format|" + path);
  const info = await stat(path).catch(() => {
    throw new Error("aw:not_found|" + path);
  });
  if (!info.isFile()) throw new Error("aw:not_a_file|" + path);
  if (info.size > MAX_BYTES) throw new Error("aw:too_large|" + path);
  const key = path + ":" + info.mtimeMs + ":" + info.size;
  known.delete(key);
  known.set(key, path);
  while (known.size > 6) known.delete(known.keys().next().value as string);
  const kind = mime.startsWith("video/") ? "video" : "image";
  return {
    key,
    mime,
    size: info.size,
    kind,
    chunks: Math.max(1, Math.ceil(info.size / UPLOAD_CHUNK_BYTES)),
  };
}

/** Lit un morceau du fichier sur le disque, sans charger le fichier entier en mémoire. */
export async function readMediaChunk({ key, index }: { key: string; index: number }) {
  const path = known.get(key);
  if (!path) throw new Error("aw:not_found|");
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(UPLOAD_CHUNK_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, UPLOAD_CHUNK_BYTES, index * UPLOAD_CHUNK_BYTES);
    return { data: buffer.subarray(0, bytesRead).toString("base64") };
  } finally {
    await handle.close();
  }
}

export async function readBackground(settings: Settings, wantPortrait = false): Promise<BackgroundView> {
  const state = await settings.read();
  if (state.status !== "ready") throw new Error("aw:settings_invalid|");
  const values = state.values;
  const base = {
    enabled: values.enabled,
    fit: values.fit,
    dim: values.dim,
    leftShade: values.leftShade,
    rightShade: values.rightShade,
    bottomShade: values.bottomShade,
    panelShade: values.panelShade,
    focus: values.focus,
    glass: values.glass,
    portrait: false,
    motion: values.motion,
    brightness: values.brightness,
    saturation: values.saturation,
    imageBlur: values.imageBlur,
    focal: values.focal,
    galleryIndex: null as number | null,
    nextChangeAt: null as number | null,
  };
  const portrait = wantPortrait && values.portraitImagePath.trim() !== "";
  base.portrait = portrait;
  let chosen = portrait ? values.portraitImagePath : values.imagePath;
  // Rotation : même image au même moment sur tous les appareils (calculée à partir de l'heure).
  if (!portrait && values.rotation !== "off" && values.gallery.length > 0) {
    const period = Number(values.rotation) * 60_000;
    const slot = Math.floor(Date.now() / period);
    const index = (slot + values.rotationOffset) % values.gallery.length;
    chosen = values.gallery[index];
    base.galleryIndex = index;
    base.nextChangeAt = (slot + 1) * period;
  }
  const path = resolveImage(chosen);
  if (!path) return { ...base, media: null, error: "aw:plugin_dir_missing|" };
  try {
    const media = await describeMedia(path);
    return { ...base, media, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-wallpaper] image unreadable", message);
    return { ...base, media: null, error: message };
  }
}
