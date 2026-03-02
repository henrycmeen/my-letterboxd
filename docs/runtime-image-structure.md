# Runtime Image Structure

This project keeps static design assets separate from runtime-generated/cache files.

## Canonical Folders

- `assets/vhs-mockups/originals/`
  - Source PSD/PSB files (design input only, not runtime output).
- `public/VHS/templates/`
  - Versioned template overlays, masks, placeholders used by renderers.
- `public/VHS/backgrounds/`
  - Versioned UI backgrounds used in pages.
- `public/VHS/ui/`
  - Versioned UI image elements (for example remote control).
- `.cache/vhs/generated/`
  - Runtime-rendered VHS covers (cache only).
  - Served to UI through `/api/vhs/generated/:fileName`.
- `.cache/tmdb/lists` and `.cache/tmdb/search`
  - TMDB API payload cache.
- `.cache/tmdb/images/posters` and `.cache/tmdb/images/backdrops`
  - Cached TMDB source images before rendering.
- `data/club/filmklubb.sqlite`
  - Local floor board state (positions/scores/leader), auto-migrated from legacy JSON.

## Rules

- Do not commit runtime cache files under `.cache/*`.
- Keep only reusable, stable assets in `public/VHS/templates`, `public/VHS/backgrounds`, and `public/VHS/ui`.
- Keep experiments and screenshots in `docs/references/` (or ignore them via `.gitignore`).
- Resolve paths through `src/lib/storagePaths.ts` for backend storage logic.
- Runtime caches are pruned automatically by age + size limits (configurable via env).

## Naming Conventions

- Template IDs: kebab-case + explicit version suffix, e.g. `black-case-front-v1`.
- Generated covers include renderer/template/revision in filename for invalidation safety.
- Use renderer revision bumps (e.g. `r12`) when compositing logic changes.

## Operational Notes

- First request may be slower due to TMDB + render warm-up.
- Subsequent requests should hit local cache (`.cache/tmdb/*` + `.cache/vhs/generated/*`).
- Safe local reset:
  - `rm -rf .cache/tmdb/*`
  - `rm -rf .cache/vhs/generated/*`

## Why this split

This separation keeps repo assets deterministic while letting runtime caches grow and be purged without affecting source-controlled files.
