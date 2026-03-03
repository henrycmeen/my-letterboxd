#!/usr/bin/env python3
"""
Extract runtime PNG layers from the Black VHS SPINE PSB and build template assets.

Usage:
  python3 scripts/vhs/build_black_case_spine_template.py \
    --psb "/Users/you/Downloads/Black VHS Case - Mockup/Mockups/Black VHS Case - SPINE.psb" \
    --output "public/VHS/templates/black-case-spine"
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops
from psd_tools import PSDImage


LayerMap = dict[str, str]

LAYER_PATHS: LayerMap = {
    "shadow": "Shadows/Facing Down",
    "case": "Black Spine Case/Spine Case Mockup",
    "design": "Black Spine Case/**Your Design Here [Double-Click]** (Sleeve Insert)",
    "plastic": "Texture/Plastic",
    "scratches": "Texture/Texture + Reflection  [Adjust]",
}


def iter_layers(group, path: str = ""):
    for layer in group:
        current_path = f"{path}/{layer.name}" if path else layer.name
        yield current_path, layer
        if layer.is_group():
            yield from iter_layers(layer, current_path)


def find_layers(psd: PSDImage) -> dict[str, object]:
    by_path = {path: layer for path, layer in iter_layers(psd)}
    resolved: dict[str, object] = {}

    for alias, layer_path in LAYER_PATHS.items():
        layer = by_path.get(layer_path)
        if layer is None:
            raise RuntimeError(f"Could not find required layer path: {layer_path}")
        resolved[alias] = layer

    return resolved


def to_canvas(psd: PSDImage, layer) -> Image.Image:
    canvas = Image.new("RGBA", (psd.width, psd.height), (0, 0, 0, 0))
    composite = layer.composite().convert("RGBA")
    x1, y1, _, _ = layer.bbox
    canvas.alpha_composite(composite, dest=(x1, y1))
    return canvas


def apply_alpha_scale(image: Image.Image, scale: float) -> Image.Image:
    if scale >= 1:
        return image

    result = image.copy()
    alpha = result.getchannel("A").point(lambda value: int(value * scale))
    result.putalpha(alpha)
    return result


def alpha_mask_from(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    mask = Image.new("RGBA", image.size, (255, 255, 255, 0))
    mask.putalpha(alpha)
    return mask


def screen_blend(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base_rgb = base.convert("RGB")
    overlay_rgb = overlay.convert("RGB")
    screened = ImageChops.screen(base_rgb, overlay_rgb)
    alpha = overlay.getchannel("A")
    blended_rgb = Image.composite(screened, base_rgb, alpha)
    return Image.merge("RGBA", (*blended_rgb.split(), base.getchannel("A")))


def compose_placeholder_cover(
    shadow: Image.Image,
    case: Image.Image,
    design: Image.Image,
    plastic: Image.Image,
    scratches: Image.Image,
) -> Image.Image:
    canvas = Image.new("RGBA", case.size, (0, 0, 0, 0))
    canvas.alpha_composite(apply_alpha_scale(shadow, 0.36))
    canvas.alpha_composite(case)
    canvas.alpha_composite(design)
    canvas = screen_blend(canvas, apply_alpha_scale(plastic, 0.9))
    canvas.alpha_composite(apply_alpha_scale(scratches, 0.4))
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--psb",
        default=(
            "/Users/henmee/Library/Mobile Documents/com~apple~CloudDocs/Design/"
            "Black VHS Case - Mockup/Mockups/Black VHS Case - SPINE.psb"
        ),
        help="Path to Black VHS SPINE PSB.",
    )
    parser.add_argument(
        "--output",
        default="public/VHS/templates/black-case-spine",
        help="Output directory for exported assets.",
    )
    args = parser.parse_args()

    psb_path = Path(args.psb).expanduser().resolve()
    if not psb_path.exists():
        raise SystemExit(f"PSB file not found: {psb_path}")

    output_dir = Path(args.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(psb_path)
    layers = find_layers(psd)

    shadow = to_canvas(psd, layers["shadow"])
    case = to_canvas(psd, layers["case"])
    design = to_canvas(psd, layers["design"])
    plastic = to_canvas(psd, layers["plastic"])
    scratches = to_canvas(psd, layers["scratches"])
    case_mask = alpha_mask_from(case)

    shadow.save(output_dir / "spine-shadow-underlay.png")
    case.save(output_dir / "spine-case-underlay.png")
    design.save(output_dir / "spine-placeholder-design.png")
    plastic.save(output_dir / "spine-texture-plastic.png")
    scratches.save(output_dir / "spine-texture-scratches.png")
    case_mask.save(output_dir / "spine-case-mask.png")

    cx1, cy1, cx2, cy2 = layers["case"].bbox
    crop_box = (cx1, cy1, cx2, cy2)
    shadow.crop(crop_box).save(output_dir / "spine-shadow-underlay-cropped.png")
    case.crop(crop_box).save(output_dir / "spine-case-underlay-cropped.png")
    plastic.crop(crop_box).save(output_dir / "spine-texture-plastic-cropped.png")
    scratches.crop(crop_box).save(output_dir / "spine-texture-scratches-cropped.png")
    case_mask.crop(crop_box).save(output_dir / "spine-case-mask-cropped.png")

    placeholder_cover = compose_placeholder_cover(
        shadow=shadow,
        case=case,
        design=design,
        plastic=plastic,
        scratches=scratches,
    )
    placeholder_cover.save(output_dir / "spine-placeholder-cover.png")
    placeholder_cover.convert("RGB").save(
        output_dir / "spine-placeholder-cover.webp",
        format="WEBP",
        quality=86,
        method=6,
    )

    placeholder_cover_cropped = compose_placeholder_cover(
        shadow=shadow.crop(crop_box),
        case=case.crop(crop_box),
        design=design.crop(crop_box),
        plastic=plastic.crop(crop_box),
        scratches=scratches.crop(crop_box),
    )
    placeholder_cover_cropped.save(output_dir / "spine-placeholder-cover-cropped.png")
    placeholder_cover_cropped.save(
        output_dir / "spine-placeholder-cover-cropped.webp",
        format="WEBP",
        quality=86,
        method=6,
    )

    x1, y1, x2, y2 = layers["design"].bbox
    metadata = {
        "sourcePsbName": psb_path.name,
        "output": {"width": psd.width, "height": psd.height},
        "poster": {
            "left": x1,
            "top": y1,
            "width": x2 - x1,
            "height": y2 - y1,
        },
        "underlays": [
            {
                "publicPath": "/VHS/templates/black-case-spine/spine-shadow-underlay.png",
                "blend": "over",
                "opacity": 0.36,
            },
            {
                "publicPath": "/VHS/templates/black-case-spine/spine-case-underlay.png",
                "blend": "over",
                "opacity": 1,
            },
        ],
        "overlays": [
            {
                "publicPath": "/VHS/templates/black-case-spine/spine-texture-plastic.png",
                "blend": "screen",
                "opacity": 0.9,
            },
            {
                "publicPath": "/VHS/templates/black-case-spine/spine-texture-scratches.png",
                "blend": "over",
                "opacity": 0.4,
            },
        ],
    }
    (output_dir / "spine-metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    print(f"Built black-case-spine template assets in: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
