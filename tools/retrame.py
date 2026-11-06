#!/usr/bin/env python3
"""Re-trame une photo tramée en haute définition : garde ses plis et sa lumière, redessine des points nets."""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def hexrgb(c: str) -> np.ndarray:
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def light_map(src: Path, width: int, height: int, rotate: bool, blur: float) -> np.ndarray:
    im = Image.open(src).convert("L")
    if rotate:
        im = im.transpose(Image.Transpose.ROTATE_90)
    # Le flou efface l'ancienne trame et ne garde que les plis (basses fréquences).
    im = im.filter(ImageFilter.GaussianBlur(blur))
    # Cadrage « cover » vers la taille cible.
    scale = max(width / im.width, height / im.height)
    w, h = round(im.width * scale), round(im.height * scale)
    im = im.resize((w, h), Image.Resampling.BICUBIC)
    left, top = (w - width) // 2, (h - height) // 2
    im = im.crop((left, top, left + width, top + height))
    a = np.asarray(im, dtype=np.float32) / 255
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    return np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)


def render(light: np.ndarray, pitch: float, wave: float, ss: int, bg: str, fg: str, tint: str) -> Image.Image:
    height, width = light.shape
    bgc, fgc, tintc = hexrgb(bg), hexrgb(fg), hexrgb(tint)
    out = np.empty((height, width, 3), dtype=np.uint8)
    xs = (np.arange(width * ss, dtype=np.float32) + 0.5) / ss
    for start in range(0, height, 48):
        end = min(start + 48, height)
        ys = (np.arange(start * ss, end * ss, dtype=np.float32) + 0.5) / ss
        x, y = np.meshgrid(xs, ys)
        # Lumière interpolée finement (bilinéaire) pour des points sans escalier.
        fx, fy = x - 0.5 - np.floor(x - 0.5), y - 0.5 - np.floor(y - 0.5)
        x0 = np.clip(np.floor(x - 0.5).astype(np.int32), 0, width - 1)
        y0 = np.clip(np.floor(y - 0.5).astype(np.int32), 0, height - 1)
        x1, y1 = np.minimum(x0 + 1, width - 1), np.minimum(y0 + 1, height - 1)
        L = (light[y0, x0] * (1 - fx) * (1 - fy) + light[y0, x1] * fx * (1 - fy)
             + light[y1, x0] * (1 - fx) * fy + light[y1, x1] * fx * fy)
        warp = wave * L * pitch
        gu = (x + 0.6 * warp) / pitch
        gv = (y + warp) / pitch
        fu, fv = gu - np.round(gu), gv - np.round(gv)
        # Points légèrement ovales (plus larges que hauts), qui ne se touchent jamais.
        d = np.sqrt((fu / 1.12) ** 2 + (fv / 0.9) ** 2)
        radius = 0.05 + 0.36 * np.sqrt(L)
        cover = np.clip((radius - d) * pitch / 1.1 + 0.5, 0, 1)
        dot = fgc * (0.45 + 0.55 * L[..., None]) + tintc * (1 - L[..., None]) * 0.4
        rgb = bgc * (1 - cover[..., None]) + dot * cover[..., None]
        rgb = rgb.reshape(end - start, ss, width, ss, 3).mean(axis=(1, 3))
        out[start:end] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("--width", type=int, default=5120)
    p.add_argument("--height", type=int, default=1440)
    p.add_argument("--rotate", action="store_true", help="tourner la source d'un quart de tour")
    p.add_argument("--blur", type=float, default=9, help="flou qui efface l'ancienne trame (px de la source)")
    p.add_argument("--pitch", type=float, default=14, help="écart entre deux points (px de sortie)")
    p.add_argument("--wave", type=float, default=2.2, help="courbure de la trame le long des plis")
    p.add_argument("--supersample", type=int, default=3)
    p.add_argument("--bg", default="#04060c")
    p.add_argument("--fg", default="#e6ecfa")
    p.add_argument("--tint", default="#6f84bd")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    t0 = time.perf_counter()
    light = light_map(a.source, a.width, a.height, a.rotate, a.blur)
    im = render(light, a.pitch, a.wave, a.supersample, a.bg, a.fg, a.tint)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out)
    print(f"{a.out}: {im.width}x{im.height}, {a.out.stat().st_size:,} octets, {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
