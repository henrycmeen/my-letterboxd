# Repo Image Audit (2026-02-28)

## Quick Summary

- Image-heavy footprint is concentrated in `public/VHS/`.
- Large non-runtime debug/reference images were scattered in repo root and `public/VHS/templates`.
- Cleanup performed:
  - Root screenshots/debug images moved to `docs/references/2026-02-28-session-images/`
  - Unused template iteration files (`public/VHS/templates/_v*.png`) moved to `docs/references/vhs-template-iterations/`
  - Legacy unused public assets moved to `docs/references/legacy-public-images/`
  - `.gitignore` updated to prevent these from reappearing in tracked status

## Size Snapshot (Before Cleanup)

- `public/`: ~585.5 MB total images
- `public/VHS/generated`: ~260.5 MB (runtime-generated cover cache)
- `public/VHS/templates`: ~206.2 MB
- Root debug/session images: ~127 MB
- `.cache/tmdb/posters`: ~10.1 MB (already ignored)

## Runtime-Critical Image Paths

- `public/VHS/templates/front-side-cover-*.png` and `front-side-cover-flat.webp`
- `public/VHS/backgrounds/floor-oak.png`
- `public/VHS/Front Side.png`
- `public/VHS/generated/*` (runtime cache; should not be hand-curated)

## Structural Risks Found

- Fallback cover paths in `src/pages/floor.tsx` include generated files that may not exist on fresh clone if caches are empty.
- `public/VHS/generated` is acting as runtime cache and can quickly grow large.

## Recommended Next Cleanup

1. Replace hardcoded fallback generated cover paths with stable bundled assets or placeholders.
2. Add a small cleanup script for stale generated files in `public/VHS/generated`.
3. Keep all non-runtime visual experiments in `docs/references/` only.
