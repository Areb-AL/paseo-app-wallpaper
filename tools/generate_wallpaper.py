#!/usr/bin/env python3
"""Deterministic cloud halftones; requires only NumPy and Pillow."""
from __future__ import annotations

import argparse
import math
from pathlib import Path
import time

import numpy as np
from PIL import Image


PALETTES = {
    "violet": ["#0a0614", "#252044", "#493076", "#6d4bd6", "#9a72f0", "#c3a2ed", "#efe7ff"],
    "original": ["#020811", "#101c39", "#355057", "#72959b", "#b5ccc4", "#e4e6c8", "#fffde1"],
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def hash_grid(x, y, seed):
    """Coordinate hash: stable across image sizes, chunks and animation frames."""
    with np.errstate(over="ignore"):
        h = (np.asarray(x, dtype=np.int64).astype(np.uint64) * np.uint64(0x9E3779B185EBCA87)
             ^ np.asarray(y, dtype=np.int64).astype(np.uint64) * np.uint64(0xC2B2AE3D27D4EB4F)
             ^ np.uint64(seed & ((1 << 64) - 1)))
        h = (h ^ (h >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
        h = (h ^ (h >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
        h ^= h >> np.uint64(31)
    return (h >> np.uint64(40)).astype(np.float32) / np.float32(1 << 24)


def value_noise(x, y, seed):
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    fx, fy = fx**3 * (fx * (fx * 6 - 15) + 10), fy**3 * (fy * (fy * 6 - 15) + 10)
    a = hash_grid(ix, iy, seed) * (1 - fx) + hash_grid(ix + 1, iy, seed) * fx
    b = hash_grid(ix, iy + 1, seed) * (1 - fx) + hash_grid(ix + 1, iy + 1, seed) * fx
    return a * (1 - fy) + b * fy


def brightness(x, y, seed, drift, palette):
    # Coordinates use the short image side; no frame-dependent normalization.
    x, y = x + 7.31 + drift * 0.022, y + 3.87 + drift * 0.014
    warp_x = value_noise(x * 1.8, y * 1.8, seed + 31) - 0.5
    warp_y = value_noise(x * 1.8, y * 1.8, seed + 53) - 0.5
    x, y = x + warp_x * 0.19, y + warp_y * 0.19
    field = np.zeros_like(x + y, dtype=np.float32)
    for octave, weight in enumerate((1.0, 0.48, 0.23, 0.11, 0.05)):
        frequency = 2.65 * 2**octave
        field += weight * (value_noise(x * frequency, y * frequency, seed + 101 * octave) - 0.5)
    # Original has wide cream plateaus. Violet reserves them for cloud peaks.
    field = 0.50 + field * 1.65 if palette == "original" else 0.24 + field * 1.24
    field = np.clip(field, 0.025, 0.975)
    # Soft posterization preserves stepped contours without pixel noise.
    quantized = np.round(field * 12) / 12
    return np.clip(field * 0.25 + quantized * 0.75, 0.018, 0.982)


def bayer_matrix():
    b = np.array([[0, 2], [3, 1]], dtype=np.float32)
    for _ in range(2):
        b = np.block([[4 * b, 4 * b + 2], [4 * b + 3, 4 * b + 1]])
    return (b + 0.5) / b.size


def colors(values, palette):
    stops = np.array([[int(c[i:i+2], 16) for i in (1, 3, 5)] for c in PALETTES[palette]], dtype=np.float32)
    t = np.clip(values, 0, 1) * (len(stops) - 1)
    index = np.minimum(t.astype(np.int32), len(stops) - 2)
    f = (t - index)[..., None]
    return stops[index] * (1 - f) + stops[index + 1] * f


def render(width, height, cell, seed, palette, drift):
    # Padding includes all neighbors whose Gaussian contributes visibly.
    cols, rows = math.ceil(width / cell) + 4, math.ceil(height / cell) + 4
    gy, gx = np.mgrid[-2:rows-2, -2:cols-2]
    tone = brightness((gx + 0.5) * cell / min(width, height),
                      (gy + 0.5) * cell / min(width, height), seed, drift, palette)
    threshold = bayer_matrix()[gy % 8, gx % 8]
    # Two polarities reproduce pale islands with dark holes as in the reference.
    positive = threshold < np.minimum(tone * 2, 1)
    negative = threshold >= np.maximum(tone * 2 - 1, 0)
    # Violet stays dots-on-dark (chat background): no pale fill, no blurred halo.
    mix = smoothstep(0.40, 0.65, tone) if palette == "original" else np.zeros_like(tone)
    background = colors(np.zeros_like(tone), palette)
    pale = colors(np.full_like(tone, 1), palette)
    jitter = np.stack([hash_grid(gx, gy, seed + 211 + c * 17) - 0.5 for c in range(3)], axis=-1)
    # Jitter is attached to cells, never to pixels or time.
    ink = np.clip(colors(0.18 + tone * 0.85, palette) + jitter * 14, 0, 255)
    base = background * (1 - mix[..., None]) + pale * mix[..., None]
    amplitude = ((ink - background) * positive[..., None] * (1 - mix[..., None])
                 - (pale - background) * negative[..., None] * mix[..., None])
    sigma = 0.175 + 0.075 * np.sin(np.pi * tone)
    result = np.empty((height, width, 3), dtype=np.uint8)
    px = (np.arange(width, dtype=np.float32) + 0.5) / cell - 0.5
    ix = np.floor(px).astype(np.int32)
    fx = px - ix
    # Work in strips to keep even large renders below a few hundred MB.
    for start in range(0, height, 128):
        end = min(start + 128, height)
        py = (np.arange(start, end, dtype=np.float32) + 0.5) / cell - 0.5
        iy = np.floor(py).astype(np.int32)
        fy = py - iy
        # Interpolate only the continuous base, never blur the dot grid.
        rgb = np.zeros((end - start, width, 3), dtype=np.float32)
        for dy in (0, 1):
            for dx in (0, 1):
                weight = ((fy if dy else 1 - fy)[:, None]
                          * (fx if dx else 1 - fx)[None, :])
                rgb += base[iy[:, None] + dy + 2, ix[None, :] + dx + 2] * weight[..., None]
        # Analytic, pixel-integrated Gaussians (2x2 quadrature) and a faint halo.
        for dy in (-1, 0, 1, 2):
            for dx in (-1, 0, 1, 2):
                cy, cx = iy[:, None] + dy + 2, ix[None, :] + dx + 2
                s = sigma[cy, cx]
                spot = np.zeros_like(s)
                for sy in (-0.25 / cell, 0.25 / cell):
                    for sx in (-0.25 / cell, 0.25 / cell):
                        r2 = (fy[:, None] - dy + sy)**2 + (fx[None, :] - dx + sx)**2
                        spot += 0.25 * (0.96 * np.exp(-r2 / (2 * s**2))
                                        + 0.04 * np.exp(-r2 / (2 * (s * 1.65)**2)))
                rgb += amplitude[cy, cx] * spot[..., None]
        result[start:end] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=3840)
    parser.add_argument("--height", type=int, default=2160)
    parser.add_argument("--cell", type=float, default=20, help="Grid pitch in output pixels")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--palette", choices=PALETTES, default="violet")
    parser.add_argument("--time", type=float, default=0, help="Continuous, slow noise drift")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.width < 1 or args.height < 1 or not math.isfinite(args.cell) or args.cell < 2:
        parser.error("width/height must be positive; cell must be finite and >= 2")
    if not math.isfinite(args.time):
        parser.error("time must be finite")
    started = time.perf_counter()
    im = render(args.width, args.height, args.cell, args.seed, args.palette, args.time)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out, format="PNG", optimize=False, compress_level=6)
    print(f"{args.out}: {im.width}x{im.height}, {args.out.stat().st_size:,} bytes, {time.perf_counter()-started:.2f}s")


if __name__ == "__main__":
    main()
