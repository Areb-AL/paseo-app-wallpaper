#!/usr/bin/env python3
"""Tissu tramé ondulé, net à toute taille."""
from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import numpy as np
from PIL import Image


def hexrgb(c: str) -> np.ndarray:
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


PALETTES = {
    "nuit": ("#05070f", "#dfe7f7", "#7f93c4"),     # fond, points clairs, reflet bleuté
    "violet": ("#07040f", "#ece4ff", "#8d6ee8"),
}


def render(width: int, height: int, pitch: float, seed: int, palette: str, t: float, ss: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 2 * math.pi, 8)
    bg, fg, tint = (hexrgb(c) for c in PALETTES[palette])
    out = np.empty((height, width, 3), dtype=np.uint8)
    # Échelle de référence : le côté court, pour garder les mêmes plis en 16:9 comme en 32:9.
    s = min(width, height)
    xs = (np.arange(width * ss, dtype=np.float32) + 0.5) / ss
    for start in range(0, height, 64):
        end = min(start + 64, height)
        ys = (np.arange(start * ss, end * ss, dtype=np.float32) + 0.5) / ss
        x, y = np.meshgrid(xs, ys)
        X, Y = x / s, y / s
        # Plis du tissu : bandes verticales dont la position ondule avec la hauteur.
        fold = (np.sin(2 * math.pi * (X * 1.55 + 0.18 * np.sin(2 * math.pi * (Y * 0.55 + X * 0.21) + ph[0]) + t * 0.02) + ph[1])
                + 0.55 * np.sin(2 * math.pi * (X * 3.1 + 0.27 * np.sin(2 * math.pi * (Y * 0.8 - X * 0.33) + ph[2]) - t * 0.015) + ph[3])
                + 0.25 * np.sin(2 * math.pi * (X * 0.6 + Y * 0.35) + ph[4]))
        light = np.clip(0.5 + 0.34 * fold, 0, 1) ** 1.35
        # La trame suit les plis : déplacement horizontal et vertical lié au même champ.
        warp_x = 0.030 * s * np.sin(2 * math.pi * (Y * 0.9 + X * 0.4) + ph[5] + t * 0.03)
        warp_y = 0.022 * s * np.sin(2 * math.pi * (X * 1.2 - Y * 0.3) + ph[6]) + 0.012 * s * fold
        gu = (x + warp_x) / pitch
        gv = (y + warp_y) / (pitch * 1.08)
        fu = gu - np.round(gu)
        fv = gv - np.round(gv)
        # Points ovales, plus larges que hauts, dont la taille suit la lumière.
        radius = 0.08 + 0.46 * light
        d = np.sqrt((fu / 1.12) ** 2 + (fv / 0.86) ** 2)
        aa = 0.75 / pitch
        cover = np.clip((radius - d) / aa + 0.5, 0, 1)
        dot = fg * (0.55 + 0.45 * light[..., None]) + tint * (1 - light[..., None]) * 0.35
        rgb = bg * (1 - cover[..., None]) + dot * cover[..., None]
        rgb = rgb.reshape(end - start, ss, width, ss, 3).mean(axis=(1, 3))
        out[start:end] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--width", type=int, default=5120)
    p.add_argument("--height", type=int, default=1440)
    p.add_argument("--pitch", type=float, default=11, help="écart entre deux points, en pixels")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--palette", choices=PALETTES, default="nuit")
    p.add_argument("--time", type=float, default=0)
    p.add_argument("--supersample", type=int, default=3)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    t0 = time.perf_counter()
    im = render(a.width, a.height, a.pitch, a.seed, a.palette, a.time, a.supersample)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out)
    print(f"{a.out}: {im.width}x{im.height}, {a.out.stat().st_size:,} octets, {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
