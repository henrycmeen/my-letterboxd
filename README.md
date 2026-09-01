# VHS Film Club

A film club app built with Next.js that fetches movie data from TMDB and renders VHS-style covers.

## Repository Layout

- `src/`
  Application code (pages, APIs, render logic, UI components)
- `data/`
  Local runtime database and state storage (SQLite + legacy JSON migration source)
- `public/VHS/`
  Runtime-facing static assets (templates, backgrounds, UI images)
- `assets/`
  Source design files and non-runtime asset sources (PSD/PSB)
- `docs/`
  Product and engineering documentation (vision, architecture, references)
- `scripts/`
  Local tooling for template extraction, audits, and prototyping

## What It Does

- Uses a landing page at the base path where the user enters a club code
- Supports multiple club routes (`/filmklubb/default`, `/filmklubb/nasjonalarkivet`)
- Stores each club board separately by `board_id` in SQLite
- Fetches movies from TMDB (`popular`, `top_rated`, `upcoming`, `now_playing`)
- Caches TMDB list/search responses and source image files on disk
- Generates VHS cover images in cache (`.cache/vhs/generated`) and serves them via API
- Persists floor board state (position + score) in local SQLite (`data/club/filmklubb.sqlite`)
- Automatically migrates legacy JSON board state (`data/club-floor-board.json`) into SQLite on first boot
- Uses `sharp` as the primary renderer with a fixed VHS template pipeline
- Supports Photoshop smart-object rendering as an optional local fallback

## Filmklubb programme and voting

The public programme uses one anonymous, signed first-party cookie per browser
profile. IP addresses are not voter identities, so two phones on the same
network can vote independently and the same browser keeps its votes when it
changes network.

Dates and voting rounds live in
`src/data/filmClubProgramme.json`. Each active screening gets its own stable
vote board id (`<club>-<screening>`), which keeps a new film night from
inheriting the previous round's votes. The former IP-based `na` board remains
untouched in SQLite, but the active programme never reads or writes it. To roll
the programme forward with Codex:

1. Read the final aggregate at `/<club>/resultater`.
2. Add that winner and its aggregate counts to the club's `history` array.
3. Change `activeScreening.id` and `activeScreening.scheduledAt` together.
4. Run `pnpm test && pnpm check && pnpm build` before release.

The vote wall itself is a curated catalogue in
`src/data/filmVoteCatalogue.json`; it is not synced automatically from
Letterboxd. Add and remove films by their canonical TMDB ids:

```bash
pnpm catalogue:vote -- --add 299269 --add 62385 --remove 421
```

The command fetches the year, rating, poster and YouTube trailer from TMDB,
appends additions so the existing zero-vote order stays stable, generates the
versioned VHS covers, and removes retired cover files. It rejects films from
the current year because they may not be obtainable yet. The cover sources are
recorded in `scripts/vhs/vote_cover_sources.json`; regenerate them with
`pnpm covers:vote`. Existing files are kept by default; use
`pnpm covers:vote -- --force` only when intentionally replacing the checked-in
covers.

The results route is intentionally unlinked and read-only. It exposes film
ranking, total active votes and participating browser profiles, never voter
keys. A hidden URL is convenience rather than access control; any future write
admin must use real authentication.

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
TMDB_FETCH_TIMEOUT_MS=9000
TMDB_FETCH_RETRIES=2
TMDB_FETCH_RETRY_BASE_MS=300
TMDB_CACHE_MAX_MB=768
TMDB_CACHE_MAX_AGE_DAYS=30
VHS_RENDERER="sharp" # or "photoshop"
VHS_RENDER_CACHE_MAX_MB=2048
VHS_RENDER_CACHE_MAX_AGE_DAYS=45
CLUB_DB_PATH="data/club/filmklubb.sqlite" # optional override
```

3. Start development server

```bash
pnpm dev
```

Pre-deploy sanity check:

```bash
pnpm predeploy
```

## API Endpoints

- `GET|POST /api/club/votes?boardId=...`
  Reads or changes the current browser profile's votes and returns the shared
  ranking.

- `GET /api/club/results?clubSlug=...`
  Returns read-only aggregate ranking, participation and winner history.

- `GET /api/club/movies?listType=popular&limit=12`
  Returns TMDB movie list data for the film club.

- `GET /api/vhs/covers?listType=popular&limit=8&force=false&renderer=sharp&format=webp`
  Generates/returns rendered covers.

- `GET /api/health`
  Lightweight runtime health check for SQLite/cache/TMDB config.

Query params:

- `renderer`: `sharp` or `photoshop`
- `format`: `png` or `webp`
- `templateId`: used by `sharp` renderer (default: `black-case-front-v1`)
- `smartObjectLayerName`: optional preferred smart object layer name for Photoshop renderer
- `force=true`: re-render files even if they already exist

Selected heavy routes are rate-limited per client IP:

- `GET /api/tmdb/search`
- `GET /api/vhs/covers`
- `POST /api/vhs/render`

## Caching

- TMDB list cache: `.cache/tmdb/lists`
- TMDB search cache: `.cache/tmdb/search`
- TMDB poster cache: `.cache/tmdb/images/posters`
- TMDB backdrop cache: `.cache/tmdb/images/backdrops`
- Generated cover cache: `.cache/vhs/generated`
- Generated cover URL base: `/api/vhs/generated/:fileName`
- Floor board persistence: `data/club/filmklubb.sqlite`

Caches are pruned automatically by age + total size thresholds.

## Runtime Storage Layout

The project stores runtime/generated content in three places:

- `.cache/tmdb/*`
  Network cache for TMDB list/search payloads + source images
- `.cache/vhs/generated/*`
  Rendered cover images cache used by the UI via `/api/vhs/generated/:fileName`
- `data/club/filmklubb.sqlite`
  Shared floor board state (positions, score, leader)

This keeps static design assets in `public/VHS/templates` and runtime data in dedicated cache/data roots.

For operational rules and folder ownership, see
`docs/engineering/runtime-image-structure.md`.

## Current Cover Pipeline (`renderer=sharp`)

This is the default flow used by the app right now.

1. Fetch poster/backdrop from TMDB
2. Cache source image on disk (`.cache/tmdb/images/posters` or `.cache/tmdb/images/backdrops`)
3. Resize/crop to the VHS poster slot (cover-fit)
4. Apply template mask (`dest-in`) so the art keeps the same physical cover shape
5. Composite VHS wear layers (texture/highlight/shadow) from `public/VHS/templates`
6. Write final output to `.cache/vhs/generated/*.webp` and expose via `/api/vhs/generated/:fileName`

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
