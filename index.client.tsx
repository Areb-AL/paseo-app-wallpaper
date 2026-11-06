import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { BackgroundSettings } from "./client/settings";
import { setAppLocale, setLastError, setRefresher } from "./client/state";
import { createBackground, isPortraitWindow, isWeb, watchOrientation } from "./client/web";
import { getBackground, probeLayout } from "./shared/background";

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
  let rotationTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    client
      .rpc(getBackground, { portrait: isPortraitWindow() })
      .then((view) => {
        if (!alive) return;
        setLastError(view.error);
        // Rotation : on redemande l'image au moment du prochain changement.
        if (rotationTimer) clearTimeout(rotationTimer);
        rotationTimer = undefined;
        if (view.nextChangeAt) rotationTimer = setTimeout(refresh, Math.max(1000, view.nextChangeAt - Date.now() + 500));
        if (view.error) console.warn("[app-wallpaper]", view.error);
        background.apply(view);
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
  };
}
