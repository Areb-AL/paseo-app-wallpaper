#!/usr/bin/env python3
"""Redresse une œuvre photographiée, puis redessine ses lignes en panorama net."""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
from PIL import Image


def hexrgb(c: str) -> np.ndarray:
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def extract(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGB")
    a = np.asarray(im, dtype=np.float32)
    h, w = a.shape[:2]
    # Le cadre gris est estimé aux quatre coins de la photographie.
    bg = np.median(np.concatenate([a[:16, :16].reshape(-1, 3),
                                  a[-16:, -16:].reshape(-1, 3)]), axis=0)
    mask = np.max(np.abs(a - bg), axis=2) > 24
    ys = np.arange(round(h * .15), round(h * .85))
    xs = np.arange(round(w * .2), round(w * .8))
    if not np.all(mask[ys].any(axis=1)) or not np.all(mask[:, xs].any(axis=0)):
        raise ValueError("Impossible de détecter les quatre bords de l'œuvre.")
    left = np.polyfit(ys, mask[ys].argmax(axis=1), 1)
    right = np.polyfit(ys, w - 1 - mask[ys, ::-1].argmax(axis=1), 1)
    top = np.polyfit(xs, mask[:, xs].argmax(axis=0), 1)
    bottom = np.polyfit(xs, h - 1 - mask[::-1, xs].argmax(axis=0), 1)

    def corner(side, edge):
        x = (side[0] * edge[1] + side[1]) / (1 - side[0] * edge[0])
        return np.array([x, edge[0] * x + edge[1]])

    corners = np.array([corner(left, top), corner(right, top),
                        corner(right, bottom), corner(left, bottom)])
    print("Coins détectés :", np.round(corners, 1).tolist())
    # Une marge intérieure de trois pixels élimine les derniers pixels gris.
    center = corners.mean(axis=0)
    corners += (center - corners) * (3 / np.linalg.norm(center - corners, axis=1))[:, None]
    ow = round((np.linalg.norm(corners[1] - corners[0]) + np.linalg.norm(corners[2] - corners[3])) / 2)
    oh = round((np.linalg.norm(corners[3] - corners[0]) + np.linalg.norm(corners[2] - corners[1])) / 2)
    matrix, values = [], []
    for (x, y), (u, v) in zip([(0, 0), (ow, 0), (ow, oh), (0, oh)], corners):
        matrix.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y],
                       [0, 0, 0, x, y, 1, -v*x, -v*y]])
        values.extend([u, v])
    coeffs = np.linalg.solve(matrix, values)
    return im.transform((ow, oh), Image.Transform.PERSPECTIVE, coeffs,
                        Image.Resampling.BICUBIC)


def smooth(a: np.ndarray, radius: float) -> np.ndarray:
    # Flou flottant : aucune quantification ne doit créneler les courbes.
    pad = round(radius * 4)
    b = np.pad(a, pad, mode="reflect")
    fy = np.fft.fftfreq(b.shape[0])[:, None]
    fx = np.fft.rfftfreq(b.shape[1])[None, :]
    kernel = np.exp(-2 * np.pi ** 2 * radius ** 2 * (fx * fx + fy * fy))
    b = np.fft.irfft2(np.fft.rfft2(b) * kernel, s=b.shape)
    return b[pad:-pad, pad:-pad].astype(np.float32)


def maps(src: Path, width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    im = extract(src).convert("L")
    # Douze pixels effacent entièrement la trame photographiée (~10 px).
    im = im.transpose(Image.Transpose.ROTATE_90)
    a = smooth(1 - np.asarray(im, dtype=np.float32) / 255, 12)
    lo, hi = np.percentile(a, [2, 98])
    a = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)
    density = Image.fromarray(a.astype(np.float32))
    # Un champ encore plus doux fait onduler les lignes sans petits plis.
    field = Image.fromarray(smooth(a, 38))
    scale = max(width / im.width, height / im.height)
    size = (round(im.width * scale), round(im.height * scale))
    x, y = (size[0] - width) // 2, (size[1] - height) // 2
    box = (x, y, x + width, y + height)
    density = np.asarray(density.resize(size, Image.Resampling.BICUBIC).crop(box), dtype=np.float32)
    field = np.asarray(field.resize(size, Image.Resampling.BICUBIC).crop(box), dtype=np.float32)
    return np.clip(density, 0, 1), field


def render(density: np.ndarray, field: np.ndarray, pitch: float, bend: float, palette: str) -> Image.Image:
    height, width = density.shape
    ss = 3
    bg, fg = ("#eef0f4", "#26338a") if palette == "light" else ("#05070f", "#dfe7ff")
    bgc, fgc = hexrgb(bg), hexrgb(fg)
    # Phase continue : ses isocontours constituent des lignes sans raccord.
    warp = (field - .5) * bend * pitch
    wy, wx = np.gradient(warp)
    # Évite les replis, même si --bend est très élevé.
    factor = min(1., .32 / max(float(np.abs(wy).max()), 1e-6))
    warp *= factor
    normal = np.sqrt((1 - wy * factor) ** 2 + (wx * factor) ** 2)
    out = np.empty((height, width, 3), dtype=np.uint8)
    xx = (np.arange(width * ss, dtype=np.float32) + .5) / ss - .5
    ix = np.floor(xx).astype(np.int32)
    fx = (xx - ix)[None, :]
    x0, x1 = np.clip(ix, 0, width - 1), np.clip(ix + 1, 0, width - 1)
    for start in range(0, height, 24):
        end = min(start + 24, height)
        yy = (np.arange(start * ss, end * ss, dtype=np.float32) + .5) / ss - .5
        iy = np.floor(yy).astype(np.int32)
        fy = (yy - iy)[:, None]
        y0, y1 = np.clip(iy, 0, height - 1), np.clip(iy + 1, 0, height - 1)

        def sample(a):
            upper = a[y0[:, None], x0] * (1 - fx) + a[y0[:, None], x1] * fx
            lower = a[y1[:, None], x0] * (1 - fx) + a[y1[:, None], x1] * fx
            return upper * (1 - fy) + lower * fy

        d, displacement, n = sample(density), sample(warp), sample(normal)
        phase = yy[:, None] + .5 - displacement
        distance = np.abs((phase + pitch / 2) % pitch - pitch / 2)
        # Épaisseur minimale positive : les lignes ne s'interrompent jamais.
        halfwidth = pitch * (.035 + .405 * d ** .95)
        # Couverture analytique du bord, puis intégration de neuf sous-pixels.
        cover = np.clip((halfwidth - distance) / n * ss + .5, 0, 1)
        cover = cover.reshape(end - start, ss, width, ss).mean(axis=(1, 3))
        out[start:end] = np.round(bgc + (fgc - bgc) * cover[..., None]).astype(np.uint8)
    return Image.fromarray(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("--width", type=int, default=5120)
    p.add_argument("--height", type=int, default=1440)
    p.add_argument("--pitch", type=float, default=13)
    p.add_argument("--bend", type=float, default=7)
    p.add_argument("--palette", choices=["light", "dark"], default="light")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    if min(a.width, a.height) < 2 or a.pitch < 3 or a.bend < 0:
        p.error("dimensions ≥ 2, pas ≥ 3 et courbure ≥ 0 requis")
    t0 = time.perf_counter()
    density, field = maps(a.source, a.width, a.height)
    im = render(density, field, a.pitch, a.bend, a.palette)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out)
    print(f"{a.out}: {im.width}x{im.height}, {a.out.stat().st_size:,} octets, {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
