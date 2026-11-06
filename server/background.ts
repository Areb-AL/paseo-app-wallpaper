import type { PluginSettings } from "@getpaseo/plugin/server";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
import type { BackgroundView, backgroundSettings } from "../shared/background";

type Settings = PluginSettings<(typeof backgroundSettings)["schema"]>;

const PLUGIN_ID = "app-wallpaper";
const DEFAULT_IMAGE = "assets/default-5120x1440.jpg";
const MAX_BYTES = 20 * 1024 * 1024;
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const paseoHome = () => process.env.PASEO_HOME || join(homedir(), ".paseo");

/**
 * Dossier du plugin. Paseo évalue le bundle serveur depuis une chaîne (import.meta.url est vide) :
 * on lit donc le chemin que Paseo a noté pour ce plugin dans $PASEO_HOME/config.json.
 */
function pluginDir(): string | undefined {
  try {
    const config = JSON.parse(readFileSync(join(paseoHome(), "config.json"), "utf8")) as {
      plugins?: Record<string, { path?: string }>;
    };
    return config.plugins?.[PLUGIN_ID]?.path;
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

let cache: { key: string; dataUrl: string } | undefined;

async function loadImage(path: string): Promise<{ key: string; dataUrl: string }> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error("Format non pris en charge (jpg, png, gif ou webp) : " + path);
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Ce n'est pas un fichier : " + path);
  if (info.size > MAX_BYTES) throw new Error("Image trop lourde (20 Mo maximum) : " + path);
  const key = path + ":" + info.mtimeMs + ":" + info.size;
  if (cache?.key === key) return cache;
  const bytes = await readFile(path);
  cache = { key, dataUrl: "data:" + mime + ";base64," + bytes.toString("base64") };
  return cache;
}

export async function readBackground(settings: Settings): Promise<BackgroundView> {
  const state = await settings.read();
  if (state.status !== "ready") throw new Error("Réglages du fond illisibles");
  const values = state.values;
  const base = {
    enabled: values.enabled,
    fit: values.fit,
    dim: values.dim,
    leftShade: values.leftShade,
    rightShade: values.rightShade,
    bottomShade: values.bottomShade,
    panelShade: values.panelShade,
  };
  const path = resolveImage(values.imagePath);
  if (!path) return { ...base, dataUrl: null, imageKey: "", error: "Dossier du plugin introuvable" };
  try {
    const image = await loadImage(path);
    return { ...base, dataUrl: image.dataUrl, imageKey: image.key, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-wallpaper] image illisible", message);
    return { ...base, dataUrl: null, imageKey: "", error: message };
  }
}
