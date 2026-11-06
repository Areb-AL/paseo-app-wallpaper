# App Wallpaper

![App Wallpaper in Paseo](screenshots/1-accueil.jpg)

| Chats, Kanban and side panels | Settings |
| --- | --- |
| ![Chats](screenshots/2-conversations.jpg) | ![Settings](screenshots/3-reglages.jpg) |

A [Paseo](https://paseo.sh) plugin that puts an image behind the whole app, then adds a few
adjustable layers on top so everything stays readable. The image itself is never modified:

- a **left gradient**, sized to the real width of the sidebar, behind its buttons;
- a **right gradient**, sized to the panel docked on the right (files…);
- a **bottom gradient**, sized to the real height of the composer;
- a **veil** over the whole image, for the chat text;
- a **veil on side panels** (terminal, files… any large panel that is not a chat).

Chats stay clear so the image shows through. Message cards and the composer keep their own background.

## Requirements

- Paseo 0.15.2 or later, with plugins enabled (Settings → Plugins).
- Works in the **desktop app** (macOS; Windows and Linux use the same app, untested) and the
  **web app**. The iOS and Android apps are native and have no page to restyle: the plugin does nothing there.

## Install

```bash
paseo plugin add git:Areb-AL/paseo-app-wallpaper
```

For a private repository, the machine running the Paseo daemon needs Git access to it.

## Settings

Open **App Wallpaper** in the sidebar, or Settings → Plugins → App Wallpaper.

| Setting | What it does |
| --- | --- |
| Show wallpaper | Turns the plugin on or off. |
| Image | Path to an image on the daemon host (`~/Pictures/wallpaper.jpg`): jpg, png, gif (animated) or webp, up to 20 MB. Empty: `assets/default-5120x1440.jpg`. |
| Fit | **Fill window** (crops a little), **whole image, blurred edges** (no black bars), or **whole image, black bars**. |
| Sharpness | Shows the image and window sizes, and warns when the image is stretched (blurry). |
| Left / right / bottom gradient | Strength of each gradient, from none to 100 %. |
| Side panels | Veil on non-chat panels (terminal, files…). |
| Image veil | Darkens the whole image for the chat text. |

**Tip:** for a sharp result, use an image at least as large as your window, in landscape.
For a 49" 32:9 monitor such as the Samsung Odyssey G9, that is **5120 × 1440**.

## How it works

- `server/background.ts` reads the settings, loads the image and sends it to the app.
- `client/web.ts` adds a `<style>` tag: the image and the gradients become the `<html>` background.
  Large images are turned into a Blob URL, because Chromium rejects data URLs over 2 MB.
  A `MutationObserver` finds large layout blocks with an opaque background and makes them
  transparent; dialogs, menus, message cards and the composer keep theirs.
- The plugin relies on Paseo's `data-testid` markers (`left-sidebar-resize-handle`,
  `message-input-root`, `agent-chat-scroll`…). They are not a public API: a Paseo update can break it.

## Tools

`tools/` holds the scripts used to make wallpapers (Python with NumPy and Pillow, run with `uv`):

- `generate_wallpaper.py` — procedural halftone clouds (the default image comes from it);
- `generate_waves.py`, `retrame.py`, `retrace_lines.py` — wavy halftone and line patterns,
  re-drawn sharp at any size;
- `upscale.sh` — AI upscaling with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)
  (`realesrgan-ncnn-vulkan`, BSD-3-Clause, not included: install it separately).

## Development

```bash
npm install          # types only
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload app-wallpaper
paseo plugin logs app-wallpaper
```

## License

[MIT](LICENSE)
