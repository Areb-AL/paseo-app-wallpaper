import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { BackgroundSettings } from "./client/settings";
import { setAppLocale, setLastError, setLastMedia, setRefresher } from "./client/state";
import { chunksToObjectUrl, createBackground, isPortraitWindow, isWeb, revokeObjectUrl, watchOrientation } from "./client/web";
import { getBackground, mediaChunk, probeLayout, type BackgroundView } from "./shared/background";

// Mise au point : envoie la structure de l'écran dans les logs du plugin (paseo plugin logs app-wallpaper).
const PROBE = false;

export default function contribute(client: PluginClientContext) {
  const background = createBackground();
  try {
    setAppLocale(client.i18n?.locale ?? "en");
  } catch {
    setAppLocale("en");
  }
  let alive = true;
  // Fichiers déjà téléchargés (image principale, verticale…) : clé → URL locale. Deux au plus.
  const downloaded = new Map<string, string>();
  let loading: Promise<string> | undefined;
  let loadingKey = "";

  const download = async (media: NonNullable<BackgroundView["media"]>) => {
    const hit = downloaded.get(media.key);
    if (hit) return hit;
    if (loading && loadingKey === media.key) return loading;
    loadingKey = media.key;
    loading = (async () => {
      const chunks: string[] = [];
      for (let index = 0; index < media.chunks; index++) {
        const { data } = await client.rpc(mediaChunk, { key: media.key, index });
        chunks.push(data);
      }
      const url = chunksToObjectUrl(chunks, media.mime);
      downloaded.set(media.key, url);
      while (downloaded.size > 2) {
        const [oldKey, oldUrl] = downloaded.entries().next().value as [string, string];
        downloaded.delete(oldKey);
        revokeObjectUrl(oldUrl);
      }
      return url;
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
      loadingKey = "";
    }
  };
  let rotationTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    client
      .rpc(getBackground, { portrait: isPortraitWindow() })
      .then((view) => {
        if (!alive) return;
        setLastError(view.error);
        setLastMedia(view.media ? { kind: view.media.kind, codec: view.media.codec } : null);
        // Rotation : on redemande l'image au moment du prochain changement.
        if (rotationTimer) clearTimeout(rotationTimer);
        rotationTimer = undefined;
        if (view.nextChangeAt) rotationTimer = setTimeout(refresh, Math.max(1000, view.nextChangeAt - Date.now() + 500));
        if (view.error) console.warn("[app-wallpaper]", view.error);
        if (!view.enabled || !view.media) return background.apply(view, "");
        return download(view.media).then((url) => {
          if (alive) background.apply(view, url);
        });
      })
      .catch((error: unknown) => {
        setLastError(error instanceof Error ? error.message : String(error));
        console.warn("[app-wallpaper] fond indisponible", error);
      });
  };
  setRefresher(refresh);
  if (isWeb()) refresh();
  // Paysage ↔ portrait : on redemande l'image (celle pour écran vertical si elle est réglée).
  const stopOrientation = watchOrientation(() => refresh());

  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  if (PROBE && isWeb()) {
    probeTimer = setTimeout(() => {
      client.rpc(probeLayout, { report: background.probe().slice(0, 190_000) }).catch(() => {});
    }, 4000);
  }

  const removeSettings = client.addSettingsScreen({ id: "background", title: "Wallpaper", icon: "Image", Component: BackgroundSettings });
  // Entrée de la barre latérale : ouvre directement les réglages du fond.
  const AppWallpaperItem = (_props: PluginSidebarItemProps) => <SidebarRow icon="Image" onPress={() => client.openSettings("background")} />;
  const removeSidebar = client.addSidebarHeaderItem({ id: "app-wallpaper", title: "App Wallpaper", Component: AppWallpaperItem });

  return () => {
    alive = false;
    stopOrientation();
    if (rotationTimer) clearTimeout(rotationTimer);
    if (probeTimer) clearTimeout(probeTimer);
    setRefresher(() => {});
    removeSettings();
    removeSidebar();
    background.stop();
    for (const url of downloaded.values()) revokeObjectUrl(url);
    downloaded.clear();
  };
}
