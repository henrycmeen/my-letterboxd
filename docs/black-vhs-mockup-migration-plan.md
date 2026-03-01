# Black VHS Mockup Migration Plan

## Goal

Use the new pack from:

- `/Users/henmee/Downloads/Black VHS Case - Mockup`

while keeping the current (old) VHS renderer as a stable fallback.

## Findings From Initial Analysis

- New pack contains only `PSB` files for mockups/templates, not ready-made PNG overlays.
- Main files:
  - `Mockups/Black VHS Case - FRONT.psb`
  - `Mockups/Black VHS Case - FRONT (ALT).psb`
  - `Mockups/Black VHS Case -BACK.psb`
  - `Mockups/Black VHS Case - SPINE.psb`
  - `Mockups/Black VHS Case - OPEN.psb`
  - `Template/Black Case Template.psb`
  - `Template/Cut-Box Template.psb`
- Smart-object placeholders exist and are discoverable by script.

Inventory output is generated in:

- `docs/black-vhs-case-mockup-inventory.json`

## Current Migration Status

Implemented:

1. Added `black-case-front-v1` template in runtime (`src/lib/vhs/templates.ts`).
2. Added PSB extraction/build script:
   - `scripts/vhs/build_black_case_front_template.py`
3. Script now exports runtime assets in:
   - `public/VHS/templates/black-case-front/`
4. Default sharp template was switched to `black-case-front-v1`.
5. Legacy template `front-side-cover-flat` is still available as fallback.

## Why This Path

- It lets us iterate quickly without breaking current flow.
- It avoids hard dependency on Photoshop in runtime.
- It gives a rollback path immediately if visuals regress.

## Prototype Tests Done

Scripted tests were run to inspect PSB structure and produce quick front-cover mockup probes:

- `scripts/vhs/inspect_black_case_psb.py`
- `scripts/vhs/prototype_black_case_front.py`

Prototype outputs were written to local reference folder:

- `docs/references/black-vhs-prototypes/` (ignored by git)

Observations:

- PSB can be inspected and composited with `psd-tools`.
- Smart-object bounding boxes are available and usable for poster placement.
- Visual fidelity is not yet production-ready from raw PSB extraction alone; a cleaner extraction of layers is needed for stable brightness/texture behavior.

## What To Implement Next (Concrete)

1. Add an A/B preview utility endpoint for side-by-side comparisons:
   - `legacy (front-side-cover-flat)` vs `black-case-front-v1`
2. Run visual checks across 10-20 varied posters and log outcomes:
   - no crushed blacks
   - readable title area
   - dirty/plastic look preserved
   - render time within current budget
3. Optional next step: extract `FRONT (ALT)` as `black-case-front-alt-v1`.

## Backup Strategy

- Keep existing old pipeline and templates unchanged.
- Rollback is one config change: set template back to `front-side-cover-flat`.
