#!/usr/bin/env python3
"""
Inspect Black VHS Case mockup PSB files and export smart-object/layer inventory as JSON.

Usage:
  python3 scripts/vhs/inspect_black_case_psb.py \
    --source "/Users/you/Downloads/Black VHS Case - Mockup" \
    --output docs/black-vhs-case-mockup-inventory.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from psd_tools import PSDImage


def iter_layers(group):
    for layer in group:
        yield layer
        if layer.is_group():
            yield from iter_layers(layer)


def collect_inventory(mockup_root: Path):
    files = sorted((mockup_root / "Mockups").glob("*.psb")) + sorted(
        (mockup_root / "Template").glob("*.psb")
    )
    inventory = []

    for file_path in files:
        psd = PSDImage.open(file_path)
        entry = {
            "file": str(file_path),
            "name": file_path.name,
            "width": psd.width,
            "height": psd.height,
            "smartObjects": [],
            "keyLayers": [],
        }

        def walk(layer, path_parts):
            path = path_parts + [layer.name]
            x1, y1, x2, y2 = layer.bbox
            info = {
                "name": layer.name,
                "path": " > ".join(path),
                "kind": getattr(layer, "kind", None),
                "bbox": {
                    "x": x1,
                    "y": y1,
                    "width": x2 - x1,
                    "height": y2 - y1,
                },
                "visible": layer.is_visible(),
            }

            if info["kind"] == "smartobject":
                entry["smartObjects"].append(info)

            lower = layer.name.lower()
            if any(
                token in lower
                for token in (
                    "texture",
                    "shadow",
                    "lighting",
                    "design here",
                    "mockup",
                    "front",
                    "back",
                    "spine",
                )
            ):
                entry["keyLayers"].append(info)

            if layer.is_group():
                for child in layer:
                    walk(child, path)

        for root_layer in psd:
            walk(root_layer, [])

        inventory.append(entry)

    return inventory


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        required=True,
        help='Path to "Black VHS Case - Mockup" directory',
    )
    parser.add_argument(
        "--output",
        default="docs/black-vhs-case-mockup-inventory.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()

    inventory = collect_inventory(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    print(f"Wrote inventory: {output}")


if __name__ == "__main__":
    main()
