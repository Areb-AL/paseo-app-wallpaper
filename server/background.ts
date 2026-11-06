import type { PluginSettings } from "@getpaseo/plugin/server";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
import { MAX_IMAGE_BYTES, type BackgroundView, type backgroundSettings } from "../shared/background";

type Settings = PluginSettings<(typeof backgroundSettings)["schema"]>;

export const PLUGIN_ID = "app-wallpaper";
const DEFAULT_IMAGE = "assets/default-5120x1440.jpg";
const MAX_BYTES = MAX_IMAGE_BYTES;
export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
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

// Deux entrées au plus : l'image principale et celle pour écran vertical.
const cache = new Map<string, { key: string; dataUrl: string }>();

async function loadImage(path: string): Promise<{ key: string; dataUrl: string }> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error("aw:unsupported_format|" + path);
  const info = await stat(path).catch(() => {
    throw new Error("aw:not_found|" + path);
  });
  if (!info.isFile()) throw new Error("aw:not_a_file|" + path);
  if (info.size > MAX_BYTES) throw new Error("aw:too_large|" + path);
  const key = path + ":" + info.mtimeMs + ":" + info.size;
  const hit = cache.get(key);
  if (hit) return hit;
  const bytes = await readFile(path);
  const entry = { key, dataUrl: "data:" + mime + ";base64," + bytes.toString("base64") };
  if (cache.size >= 2) cache.delete(cache.keys().next().value as string);
  cache.set(key, entry);
  return entry;
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
  };
  const portrait = wantPortrait && values.portraitImagePath.trim() !== "";
  base.portrait = portrait;
  const path = resolveImage(portrait ? values.portraitImagePath : values.imagePath);
  if (!path) return { ...base, dataUrl: null, imageKey: "", error: "aw:plugin_dir_missing|" };
  try {
    const image = await loadImage(path);
    return { ...base, dataUrl: image.dataUrl, imageKey: image.key, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-wallpaper] image unreadable", message);
    return { ...base, dataUrl: null, imageKey: "", error: message };
  }
}
