import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readBackground } from "./server/background";
import { backgroundSettings, getBackground, probeLayout } from "./shared/background";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(backgroundSettings);
  server.handle(getBackground, () => readBackground(settings));
  server.handle(probeLayout, ({ report }) => {
    console.log("[app-wallpaper] probe\n" + report);
    return { ok: true };
  });
  return () => {};
}
