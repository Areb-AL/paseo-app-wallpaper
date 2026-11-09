import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readBackground, readMediaChunk } from "./server/background";
import { addChunk, finishUpload, removeGalleryFile, startUpload } from "./server/upload";
import { backgroundSettings, galleryRemove, getBackground, mediaChunk, probeLayout, uploadChunk, uploadFinish, uploadStart } from "./shared/background";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(backgroundSettings);
  server.handle(getBackground, ({ portrait }) => readBackground(settings, portrait));
  server.handle(uploadStart, startUpload);
  server.handle(uploadChunk, addChunk);
  server.handle(uploadFinish, finishUpload);
  server.handle(galleryRemove, removeGalleryFile);
  server.handle(mediaChunk, readMediaChunk);
  server.handle(probeLayout, ({ report }) => {
    console.log("[app-wallpaper] probe\n" + report);
    return { ok: true };
  });
  return () => {};
}
