# Wallpaper tools

Scripts used to make sharp wallpapers. Python ones need NumPy and Pillow; run them with `uv`:

```bash
uv run --with numpy --with pillow python tools/generate_wallpaper.py \
  --palette violet --cell 20 --width 5120 --height 1440 \
  --out assets/default-5120x1440.png
```

| Script | What it does |
| --- | --- |
| `generate_wallpaper.py` | Procedural halftone clouds: soft dots on a grid, ordered (Bayer 8×8) dithering of a fractal noise field. `--palette violet\|original`, `--cell` dot pitch, `--seed`, `--time` (slow drift, for animation frames). |
| `generate_waves.py` | Wavy fabric-like halftone, computed at any size. |
| `retrame.py` | Re-halftones an existing halftone photo: keeps its light and folds, redraws crisp dots at the target size. |
| `retrace_lines.py` | Same idea for op-art line patterns (`--palette light\|dark`). |
| `upscale.sh` | AI upscaling ×4 with Real-ESRGAN (`realesrgan-ncnn-vulkan`, installed separately), then rotate, resize and crop to 5120 × 1440. |

How the halftone clouds work:

1. **Clouds**: multi-scale noise, slightly warped, gives a brightness map, rounded to 12 levels for stepped edges.
2. **Screen**: each grid cell is lit or not according to an 8×8 Bayer matrix.
3. **Dots**: each lit cell gets a round dot with an analytic Gaussian edge (no image blur), colored from the palette.
