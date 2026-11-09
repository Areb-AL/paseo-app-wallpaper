App Wallpaper puts an image behind the whole Paseo app and adds adjustable layers on top so the interface stays readable: a gradient behind the sidebar, one behind the panel docked on the right, one behind the composer, a veil over the whole image and a veil on side panels such as the terminal or the file explorer. The image itself is never modified, so you can swap it at any time.

## How it works

The gradients follow the real layout. The plugin measures the sidebar, the right panel and the composer, and resizes the gradients when you resize them. Chats stay clear so the image shows through; message cards, the composer, dialogs and menus keep their own background. Large panels that are not a chat get the side-panel veil.

A frosted-glass band can sit behind each message column. On screens without a chat, such as settings or plugin pages, a focus mode blurs or darkens the wallpaper. An optional portrait image is used when the window is taller than wide. The image can move very slowly, be adjusted (brightness, saturation, blur, focal point) and rotate through a gallery at a chosen interval.

Three fit modes are available: fill the window (crops a little), show the whole image with blurred edges, or show the whole image with black bars. A sharpness indicator compares the image size with the window size and warns when the image is stretched.

## Setup

Requires Paseo 0.15.2 or later. Open App Wallpaper from the sidebar, or from the plugin's settings, then click **Parcourir…** to pick an image on your device, or enter the path of an image on the machine running the Paseo daemon (for example `~/Pictures/wallpaper.jpg`). JPG, PNG, WebP, animated GIF and MP4 or WebM videos are supported, up to 200 MB. Videos loop without sound and pause when the window is hidden. With no path, a bundled 3840 × 3840 square image is used, which fits any screen shape. For a sharp result, use an image at least as large as your window, in landscape.

The wallpaper appears in the desktop app (tested on macOS and Windows; Linux uses the same app but is untested) and in the web app. The iOS and Android apps are native and have no page to restyle, so the plugin has no effect there. The settings screen is available in French and English.

## Data and permissions

- An image picked with **Parcourir…** is sent to the daemon and saved as `$PASEO_HOME/plugin-data/app-wallpaper/wallpaper-<time>.<ext>`; only the latest one is kept, except for gallery images, which stay until you remove them from the gallery.
- The daemon reads the image file from the path you enter, only if it has an image or video extension and is 200 MB or less, and sends it in chunks to the Paseo apps connected to that daemon. The image is not uploaded anywhere else.
- The plugin reads Paseo's own configuration file (`$PASEO_HOME/config.json`) to find its installation folder and the bundled image.
- Settings are stored by Paseo on the daemon host and shared by every app connected to it.
- The plugin makes no network requests, collects no data and sends nothing to agent providers.
- In the desktop and web apps, it adds a style sheet and a few attributes to Paseo's interface. It relies on internal markers of the Paseo interface that are not a public API, so a Paseo update can stop parts of it from applying until the plugin is updated.
