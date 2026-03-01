#!/usr/bin/env python3
"""
Prototype-only renderer for Black VHS FRONT mockup without Photoshop.

What it does:
1) Opens FRONT.psb with psd-tools
2) Turns off smart-object design layers
3) Exports a flattened "no design" front layer
4) Composites a TMDB/local poster into the smart-object bbox
5) Writes a few blend variants for quick visual evaluation

Usage:
  python3 scripts/vhs/prototype_black_case_front.py \
    --psb "/Users/you/Downloads/Black VHS Case - Mockup/Mockups/Black VHS Case - FRONT.psb" \
    --poster "https://image.tmdb.org/t/p/w780/rweIrveL43TaxUN0akQEaAXL6x0.jpg" \
    --out docs/references/black-vhs-prototypes
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageChops
from psd_tools import PSDImage


def iter_layers(group):
    for layer in group:
        yield layer
        if layer.is_group():
            yield from iter_layers(layer)


def find_layer(psd, exact_name: str):
    for layer in iter_layers(psd):
        if layer.name == exact_name:
            return layer
    return None


def load_poster_image(value: str) -> Image.Image:
    if value.startswith("http://") or value.startswith("https://"):
        with urlopen(value) as response:
            return Image.open(io.BytesIO(response.read())).convert("RGBA")
    return Image.open(value).convert("RGBA")


def paste_cover(base: Image.Image, cover: Image.Image, bbox):
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    resized = cover.resize((w, h), Image.Resampling.LANCZOS)
    base.paste(resized, (x1, y1), resized)
    return base


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--psb", required=True)
    parser.add_argument("--poster", required=True)
    parser.add_argument("--out", default="docs/references/black-vhs-prototypes")
    args = parser.parse_args()

    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(args.psb)

    design_layer = find_layer(psd, "**Your Design Here [Double-Click]** (Sleeve Insert)")
    if design_layer is None:
        raise SystemExit("Could not find FRONT smart-object design layer.")

    for layer in iter_layers(psd):
        if "Your Design Here" in layer.name:
            layer.visible = False

    no_design = psd.composite().convert("RGBA")
    no_design.save(out_dir / "front_full_no_design.png")

    bg_layer = find_layer(psd, "Background Color [Double-Click]")
    if bg_layer is None:
        raise SystemExit("Could not find background layer.")
    background = bg_layer.composite().convert("RGBA")

    poster = load_poster_image(args.poster)
    poster_canvas = Image.new("RGBA", no_design.size, (0, 0, 0, 0))
    poster_canvas = paste_cover(poster_canvas, poster, design_layer.bbox)

    base = background.copy()
    base.alpha_composite(poster_canvas)

    no_design_rgb = no_design.convert("RGB")
    base_rgb = base.convert("RGB")

    over = base.copy()
    over.alpha_composite(no_design)
    over.save(out_dir / "front_proto_over.png")

    multiply_rgb = ImageChops.multiply(base_rgb, no_design_rgb)
    multiply = Image.blend(base_rgb, multiply_rgb, 0.82)
    multiply.save(out_dir / "front_proto_multiply.png")

    screen_rgb = ImageChops.screen(base_rgb, no_design_rgb)
    screen = Image.blend(base_rgb, screen_rgb, 0.38)
    screen.save(out_dir / "front_proto_screen.png")

    print(f"Smart-object bbox: {design_layer.bbox}")
    print(f"Wrote prototypes to: {out_dir}")


if __name__ == "__main__":
    main()
