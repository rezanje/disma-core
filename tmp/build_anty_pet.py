#!/usr/bin/env python3
"""Build the Anty Codex pet atlas from the approved base sprite."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


CELL_W = 192
CELL_H = 208
COLUMNS = 8
ROWS = [
    ("idle", 6),
    ("running-right", 8),
    ("running-left", 8),
    ("waving", 4),
    ("jumping", 5),
    ("failed", 8),
    ("waiting", 6),
    ("running", 6),
    ("review", 6),
]


ROOT = Path(__file__).resolve().parents[1]
RUN_DIR = ROOT / "tmp" / "hatch-pet-anty"
BASE = RUN_DIR / "references" / "canonical-base.png"
FINAL = RUN_DIR / "final"
FRAMES = RUN_DIR / "frames"
QA = RUN_DIR / "qa"


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    out = []
    for r, g, b, a in rgba.getdata():
        if r > 235 and g < 35 and b > 235:
            out.append((0, 0, 0, 0))
        else:
            out.append((r, g, b, a))
    rgba.putdata(out)
    return rgba


def crop_sprite(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("base sprite has no visible pixels")
    return image.crop(bbox)


def fit_sprite(sprite: Image.Image) -> Image.Image:
    max_w = 156
    max_h = 182
    scale = min(max_w / sprite.width, max_h / sprite.height)
    size = (round(sprite.width * scale), round(sprite.height * scale))
    return sprite.resize(size, Image.Resampling.LANCZOS)


def frame(sprite: Image.Image, *, dx: int = 0, dy: int = 0, scale: float = 1, angle: float = 0,
          flip: bool = False, brightness: float = 1, saturation: float = 1) -> Image.Image:
    img = sprite
    if flip:
        img = ImageOps.mirror(img)
    if scale != 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
    if saturation != 1:
        img = ImageEnhance.Color(img).enhance(saturation)
    if brightness != 1:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if angle:
        img = img.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

    canvas = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    x = (CELL_W - img.width) // 2 + dx
    y = CELL_H - img.height - 10 + dy
    canvas.alpha_composite(img, (x, y))
    return canvas


def state_frames(sprite: Image.Image, state: str) -> list[Image.Image]:
    if state == "idle":
        return [
            frame(sprite, dy=0, scale=1.000),
            frame(sprite, dy=-1, scale=1.005),
            frame(sprite, dy=-2, scale=1.008),
            frame(sprite, dy=-1, scale=1.004),
            frame(sprite, dy=0, scale=1.000),
            frame(sprite, dy=1, scale=0.997),
        ]
    if state == "running-right":
        vals = [(-5, 2, -5), (-2, -2, -2), (1, 0, 2), (5, -3, 5), (4, 1, 3), (1, -1, 0), (-2, 1, -3), (-4, -1, -5)]
        return [frame(sprite, dx=x, dy=y, angle=a) for x, y, a in vals]
    if state == "running-left":
        return [ImageOps.mirror(f) for f in state_frames(sprite, "running-right")]
    if state == "waving":
        return [
            frame(sprite, dy=0, angle=-2),
            frame(sprite, dy=-2, angle=4),
            frame(sprite, dy=-1, angle=-4),
            frame(sprite, dy=0, angle=2),
        ]
    if state == "jumping":
        return [
            frame(sprite, dy=8, scale=0.99),
            frame(sprite, dy=2, scale=1.00),
            frame(sprite, dy=-14, scale=1.00),
            frame(sprite, dy=-2, scale=1.00),
            frame(sprite, dy=6, scale=0.99),
        ]
    if state == "failed":
        vals = [(1, 7, -7), (0, 10, -10), (1, 11, -12), (0, 9, -10), (-1, 10, -11), (0, 12, -13), (1, 9, -9), (0, 8, -7)]
        return [frame(sprite, dx=x, dy=y, angle=a, brightness=0.82, saturation=0.65) for x, y, a in vals]
    if state == "waiting":
        vals = [(0, 0, 0), (1, -1, -2), (2, -1, -3), (0, 0, 0), (-1, -1, 2), (-2, -1, 3)]
        return [frame(sprite, dx=x, dy=y, angle=a) for x, y, a in vals]
    if state == "running":
        vals = [(-1, 1, -3), (1, -1, 2), (2, 0, 4), (0, -2, 0), (-2, 0, -4), (0, 1, -2)]
        return [frame(sprite, dx=x, dy=y, angle=a, scale=1.005 if i % 2 else 1.0) for i, (x, y, a) in enumerate(vals)]
    if state == "review":
        vals = [(0, 0, 0), (0, -1, 2), (1, -1, 3), (0, 0, 1), (-1, -1, -2), (0, 0, 0)]
        return [frame(sprite, dx=x, dy=y, angle=a) for x, y, a in vals]
    raise ValueError(state)


def normalize_transparent_rgb(image: Image.Image) -> Image.Image:
    data = []
    for r, g, b, a in image.convert("RGBA").getdata():
        data.append((0, 0, 0, 0) if a == 0 else (r, g, b, a))
    image.putdata(data)
    return image


def main() -> None:
    FINAL.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)

    sprite = fit_sprite(crop_sprite(remove_key(Image.open(BASE))))
    atlas = Image.new("RGBA", (CELL_W * COLUMNS, CELL_H * len(ROWS)), (0, 0, 0, 0))
    manifest = {"cell_width": CELL_W, "cell_height": CELL_H, "states": []}

    for row, (state, count) in enumerate(ROWS):
        state_dir = FRAMES / state
        state_dir.mkdir(parents=True, exist_ok=True)
        frames = state_frames(sprite, state)
        manifest["states"].append({"state": state, "row": row, "frame_count": count})
        for col, img in enumerate(frames[:count]):
            img = normalize_transparent_rgb(img)
            atlas.alpha_composite(img, (col * CELL_W, row * CELL_H))
            img.save(state_dir / f"{col:02d}.png")

    atlas = normalize_transparent_rgb(atlas)
    atlas.save(FINAL / "spritesheet.png")
    atlas.save(FINAL / "spritesheet.webp", lossless=True, quality=100, method=6)
    (FRAMES / "frames-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
