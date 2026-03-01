# VHS Mockup Assets

Source mockup files used for VHS cover rendering.

- `originals/01. Front Side COVER.psd`: Main front-side mockup PSD copied from local download pack.
- `originals/01. Front Side.psd`: Legacy front-side cassette PSD source.

The runtime renderer does not read PSD/PSB files directly.
It uses extracted PNG layers from `public/VHS/templates/*`.

## Black VHS Case (Purchased Pack)

The new pack files are very large and are intentionally not committed to git.
Use the local downloaded source folder and regenerate runtime assets with:

```bash
python3 scripts/vhs/build_black_case_front_template.py \
  --psb \"/Users/henmee/Downloads/Black VHS Case - Mockup/Mockups/Black VHS Case - FRONT.psb\" \
  --output public/VHS/templates/black-case-front
```

This updates the template layers used by `templateId=black-case-front-v1`.
