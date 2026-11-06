import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { BackgroundSettings } from "./client/settings";
import { setRefresher } from "./client/state";
import { createBackground, isWeb } from "./client/web";
import { getBackground, probeLayout } from "./shared/background";

// Mise au point : envoie la structure de l'écran dans les logs du plugin (paseo plugin logs app-wallpaper).
const PROBE = false;

export default function contribute(client: PluginClientContext) {
  const background = createBackground();
  let alive = true;

  const refresh = () => {
    client
      .rpc(getBackground, {})
      .then((view) => {
        if (!alive) return;
        if (view.error) console.warn("[app-wallpaper]", view.error);
        background.apply(view);
      })
      .catch((error: unknown) => console.warn("[app-wallpaper] fond indisponible", error));
  };
  setRefresher(refresh);
  if (isWeb()) refresh();

  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  if (PROBE && isWeb()) {
    probeTimer = setTimeout(() => {
      client.rpc(probeLayout, { report: background.probe().slice(0, 190_000) }).catch(() => {});
    }, 4000);
  }

  const removeSettings = client.addSettingsScreen({ id: "background", title: "Réglages", icon: "Image", Component: BackgroundSettings });
  // Entrée de la barre latérale : ouvre directement les réglages du fond.
  const AppWallpaperItem = (_props: PluginSidebarItemProps) => <SidebarRow icon="Image" onPress={() => client.openSettings("background")} />;
  const removeSidebar = client.addSidebarHeaderItem({ id: "app-wallpaper", title: "App Wallpaper", Component: AppWallpaperItem });

  return () => {
    alive = false;
    if (probeTimer) clearTimeout(probeTimer);
    setRefresher(() => {});
    removeSettings();
    removeSidebar();
    background.stop();
  };
}
