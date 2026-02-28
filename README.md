# VHS Film Club

A film club app built with Next.js that fetches movie posters from TMDB and renders VHS covers.

## What It Does

- Fetches movies from TMDB (`popular`, `top_rated`, `upcoming`, `now_playing`)
- Caches TMDB list responses and poster image files on disk
- Generates VHS cover images in `public/VHS/generated`
- Supports two renderers:
  - `sharp` (default): geometry/template-based render
  - `photoshop`: replaces a smart object layer in a PSD, then exports

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
- `templateId`: used by `sharp` renderer (`retro-cover-default`, etc)
- `smartObjectLayerName`: optional preferred smart object layer name for Photoshop renderer
- `force=true`: re-render files even if they already exist

## Caching

- TMDB list cache: `.cache/tmdb/lists`
- TMDB poster cache: `.cache/tmdb/posters`
- Generated covers: `public/VHS/generated`

## PSD Smart Object Rendering

PSD source is stored at:

- `assets/vhs-mockups/originals/01. Front Side COVER.psd`

If you use `renderer=photoshop`, the backend expects Adobe Photoshop to be installed locally on the same machine as the app server. It will:

1. Load the PSD
2. Replace a smart object layer with the cached poster image
3. Export a PNG (optionally converted to WEBP)

If Photoshop is not installed, the endpoint returns an error and you can keep using `renderer=sharp`.
