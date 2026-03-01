# VHS Film Club

A film club app built with Next.js that fetches movie data from TMDB and renders VHS-style covers.

## What It Does

- Fetches movies from TMDB (`popular`, `top_rated`, `upcoming`, `now_playing`)
- Caches TMDB list/search responses and source image files on disk
- Generates VHS cover images in `public/VHS/generated`
- Persists floor board state (position + score) in `data/club-floor-board.json`
- Uses `sharp` as the primary renderer with a fixed VHS template pipeline
- Supports Photoshop smart-object rendering as an optional local fallback

## Setup

1. Install dependencies

```bash
pnpm install
```

2. Configure environment variables

```bash
cp .env.example .env
```

Set at minimum:

```bash
TMDB_API_KEY="your_tmdb_api_key_here"
```

Optional:

```bash
TMDB_LIST_CACHE_TTL_SECONDS=1800
VHS_RENDERER="sharp" # or "photoshop"
```

3. Start development server

```bash
pnpm dev
```

## API Endpoints

- `GET /api/club/movies?listType=popular&limit=12`
  Returns TMDB movie list data for the film club.

- `GET /api/vhs/covers?listType=popular&limit=8&force=false&renderer=sharp&format=webp`
  Generates/returns rendered covers.

Query params:

- `renderer`: `sharp` or `photoshop`
- `format`: `png` or `webp`
- `templateId`: used by `sharp` renderer (default: `black-case-front-v1`)
- `smartObjectLayerName`: optional preferred smart object layer name for Photoshop renderer
- `force=true`: re-render files even if they already exist

## Caching

- TMDB list cache: `.cache/tmdb/lists`
- TMDB search cache: `.cache/tmdb/search`
- TMDB poster cache: `.cache/tmdb/posters`
- Generated covers: `public/VHS/generated`
- Floor board persistence: `data/club-floor-board.json`

## Current Cover Pipeline (`renderer=sharp`)

This is the default flow used by the app right now.

1. Fetch poster/backdrop from TMDB
2. Cache source image on disk (`.cache/tmdb/posters`)
3. Resize/crop to the VHS poster slot (cover-fit)
4. Apply template mask (`dest-in`) so the art keeps the same physical cover shape
5. Composite VHS wear layers (texture/highlight/shadow) from `public/VHS/templates`
6. Write final output to `public/VHS/generated/*.webp`

Main template assets (default `black-case-front-v1`):

- `public/VHS/templates/black-case-front/front-shadow-underlay.png`
- `public/VHS/templates/black-case-front/front-case-underlay.png`
- `public/VHS/templates/black-case-front/front-texture-plastic.png`
- `public/VHS/templates/black-case-front/front-texture-scratches.png`

Legacy backup template assets:

- `public/VHS/templates/front-side-cover-mask2.png`
- `public/VHS/templates/front-side-cover-texture2.png`
- `public/VHS/templates/front-side-cover-highlight2.png`
- `public/VHS/templates/front-side-cover-shadow2.png`
- `public/VHS/templates/front-side-cover-shadow.png`

To rebuild the default black-case template from the purchased PSB:

```bash
python3 scripts/vhs/build_black_case_front_template.py \
  --psb \"/Users/henmee/Downloads/Black VHS Case - Mockup/Mockups/Black VHS Case - FRONT.psb\" \
  --output public/VHS/templates/black-case-front
```

The key point is that we are not editing a PSD smart object in normal runtime.
We are rendering with template geometry + masks/overlays in `sharp`.

## PSD Smart Object Rendering

PSD source is stored at:

- `assets/vhs-mockups/originals/01. Front Side COVER.psd`

Photoshop rendering is optional and only used when explicitly requesting `renderer=photoshop`.
If enabled, the backend expects Adobe Photoshop to be installed on the same machine as the app server. It will:

1. Load the PSD
2. Replace a smart object layer with the cached poster image
3. Export a PNG (optionally converted to WEBP)

If Photoshop is not installed, the endpoint returns an error and you can keep using `renderer=sharp`.
