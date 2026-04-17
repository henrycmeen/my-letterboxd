import { type NextPage } from 'next';
import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { withBasePath } from '@/lib/basePath';
import {
  DEFAULT_CLUB_SLUG,
  getBoardIdFromClubSlug,
  getClubHomePath,
  normalizeClubSlug,
} from '@/lib/clubSlug';

interface ClubMovie {
  id: number;
  title: string;
  coverImage: string;
}

interface CoversResponse {
  movies: ClubMovie[];
}

interface SearchMovie {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

interface SearchResponse {
  results: SearchMovie[];
}

type CoverVariant = 'front' | 'spine';
type TmdbImageKind = 'poster' | 'backdrop';

interface TmdbImageOption {
  kind: TmdbImageKind;
  sourceUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  voteAverage: number;
}

interface TmdbImagesResponse {
  movieId: number;
  posters: TmdbImageOption[];
  backdrops: TmdbImageOption[];
}

interface CustomCoverVariantSettings {
  sourceUrl: string;
  sourceKind: TmdbImageKind;
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface MovieCustomCoverSettings {
  front: CustomCoverVariantSettings;
  spine: CustomCoverVariantSettings;
}

interface CustomCoverSettingsStoragePayload {
  movieSettings: Record<string, MovieCustomCoverSettings>;
}

interface CoverEditorState {
  movieId: number;
  movieTitle: string;
  focusVariant: CoverVariant;
  frontImageIndex: number;
  spineImageIndex: number;
  frontOffsetX: number;
  frontOffsetY: number;
  frontScale: number;
  spineOffsetX: number;
  spineOffsetY: number;
  spineScale: number;
  saving: boolean;
}

interface CoverEditorAdjustDragState {
  variant: CoverVariant;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
}

interface FloorBoardMovie {
  id: number;
  title: string;
  coverImage: string;
  x: number;
  y: number;
  rotation: number;
  z: number;
  rank: number;
  score?: number;
}

interface FloorBoardResponse {
  boardId: string;
  version: number;
  updatedAt: string;
  leaderMovieId: number | null;
  movies: FloorBoardMovie[];
}

interface FloorBoardConflictResponse {
  message: string;
  expectedVersion?: number;
  currentVersion?: number;
}

interface FloorMovie extends ClubMovie {
  x: number;
  y: number;
  rotation: number;
  z: number;
  rank: number;
  score: number;
}

interface ShelfMovie {
  id: number;
  title: string;
  coverImage: string;
  frontCoverImage?: string;
}

interface DragState {
  id: number;
  offsetX: number;
  offsetY: number;
  baseRotation: number;
  grabOffsetNormX: number;
  grabOffsetNormY: number;
  lastClientX: number;
  lastClientY: number;
  lastTimestamp: number;
  velocityX: number;
  velocityY: number;
}

interface PendingSearch {
  query: string;
  results: SearchMovie[];
  selectedIndex: number;
  loading: boolean;
}

interface ShelfStoragePayload {
  movies: ShelfMovie[];
}

interface ShelfDragCandidate {
  movie: ShelfMovie;
  startClientX: number;
  startClientY: number;
}

interface CsvTitleQuery {
  title: string;
  year?: number;
}

type SearchPreviewTier = 'low' | 'medium' | 'high';

interface AddAnimationState {
  movie: ClubMovie;
  coverImage: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  toRotation: number;
  stage: 'insert' | 'fly';
}

interface DeleteAnimationState {
  id: number;
  title: string;
  coverImage: string;
  x: number;
  y: number;
  rotation: number;
  z: number;
  splitDirection: 1 | -1;
  stage: 'cut' | 'hold' | 'drop';
  destroyEffect: 'samurai' | 'laser';
}

interface VsPair {
  firstId: number;
  secondId: number;
}

interface ProximityVsCharge {
  pair: VsPair;
  progress: number;
}

interface VsFightState {
  pair: VsPair;
  stage: 'fight' | 'lunge' | 'impact';
  winnerId: number | null;
  loserId: number | null;
  easterEgg: 'sauron-eye' | null;
}

const BASE_CARD_WIDTH = 260;
const BASE_CARD_HEIGHT = 390;
const WAITING_SLOT_IMAGE = withBasePath('/VHS/templates/waiting-cover-vhs-black.webp');
const SEARCH_DEBOUNCE_MS = 90;
const COVER_TEMPLATE_ID = 'black-case-front-v1';
const COVER_RENDER_REVISION = 'r12';
const CARD_ROTATION_MIN = -9;
const CARD_ROTATION_MAX = 9;
const OPEN_EFFECT_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  (process.env.NEXT_PUBLIC_VHS_OPEN_EFFECT ?? '').trim().toLowerCase()
);
const BOARD_SYNC_DEBOUNCE_MS = 240;
const STARTER_MOVIE_LIMIT = 7;
const SEARCH_RESULT_LIMIT = 8;
const SEARCH_PREVIEW_STEPS: Array<{
  tier: SearchPreviewTier;
  size: number;
  quality: number;
}> = [
  { tier: 'low', size: 520, quality: 42 },
  { tier: 'high', size: 1100, quality: 76 },
];
const BASE_ADD_SLOT_HIDDEN_OFFSET = Math.round(BASE_CARD_HEIGHT * 0.72);
const BASE_ADD_SLOT_HOVER_OFFSET = Math.round(BASE_CARD_HEIGHT * 0.4);
const REMOTE_CONTROL_IMAGE = withBasePath('/VHS/ui/remote-control-black-transparent.png');
const VS_BADGE_IMAGE = withBasePath('/VHS/ui/vs-neo-tokyo.svg');
const VHS_FRONT_SIDE_IMAGE = withBasePath('/VHS/Front Side.png');
const FLOOR_BACKGROUND_IMAGE = withBasePath('/VHS/backgrounds/Oak_Veneer_tfjcffgc_4K_BaseColor.jpg');
const GENERATED_COVER_API_PATH = withBasePath('/api/vhs/generated/');
const BASE_COVER_EDITOR_DROP_ZONE_EXTRA = 22;
const COVER_EDITOR_DROP_CYCLE_INTERVAL_MS = 190;
const COVER_EDITOR_DROP_CYCLE_LIMIT = 10;
const COVER_EDITOR_DROP_CYCLE_WARMUP_MS = 140;
const COVER_EDITOR_DROP_CYCLE_RENDER_SIZE = 420;
const COVER_EDITOR_DROP_CYCLE_RENDER_QUALITY = 46;
const COVER_EDITOR_IMAGE_FETCH_LIMIT = 60;
const COVER_RANDOMIZE_POOL_LIMIT = 20;
const COVER_CUSTOM_SETTINGS_STORAGE_KEY =
  'my-letterboxd-floor-cover-custom-settings-v1';
const SHELF_TEMPLATE_ID = 'black-case-spine-v3';
const SHELF_SOURCE_IMAGE_TYPE = 'backdrop';
const SHELF_PLACEHOLDER_IMAGE = withBasePath(
  '/VHS/templates/black-case-spine/spine-placeholder-cover-cropped.webp'
);
const SHELF_STORAGE_KEY = 'my-letterboxd-floor-shelf-v1';
const BASE_SHELF_OPEN_WIDTH = 252;
const BASE_SHELF_SCROLL_WIDTH = BASE_SHELF_OPEN_WIDTH;
const BASE_SHELF_ITEM_WIDTH = 240;
const BASE_SHELF_ITEM_HEIGHT = BASE_CARD_HEIGHT;
const BASE_SHELF_STACK_OVERLAP = BASE_CARD_HEIGHT - 36;
const BASE_SHELF_PEEK_OFFSET = Math.round(BASE_SHELF_OPEN_WIDTH * 0.72);
const BASE_SHELF_DROP_ZONE_EXTRA = 22;
const BASE_SHELF_LIST_TOP_PADDING = 20;
const BASE_SHELF_EXPOSED_STRIP_HEIGHT =
  BASE_SHELF_ITEM_HEIGHT - BASE_SHELF_STACK_OVERLAP;
const BASE_SHELF_SPINE_HITBOX_HEIGHT = BASE_SHELF_EXPOSED_STRIP_HEIGHT;
const SHELF_SPINE_HITBOX_TOP = 0;
const SHELF_SPINE_HITBOX_SIDE_INSET = 0;
const BASE_SHELF_ROW_ART_TOP = Math.round(
  (BASE_SHELF_EXPOSED_STRIP_HEIGHT - BASE_SHELF_ITEM_HEIGHT) / 2
);
const SHELF_SPINE_IMAGE_SCALE = 0.62;
const DRAG_SIDECOVER_IMAGE_SCALE = 0.78;
const BASE_REMOTE_CONTROL_WIDTH = Math.round(BASE_CARD_WIDTH * 0.8);
const BASE_REMOTE_CONTROL_HEIGHT = Math.round((443 / 181) * BASE_REMOTE_CONTROL_WIDTH);
const BASE_REMOTE_VISIBLE_DEFAULT = 280;
const BASE_REMOTE_VISIBLE_PEEK = 340;
const BASE_REMOTE_SLOT_GAP = 14;
const BASE_DELETE_ZONE_HEIGHT = Math.round(BASE_CARD_HEIGHT * 0.24);
const DELETE_HOLD_MS = 950;
const DELETE_CLEAR_ALL_EXTRA_HOLD_MS = 1450;
const DELETE_CLEAR_ALL_STEP_MS = 180;
const DELETE_CUT_MS = 220;
const DELETE_POST_CUT_HOLD_MS = 260;
const DELETE_DROP_MS = 920;
const DELETE_SPLIT_LEFT_PCT = 49;
const DELETE_SPLIT_RIGHT_PCT = 53;
const DELETE_SPLIT_LINE_TOP_PCT = (DELETE_SPLIT_LEFT_PCT + DELETE_SPLIT_RIGHT_PCT) / 2;
const BASE_VS_BADGE_WIDTH = 150;
const BASE_VS_BADGE_HEIGHT = Math.round((361 / 505) * BASE_VS_BADGE_WIDTH);
const TOP_SCORE_TIE_MIN = 100;
const PROXIMITY_VS_HOLD_MS = 2000;
const BASE_PROXIMITY_VS_TRIGGER_RADIUS = 170;
const BASE_PROXIMITY_VS_BREAK_RADIUS = 300;
const BASE_PROXIMITY_VS_PULL_MAX = 18;
const DRAG_GRAB_TILT_MAX = 5.5;
const DRAG_VELOCITY_TILT_MAX = 8.5;
const DRAG_WOBBLE_TILT_MAX = 3;
const DRAG_THROW_ROTATION_MAX = 7;
const DRAG_VELOCITY_SMOOTHING = 0.28;
const DRAG_HIERARCHY_RECALC_INTERVAL_MS = 120;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const clampCardRotation = (rotation: number): number =>
  clamp(rotation, CARD_ROTATION_MIN, CARD_ROTATION_MAX);

const getRandomCardRotation = (): number =>
  CARD_ROTATION_MIN + Math.random() * (CARD_ROTATION_MAX - CARD_ROTATION_MIN);

const getTopScorePercent = (
  topY: number,
  boardHeight: number,
  cardHeight = BASE_CARD_HEIGHT
): number => {
  const maxTop = Math.max(1, boardHeight - cardHeight);
  const normalizedTop = clamp(topY, 0, maxTop);
  const score = (1 - normalizedTop / maxTop) * 100;
  return Math.round(score * 10) / 10;
};

const randomFromSeed = (seed: number): number => {
  const raw = Math.sin(seed * 999.91) * 10000;
  return raw - Math.floor(raw);
};

const createVsPair = (movieAId: number, movieBId: number): VsPair =>
  movieAId < movieBId
    ? { firstId: movieAId, secondId: movieBId }
    : { firstId: movieBId, secondId: movieAId };

const isSameVsPair = (left: VsPair | null, right: VsPair | null): boolean => {
  if (!left || !right) {
    return false;
  }

  return left.firstId === right.firstId && left.secondId === right.secondId;
};

const pairHasMovie = (pair: VsPair | null, movieId: number): boolean =>
  Boolean(pair && (pair.firstId === movieId || pair.secondId === movieId));

const getVsPairKey = (pair: VsPair): string => `${pair.firstId}-${pair.secondId}`;

const hasVsPair = (pairs: VsPair[], candidate: VsPair): boolean =>
  pairs.some((pair) => isSameVsPair(pair, candidate));

const isLordOfTheRingsMovie = (movie: { title: string } | null | undefined): boolean =>
  Boolean(
    movie &&
      /\b(lord of the rings|ringenes herre|fellowship of the ring|two towers|return of the king)\b/i.test(
        movie.title
      )
  );

const getLordOfTheRingsVsResult = (
  movies: FloorMovie[],
  pair: VsPair
): { winnerId: number; loserId: number } | null => {
  const first = movies.find((movie) => movie.id === pair.firstId) ?? null;
  const second = movies.find((movie) => movie.id === pair.secondId) ?? null;
  const firstIsLordOfTheRings = isLordOfTheRingsMovie(first);
  const secondIsLordOfTheRings = isLordOfTheRingsMovie(second);

  if (!first || !second || (!firstIsLordOfTheRings && !secondIsLordOfTheRings)) {
    return null;
  }

  const winnerId = firstIsLordOfTheRings ? first.id : second.id;
  const loserId = winnerId === first.id ? second.id : first.id;

  return { winnerId, loserId };
};

const isSciFiMovie = (movie: { title: string } | null | undefined): boolean =>
  Boolean(
    movie &&
      /\b(2001|akira|alien|aliens|arrival|blade runner|dune|ex machina|ghost in the shell|interstellar|matrix|moon|predator|robocop|space odyssey|star trek|star wars|terminator|the thing|total recall|tron)\b/i.test(
        movie.title
      )
  );

const getSearchPreviewStep = (tier: SearchPreviewTier) =>
  SEARCH_PREVIEW_STEPS.find((step) => step.tier === tier) ??
  SEARCH_PREVIEW_STEPS[0]!;

const getSearchPreviewTierIndex = (tier?: SearchPreviewTier): number =>
  tier ? SEARCH_PREVIEW_STEPS.findIndex((step) => step.tier === tier) : -1;

const getSearchMovieSourceImage = (movie: SearchMovie): string | null =>
  movie.posterUrl ?? movie.backdropUrl ?? null;

const toCustomSettingsRecord = (
  movieSettings: Record<string, MovieCustomCoverSettings>
): Record<number, MovieCustomCoverSettings> => {
  const output: Record<number, MovieCustomCoverSettings> = {};
  for (const [key, value] of Object.entries(movieSettings)) {
    const movieId = Number(key);
    if (!Number.isFinite(movieId) || movieId <= 0) {
      continue;
    }
    output[Math.floor(movieId)] = value;
  }

  return output;
};

const toCustomSettingsStorageRecord = (
  movieSettings: Record<number, MovieCustomCoverSettings>
): Record<string, MovieCustomCoverSettings> => {
  const output: Record<string, MovieCustomCoverSettings> = {};
  for (const [rawMovieId, value] of Object.entries(movieSettings)) {
    output[String(rawMovieId)] = value;
  }

  return output;
};

const getCustomVariantSettingsHash = (
  settings: CustomCoverVariantSettings
): string =>
  `${settings.sourceKind}|${settings.sourceUrl}|${Math.round(
    settings.offsetX
  )}|${Math.round(settings.offsetY)}|${settings.scale.toFixed(4)}`;

const isWaitingSlotCover = (coverImage: string): boolean =>
  coverImage.includes('waiting-cover-vhs-black.webp') ||
  coverImage.includes('waiting-cover-vhs.webp') ||
  coverImage.includes('waiting-cover-white.svg') ||
  coverImage.includes('front-placeholder-cover') ||
  coverImage.includes('front-side-cover-flat.webp');

const isBlobCoverImage = (coverImage: string): boolean =>
  coverImage.startsWith('blob:');

const isGeneratedCoverPath = (coverImage: string): boolean =>
  coverImage.includes('/VHS/generated/') ||
  coverImage.includes('/api/vhs/generated/') ||
  coverImage.includes(GENERATED_COVER_API_PATH);

const getCoverPathName = (coverImage: string): string => {
  try {
    return new URL(coverImage, 'http://local.invalid').pathname;
  } catch {
    return coverImage.split(/[?#]/)[0] ?? coverImage;
  }
};

const getGeneratedCoverFileName = (coverImage: string): string | null => {
  const generatedApiMarker = '/api/vhs/generated/';
  const generatedStaticMarker = '/VHS/generated/';
  const marker = coverImage.includes(generatedApiMarker)
    ? generatedApiMarker
    : coverImage.includes(generatedStaticMarker)
      ? generatedStaticMarker
      : null;

  if (!marker) {
    return null;
  }

  const markerIndex = coverImage.indexOf(marker);
  const rawFileName = coverImage
    .slice(markerIndex + marker.length)
    .split(/[?#]/)[0]
    ?.split('/')
    .pop();

  if (!rawFileName) {
    return null;
  }

  try {
    return decodeURIComponent(rawFileName);
  } catch {
    return rawFileName;
  }
};

const getNormalizedGeneratedCoverPath = (coverImage: string): string | null => {
  const fileName = getGeneratedCoverFileName(coverImage);

  if (!fileName) {
    return null;
  }

  return withBasePath(`/api/vhs/generated/${encodeURIComponent(fileName)}`);
};

const isCurrentGeneratedCoverPath = (coverImage: string): boolean =>
  isGeneratedCoverPath(coverImage) &&
  getCoverPathName(coverImage).startsWith(GENERATED_COVER_API_PATH) &&
  coverImage.includes(`-${COVER_TEMPLATE_ID}-`) &&
  coverImage.includes(`-${COVER_RENDER_REVISION}-`);

const shouldHydrateBoardCover = (coverImage: string): boolean =>
  isWaitingSlotCover(coverImage) ||
  isBlobCoverImage(coverImage) ||
  ((coverImage.startsWith('http://') || coverImage.startsWith('https://')) &&
    !isCurrentGeneratedCoverPath(coverImage)) ||
  (isGeneratedCoverPath(coverImage) && !isCurrentGeneratedCoverPath(coverImage));

const normalizeCoverImage = (coverImage: string): string => {
  if (shouldHydrateBoardCover(coverImage)) {
    return WAITING_SLOT_IMAGE;
  }

  return getNormalizedGeneratedCoverPath(coverImage) ?? coverImage;
};

const getStableCoverImage = (coverImage?: string): string | undefined => {
  if (typeof coverImage !== 'string' || coverImage.length === 0) {
    return undefined;
  }

  return shouldHydrateBoardCover(coverImage)
    ? undefined
    : getNormalizedGeneratedCoverPath(coverImage) ?? coverImage;
};

const normalizePersistedBoardCoverImage = (coverImage: string): string =>
  shouldHydrateBoardCover(coverImage)
    ? WAITING_SLOT_IMAGE
    : getNormalizedGeneratedCoverPath(coverImage) ?? coverImage;

const isCoversResponse = (value: unknown): value is CoversResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movies?: unknown };
  if (!Array.isArray(payload.movies)) {
    return false;
  }

  return payload.movies.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as { id?: unknown; title?: unknown; coverImage?: unknown };
    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      typeof entry.coverImage === 'string'
    );
  });
};

const isSearchResponse = (value: unknown): value is SearchResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { results?: unknown };
  if (!Array.isArray(payload.results)) {
    return false;
  }

  return payload.results.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as {
      id?: unknown;
      title?: unknown;
      year?: unknown;
      posterUrl?: unknown;
      backdropUrl?: unknown;
    };

    const yearValid =
      typeof entry.year === 'number' || entry.year === null || entry.year === undefined;
    const posterValid =
      typeof entry.posterUrl === 'string' || entry.posterUrl === null || entry.posterUrl === undefined;
    const backdropValid =
      typeof entry.backdropUrl === 'string' ||
      entry.backdropUrl === null ||
      entry.backdropUrl === undefined;

    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      yearValid &&
      posterValid &&
      backdropValid
    );
  });
};

const isTmdbImageOption = (value: unknown): value is TmdbImageOption => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<TmdbImageOption>;
  return (
    (entry.kind === 'poster' || entry.kind === 'backdrop') &&
    typeof entry.sourceUrl === 'string' &&
    typeof entry.previewUrl === 'string' &&
    typeof entry.width === 'number' &&
    typeof entry.height === 'number' &&
    typeof entry.voteAverage === 'number'
  );
};

const isTmdbImagesResponse = (value: unknown): value is TmdbImagesResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<TmdbImagesResponse>;
  return (
    typeof payload.movieId === 'number' &&
    Array.isArray(payload.posters) &&
    Array.isArray(payload.backdrops) &&
    payload.posters.every(isTmdbImageOption) &&
    payload.backdrops.every(isTmdbImageOption)
  );
};

const isCustomCoverVariantSettings = (
  value: unknown
): value is CustomCoverVariantSettings => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<CustomCoverVariantSettings>;
  return (
    (entry.sourceKind === 'poster' || entry.sourceKind === 'backdrop') &&
    typeof entry.sourceUrl === 'string' &&
    typeof entry.offsetX === 'number' &&
    typeof entry.offsetY === 'number' &&
    typeof entry.scale === 'number'
  );
};

const isMovieCustomCoverSettings = (
  value: unknown
): value is MovieCustomCoverSettings => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<MovieCustomCoverSettings>;
  return (
    isCustomCoverVariantSettings(payload.front) &&
    isCustomCoverVariantSettings(payload.spine)
  );
};

const isCustomCoverSettingsStoragePayload = (
  value: unknown
): value is CustomCoverSettingsStoragePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movieSettings?: unknown };
  if (!payload.movieSettings || typeof payload.movieSettings !== 'object') {
    return false;
  }

  return Object.values(payload.movieSettings).every(isMovieCustomCoverSettings);
};

const isFloorBoardResponse = (value: unknown): value is FloorBoardResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movies?: unknown };
  if (!Array.isArray(payload.movies)) {
    return false;
  }

  return payload.movies.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as Partial<FloorBoardMovie>;
    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      typeof entry.coverImage === 'string' &&
      typeof entry.x === 'number' &&
      typeof entry.y === 'number' &&
      typeof entry.rotation === 'number'
    );
  });
};

const isShelfStoragePayload = (value: unknown): value is ShelfStoragePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movies?: unknown };
  if (!Array.isArray(payload.movies)) {
    return false;
  }

  return payload.movies.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as Partial<ShelfMovie>;
    const frontCoverValid =
      entry.frontCoverImage === undefined ||
      typeof entry.frontCoverImage === 'string';
    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      typeof entry.coverImage === 'string' &&
      frontCoverValid
    );
  });
};

const CURATED_TITLES_QUERY = [
  'Blade Runner::1982',
  'The Lord of the Rings: The Fellowship of the Ring::2001',
  '2001: A Space Odyssey::1968',
  'Star Wars::1977',
  'Indiana Jones and the Temple of Doom::1984',
  'Spider-Man::2002',
  'Back to the Future::1985',
].join('|');

const SHELF_STARTER_TITLES_QUERY = [
  'Alien::1979',
  'The Matrix::1999',
  'Akira::1988',
  'The Thing::1982',
  'Heat::1995',
  'Ghost in the Shell::1995',
].join('|');

const CSV_IMPORT_BATCH_SIZE = 12;
const CSV_IMPORT_ROW_LIMIT = 300;

const splitCsvRows = (content: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      if (inQuotes && content[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && content[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = '';
      const normalizedRow = currentRow.map((value) => value.trim());
      if (normalizedRow.some((value) => value.length > 0)) {
        rows.push(normalizedRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  const normalizedRow = currentRow.map((value) => value.trim());
  if (normalizedRow.some((value) => value.length > 0)) {
    rows.push(normalizedRow);
  }

  return rows;
};

const normalizeCsvHeader = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const parseCsvTitleQueries = (content: string): CsvTitleQuery[] => {
  const rows = splitCsvRows(content);
  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map(normalizeCsvHeader);
  const titleHeaderCandidates = [
    'name',
    'title',
    'movietitle',
    'filmtitle',
    'movie',
    'film',
  ];
  const yearHeaderCandidates = ['year', 'releaseyear'];
  const titleIndex = headers.findIndex((header) =>
    titleHeaderCandidates.includes(header)
  );
  const yearIndex = headers.findIndex((header) =>
    yearHeaderCandidates.includes(header)
  );

  const dataRows = titleIndex >= 0 ? rows.slice(1) : rows;
  const fallbackTitleIndex = titleIndex >= 0 ? titleIndex : 0;
  const seen = new Set<string>();
  const parsed: CsvTitleQuery[] = [];

  for (const row of dataRows) {
    const rawTitle = (row[fallbackTitleIndex] ?? '').replace(/\s+/g, ' ').trim();
    if (!rawTitle) {
      continue;
    }

    const rawYear = yearIndex >= 0 ? row[yearIndex] ?? '' : '';
    const yearNumber = Number(rawYear);
    const year =
      Number.isFinite(yearNumber) && yearNumber >= 1880 && yearNumber <= 2100
        ? Math.round(yearNumber)
        : undefined;

    const dedupeKey = `${rawTitle.toLowerCase()}::${year ?? ''}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    parsed.push({ title: rawTitle, year });
    if (parsed.length >= CSV_IMPORT_ROW_LIMIT) {
      break;
    }
  }

  return parsed;
};

const toTitlesQueryValue = (queries: CsvTitleQuery[]): string =>
  queries
    .map((query) => {
      const safeTitle = query.title.replace(/\|/g, ' ').replace(/::/g, ':');
      return query.year ? `${safeTitle}::${query.year}` : safeTitle;
    })
    .join('|');

const recalculateHierarchy = (
  items: FloorMovie[],
  boardHeight = 760
): FloorMovie[] => {
  if (items.length === 0) {
    return [];
  }

  const sortedByY = [...items].sort((a, b) => a.y - b.y);
  const rankById = new Map(sortedByY.map((movie, index) => [movie.id, index + 1]));
  const total = sortedByY.length;

  return items.map((movie) => {
    const rank = rankById.get(movie.id) ?? total;

    return {
      ...movie,
      rank,
      z: total - rank + 1,
      score: getTopScorePercent(movie.y, boardHeight),
    };
  });
};

const toBoardMoviesPayload = (movies: FloorMovie[]) =>
  movies.map((movie) => ({
    id: movie.id,
    title: movie.title,
    coverImage: normalizePersistedBoardCoverImage(movie.coverImage),
    x: movie.x,
    y: movie.y,
    rotation: clampCardRotation(movie.rotation),
    score: movie.score,
  }));

const buildBoardSignature = (
  boardMovies: ReturnType<typeof toBoardMoviesPayload>
): string =>
  JSON.stringify(
    boardMovies.map((movie) => [
      movie.id,
      movie.coverImage,
      Math.round(movie.x),
      Math.round(movie.y),
      Math.round(movie.rotation * 10) / 10,
      Math.round(movie.score * 10) / 10,
    ])
  );

const isFloorBoardConflictResponse = (
  value: unknown
): value is FloorBoardConflictResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<FloorBoardConflictResponse>;
  const expectedValid =
    payload.expectedVersion === undefined ||
    (typeof payload.expectedVersion === 'number' &&
      Number.isFinite(payload.expectedVersion));
  const currentValid =
    payload.currentVersion === undefined ||
    (typeof payload.currentVersion === 'number' &&
      Number.isFinite(payload.currentVersion));

  return typeof payload.message === 'string' && expectedValid && currentValid;
};

interface FilmClubPageProps {
  clubSlug?: string;
}

export const FloorScreen = ({
  clubSlug = DEFAULT_CLUB_SLUG,
}: FilmClubPageProps) => {
  const normalizedClubSlug = normalizeClubSlug(clubSlug);
  const boardId = getBoardIdFromClubSlug(normalizedClubSlug);
  const tvPath = withBasePath(getClubHomePath(normalizedClubSlug));
  const [sourceMovies, setSourceMovies] = useState<ClubMovie[]>([]);
  const [floorMovies, setFloorMovies] = useState<FloorMovie[]>([]);
  const [shelfMovies, setShelfMovies] = useState<ShelfMovie[]>([]);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 800 });
  const [isInitialBoardLoaded, setIsInitialBoardLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [isShelfDropActive, setIsShelfDropActive] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<PendingSearch | null>(null);
  const [addAnimation, setAddAnimation] = useState<AddAnimationState | null>(null);
  const [isAddSlotPeek, setIsAddSlotPeek] = useState(false);
  const [isRemotePeek, setIsRemotePeek] = useState(false);
  const [isAddSlotResetAnimating, setIsAddSlotResetAnimating] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<number | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [deleteClearAllArmedId, setDeleteClearAllArmedId] = useState<number | null>(
    null
  );
  const [isDeleteClearAllSequenceActive, setIsDeleteClearAllSequenceActive] =
    useState(false);
  const [deleteAnimation, setDeleteAnimation] = useState<DeleteAnimationState | null>(
    null
  );
  const [previewCoverByMovieId, setPreviewCoverByMovieId] = useState<
    Record<number, string>
  >({});
  const [previewTierByMovieId, setPreviewTierByMovieId] = useState<
    Record<number, SearchPreviewTier>
  >({});
  const [activeSearchCover, setActiveSearchCover] = useState<string | null>(null);
  const [resolvingVsPairByKey, setResolvingVsPairByKey] = useState<
    Record<string, true>
  >({});
  const [proximityVsPairs, setProximityVsPairs] = useState<VsPair[]>([]);
  const [proximityVsCharge, setProximityVsCharge] =
    useState<ProximityVsCharge | null>(null);
  const [vsFightByKey, setVsFightByKey] = useState<Record<string, VsFightState>>({});
  const [isShelfHovered, setIsShelfHovered] = useState(false);
  const [isMobileShelfOpen, setIsMobileShelfOpen] = useState(false);
  const [hoveredShelfMovieId, setHoveredShelfMovieId] = useState<number | null>(null);
  const [shelfRecentlyInsertedMovieId, setShelfRecentlyInsertedMovieId] = useState<
    number | null
  >(null);
  const [shelfDropInsertIndex, setShelfDropInsertIndex] = useState<number | null>(null);
  const [shelfPreviewCoverByMovieId, setShelfPreviewCoverByMovieId] = useState<
    Record<number, string>
  >({});
  const [isCoverEditorDropActive, setIsCoverEditorDropActive] = useState(false);
  const [customCoverSettingsByMovieId, setCustomCoverSettingsByMovieId] = useState<
    Record<number, MovieCustomCoverSettings>
  >({});
  const [coverEditor, setCoverEditor] = useState<CoverEditorState | null>(null);
  const [coverEditorImageOptions] = useState<TmdbImageOption[]>([]);
  const [coverEditorImagesLoading] = useState(false);
  const [coverEditorError, setCoverEditorError] = useState<string | null>(null);
  const [coverEditorFrontPreview, setCoverEditorFrontPreview] = useState<string | null>(
    null
  );
  const [coverEditorSpinePreview, setCoverEditorSpinePreview] = useState<string | null>(
    null
  );
  const [coverEditorDropCycleImage, setCoverEditorDropCycleImage] = useState<
    string | null
  >(null);
  const [coverEditorDidEnter, setCoverEditorDidEnter] = useState(false);
  const [coverEditorReturnMovieId, setCoverEditorReturnMovieId] = useState<number | null>(
    null
  );

  const floorRef = useRef<HTMLDivElement | null>(null);
  const shelfScrollRef = useRef<HTMLDivElement | null>(null);
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragPointerPositionRef = useRef<{ clientX: number; clientY: number } | null>(
    null
  );
  const dragPointerRafRef = useRef<number | null>(null);
  const dragHierarchyLastRecalcRef = useRef(0);
  const floorMoviesRef = useRef<FloorMovie[]>([]);
  const sourceMoviesRef = useRef<ClubMovie[]>([]);
  const shelfMoviesRef = useRef<ShelfMovie[]>([]);
  const leaderIdRef = useRef<number | null>(null);
  const animationTimersRef = useRef<number[]>([]);
  const addSlotResetRafRef = useRef<number | null>(null);
  const boardSyncTimerRef = useRef<number | null>(null);
  const lastBoardSignatureRef = useRef<string>('');
  const restoredFromBoardRef = useRef(false);
  const previewCoverByMovieIdRef = useRef<Record<number, string>>({});
  const previewTierByMovieIdRef = useRef<Record<number, SearchPreviewTier>>({});
  const deleteCandidateIdRef = useRef<number | null>(null);
  const deleteArmedIdRef = useRef<number | null>(null);
  const deleteHoldTimerRef = useRef<number | null>(null);
  const deleteHoldMovieIdRef = useRef<number | null>(null);
  const deleteClearAllArmedIdRef = useRef<number | null>(null);
  const deleteClearAllTimerRef = useRef<number | null>(null);
  const deleteClearAllMovieIdRef = useRef<number | null>(null);
  const deleteClearAllSequenceTimerRef = useRef<number | null>(null);
  const deleteInZoneRef = useRef(false);
  const deleteCutTimerRef = useRef<number | null>(null);
  const deleteDropTimerRef = useRef<number | null>(null);
  const deleteCleanupTimerRef = useRef<number | null>(null);
  const resolvingVsPairByKeyRef = useRef<Record<string, true>>({});
  const vsFightByKeyRef = useRef<Record<string, VsFightState>>({});
  const vsFightTimersRef = useRef<number[]>([]);
  const proximityVsPairsRef = useRef<VsPair[]>([]);
  const proximityVsCandidatePairRef = useRef<VsPair | null>(null);
  const proximityVsHoldTimerRef = useRef<number | null>(null);
  const proximityVsChargeRafRef = useRef<number | null>(null);
  const renderedCoverPromiseByMovieIdRef = useRef<
    Record<number, Promise<ClubMovie | null>>
  >({});
  const boardVersionRef = useRef<number | null>(null);
  const isShelfDropActiveRef = useRef(false);
  const isCoverEditorDropActiveRef = useRef(false);
  const shelfDropInsertIndexRef = useRef<number | null>(null);
  const moveMovieToShelfRef = useRef<
    ((movieId: number, insertIndex?: number) => void) | null
  >(null);
  const randomizeMovieCoverPairRef = useRef<((movieId: number) => void) | null>(null);
  const beginDragFromShelfRef = useRef<
    ((movie: ShelfMovie, pointerEvent: PointerEvent) => void) | null
  >(null);
  const restoreMovieFromShelfRef = useRef<
    ((movieId: number, clientX?: number, clientY?: number) => void) | null
  >(null);
  const renderedSpineCoverPromiseByMovieIdRef = useRef<
    Record<number, Promise<ClubMovie | null>>
  >({});
  const customCoverSettingsByMovieIdRef = useRef<
    Record<number, MovieCustomCoverSettings>
  >({});
  const customFrontCoverCacheRef = useRef<
    Record<number, { hash: string; coverImage: string }>
  >({});
  const customSpineCoverCacheRef = useRef<
    Record<number, { hash: string; coverImage: string }>
  >({});
  const customFrontCoverPromiseRef = useRef<
    Record<number, { hash: string; promise: Promise<string | null> }>
  >({});
  const customSpineCoverPromiseRef = useRef<
    Record<number, { hash: string; promise: Promise<string | null> }>
  >({});
  const coverEditorImageOptionsCacheRef = useRef<Record<number, TmdbImageOption[]>>(
    {}
  );
  const coverEditorDropCycleTimerRef = useRef<number | null>(null);
  const coverEditorDropCycleAbortRef = useRef<AbortController | null>(null);
  const coverEditorDropCycleMovieIdRef = useRef<number | null>(null);
  const coverEditorDropCycleIndexRef = useRef(0);
  const coverEditorDropCyclePoolRef = useRef<string[]>([]);
  const coverEditorDropCycleRenderedCacheRef = useRef<Record<string, string>>({});
  const randomizeMovieCoverInFlightRef = useRef<Record<number, true>>({});
  const coverEditorAdjustDragRef = useRef<CoverEditorAdjustDragState | null>(null);
  const coverEditorEnterRafRef = useRef<number | null>(null);
  const coverEditorReturnTimerRef = useRef<number | null>(null);
  const shelfDragCandidateRef = useRef<ShelfDragCandidate | null>(null);
  const csvImportInFlightRef = useRef(false);

  const layoutScale = clamp(
    Math.min(viewportSize.width / 580, viewportSize.height / 900),
    0.62,
    1
  );
  const isCompactPhoneLayout = viewportSize.width <= 680;
  const CARD_WIDTH = Math.round(BASE_CARD_WIDTH * layoutScale);
  const CARD_HEIGHT = Math.round(BASE_CARD_HEIGHT * layoutScale);
  const floorWidth = Math.max(viewportSize.width, CARD_WIDTH);
  const floorHeight = Math.max(viewportSize.height, CARD_HEIGHT);
  const ADD_SLOT_HIDDEN_OFFSET = Math.round(BASE_ADD_SLOT_HIDDEN_OFFSET * layoutScale);
  const ADD_SLOT_HOVER_OFFSET = Math.round(BASE_ADD_SLOT_HOVER_OFFSET * layoutScale);
  const COVER_EDITOR_DROP_ZONE_EXTRA = Math.max(
    14,
    Math.round(BASE_COVER_EDITOR_DROP_ZONE_EXTRA * layoutScale)
  );
  const SHELF_OPEN_WIDTH = Math.round(BASE_SHELF_OPEN_WIDTH * layoutScale);
  const SHELF_SCROLL_WIDTH = Math.round(BASE_SHELF_SCROLL_WIDTH * layoutScale);
  const SHELF_ITEM_WIDTH = Math.round(BASE_SHELF_ITEM_WIDTH * layoutScale);
  const SHELF_ITEM_HEIGHT = CARD_HEIGHT;
  const SHELF_STACK_OVERLAP = Math.max(18, Math.round(BASE_SHELF_STACK_OVERLAP * layoutScale));
  const SHELF_PEEK_OFFSET = Math.round(BASE_SHELF_PEEK_OFFSET * layoutScale);
  const SHELF_DROP_ZONE_EXTRA = Math.max(
    14,
    Math.round(BASE_SHELF_DROP_ZONE_EXTRA * layoutScale)
  );
  const SHELF_LIST_TOP_PADDING = Math.round(BASE_SHELF_LIST_TOP_PADDING * layoutScale);
  const SHELF_EXPOSED_STRIP_HEIGHT = Math.max(18, SHELF_ITEM_HEIGHT - SHELF_STACK_OVERLAP);
  const SHELF_SPINE_HITBOX_HEIGHT = SHELF_EXPOSED_STRIP_HEIGHT;
  const SHELF_ROW_ART_TOP = Math.round(
    (SHELF_EXPOSED_STRIP_HEIGHT - SHELF_ITEM_HEIGHT) / 2
  );
  const MOBILE_SHELF_PEEK_HEIGHT = Math.max(76, Math.round(88 * layoutScale));
  const MOBILE_SHELF_OPEN_HEIGHT = Math.max(138, Math.round(176 * layoutScale));
  const MOBILE_SHELF_ITEM_LENGTH = Math.max(132, Math.round(CARD_HEIGHT * 0.54));
  const MOBILE_SHELF_ITEM_HEIGHT = Math.max(
    42,
    Math.round(SHELF_EXPOSED_STRIP_HEIGHT * 1.18)
  );
  const MOBILE_SHELF_SIDE_PADDING = Math.max(12, Math.round(14 * layoutScale));
  const MOBILE_SHELF_ITEM_GAP = Math.max(10, Math.round(12 * layoutScale));
  const MOBILE_SHELF_HANDLE_WIDTH = Math.max(68, Math.round(84 * layoutScale));
  const MOBILE_SHELF_BOTTOM_CLEARANCE = isCompactPhoneLayout
    ? MOBILE_SHELF_OPEN_HEIGHT + Math.max(12, Math.round(16 * layoutScale))
    : 0;
  const REMOTE_CONTROL_WIDTH = Math.round(BASE_REMOTE_CONTROL_WIDTH * layoutScale);
  const REMOTE_CONTROL_HEIGHT = Math.round(BASE_REMOTE_CONTROL_HEIGHT * layoutScale);
  const REMOTE_VISIBLE_DEFAULT = Math.max(
    48,
    Math.round(BASE_REMOTE_VISIBLE_DEFAULT * layoutScale)
  );
  const REMOTE_VISIBLE_PEEK = Math.max(88, Math.round(BASE_REMOTE_VISIBLE_PEEK * layoutScale));
  const REMOTE_SLOT_GAP = Math.max(8, Math.round(BASE_REMOTE_SLOT_GAP * layoutScale));
  const DELETE_ZONE_HEIGHT = Math.max(30, Math.round(BASE_DELETE_ZONE_HEIGHT * layoutScale));
  const VS_BADGE_WIDTH = Math.round(BASE_VS_BADGE_WIDTH * layoutScale);
  const VS_BADGE_HEIGHT = Math.round(BASE_VS_BADGE_HEIGHT * layoutScale);
  const PROXIMITY_VS_TRIGGER_RADIUS = Math.max(
    120,
    Math.round(BASE_PROXIMITY_VS_TRIGGER_RADIUS * layoutScale)
  );
  const PROXIMITY_VS_BREAK_RADIUS = Math.max(
    210,
    Math.round(BASE_PROXIMITY_VS_BREAK_RADIUS * layoutScale)
  );
  const PROXIMITY_VS_PULL_MAX = BASE_PROXIMITY_VS_PULL_MAX * layoutScale;

  useEffect(() => {
    const updateViewportSize = () => {
      const viewport = window.visualViewport;
      setViewportSize({
        width: Math.round(viewport?.width ?? window.innerWidth),
        height: Math.round(viewport?.height ?? window.innerHeight),
      });
    };

    updateViewportSize();
    const viewport = window.visualViewport;
    window.addEventListener('resize', updateViewportSize);
    viewport?.addEventListener('resize', updateViewportSize);

    return () => {
      window.removeEventListener('resize', updateViewportSize);
      viewport?.removeEventListener('resize', updateViewportSize);
    };
  }, []);

  useEffect(() => {
    if (!isCompactPhoneLayout && isMobileShelfOpen) {
      setIsMobileShelfOpen(false);
    }
  }, [isCompactPhoneLayout, isMobileShelfOpen]);

  useEffect(() => {
    if ((pendingSearch || coverEditor) && isMobileShelfOpen) {
      setIsMobileShelfOpen(false);
    }
  }, [coverEditor, isMobileShelfOpen, pendingSearch]);

  const getFloorBounds = useCallback(() => {
    const rect = floorRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        left: 0,
        top: 0,
        width: 1200,
        height: 760,
      };
    }

    return rect;
  }, []);

  const getEmptySlotPosition = useCallback(() => {
    const bounds = getFloorBounds();
    const rightInset = isCompactPhoneLayout
      ? Math.max(14, Math.round(18 * layoutScale))
      : 28;
    const bottomInset = 24 + MOBILE_SHELF_BOTTOM_CLEARANCE;
    return {
      x: clamp(
        bounds.width - CARD_WIDTH - rightInset,
        0,
        Math.max(0, bounds.width - CARD_WIDTH)
      ),
      y: clamp(
        bounds.height - CARD_HEIGHT - bottomInset,
        0,
        Math.max(0, bounds.height - CARD_HEIGHT)
      ),
    };
  }, [
    CARD_HEIGHT,
    CARD_WIDTH,
    MOBILE_SHELF_BOTTOM_CLEARANCE,
    getFloorBounds,
    isCompactPhoneLayout,
    layoutScale,
  ]);

  const updateShelfDropInsertIndex = useCallback((next: number | null) => {
    if (shelfDropInsertIndexRef.current === next) {
      return;
    }

    shelfDropInsertIndexRef.current = next;
    setShelfDropInsertIndex(next);
  }, []);

  const getShelfDropInsertIndexFromPointer = useCallback(
    (clientX: number, clientY: number): number => {
    const totalMovies = shelfMoviesRef.current.length;
    if (totalMovies <= 0) {
      return 0;
    }

    const scrollElement = shelfScrollRef.current;
    if (!scrollElement) {
      return 0;
    }

      const scrollRect = scrollElement.getBoundingClientRect();

      if (isCompactPhoneLayout) {
        const step = MOBILE_SHELF_ITEM_LENGTH + MOBILE_SHELF_ITEM_GAP;
        const relativeX =
          clientX - scrollRect.left + scrollElement.scrollLeft - MOBILE_SHELF_SIDE_PADDING;
        const rawIndex = Math.round(relativeX / step);
        return clamp(rawIndex, 0, totalMovies);
      }

      const step = SHELF_EXPOSED_STRIP_HEIGHT;
      const relativeY =
        clientY - scrollRect.top + scrollElement.scrollTop - SHELF_LIST_TOP_PADDING;
      const rawIndex = Math.round(relativeY / step);

      return clamp(rawIndex, 0, totalMovies);
    },
    [
      isCompactPhoneLayout,
      MOBILE_SHELF_ITEM_GAP,
      MOBILE_SHELF_ITEM_LENGTH,
      MOBILE_SHELF_SIDE_PADDING,
    ]
  );

  const addMovieToFloor = useCallback(
    (movie: ClubMovie, x: number, y: number, rotationOverride?: number) => {
      const bounds = getFloorBounds();
      const clampedX = clamp(x, 0, Math.max(0, bounds.width - CARD_WIDTH));
      const clampedY = clamp(y, 0, Math.max(0, bounds.height - CARD_HEIGHT));

      setFloorMovies((previous) => {
        const existing = previous.find((item) => item.id === movie.id);
        const nextRotation = clampCardRotation(
          existing?.rotation ?? rotationOverride ?? getRandomCardRotation()
        );
        const maxZ = previous.reduce((current, item) => Math.max(current, item.z), 1);

        const next = existing
          ? previous.map((item) =>
              item.id === movie.id
                ? {
                    ...item,
                    x: clampedX,
                    y: clampedY,
                    rotation: clampCardRotation(rotationOverride ?? item.rotation),
                    z: maxZ + 1,
                  }
                : item
            )
          : [
              ...previous,
              {
                ...movie,
                x: clampedX,
                y: clampedY,
                rotation: nextRotation,
                z: maxZ + 1,
                rank: previous.length + 1,
                score: 0,
              },
            ];

        return recalculateHierarchy(next, bounds.height);
      });
    },
    [getFloorBounds]
  );

  const layoutMovies = useCallback(
    (movies: ClubMovie[]) => {
      if (movies.length === 0) {
        setFloorMovies([]);
        return;
      }

      const bounds = getFloorBounds();
      const centerX = bounds.width * 0.5;
      const centerY = bounds.height * 0.42;
      const spreadX = Math.min(bounds.width * 0.38, 520);
      const spreadY = Math.min(bounds.height * 0.26, 240);
      const maxIndex = Math.max(1, movies.length - 1);

      const seeded: FloorMovie[] = movies.map((movie, index) => ({
        ...movie,
        x: clamp(
          centerX +
            ((index / maxIndex) * 2 - 1) * spreadX +
            (randomFromSeed(movie.id + 11) - 0.5) * 180 -
            CARD_WIDTH / 2,
          0,
          Math.max(0, bounds.width - CARD_WIDTH)
        ),
        y: clamp(
          centerY +
            Math.abs((index / maxIndex) * 2 - 1) * spreadY * 0.65 +
            (randomFromSeed(movie.id + 29) - 0.5) * 120 -
            CARD_HEIGHT / 2,
          0,
          Math.max(0, bounds.height - CARD_HEIGHT)
        ),
        rotation:
          CARD_ROTATION_MIN +
          randomFromSeed(movie.id + 71) * (CARD_ROTATION_MAX - CARD_ROTATION_MIN),
        z: index + 1,
        rank: index + 1,
        score: 0,
      }));

      setFloorMovies(recalculateHierarchy(seeded, bounds.height));
    },
    [getFloorBounds]
  );

  useEffect(() => {
    let ignore = false;

    const loadMovies = async () => {
      try {
        const boardResponse = await fetch(withBasePath(`/api/club/floor?boardId=${boardId}`));
        if (boardResponse.ok) {
          const boardRaw: unknown = await boardResponse.json();
          if (isFloorBoardResponse(boardRaw) && !ignore) {
            boardVersionRef.current = boardRaw.version;
            if (boardRaw.movies.length > 0) {
              const bounds = getFloorBounds();
              const restoredMovies = recalculateHierarchy(
                boardRaw.movies.map((movie) => ({
                  id: movie.id,
                  title: movie.title,
                  coverImage: normalizeCoverImage(movie.coverImage),
                  x: movie.x,
                  y: movie.y,
                  rotation: clampCardRotation(movie.rotation),
                  z: movie.z ?? 1,
                  rank: movie.rank ?? 1,
                  score: movie.score ?? getTopScorePercent(movie.y, bounds.height, CARD_HEIGHT),
                })),
                bounds.height
              );

              const signature = buildBoardSignature(toBoardMoviesPayload(restoredMovies));
              lastBoardSignatureRef.current = signature;
              restoredFromBoardRef.current = true;
              setFloorMovies(restoredMovies);
              setSourceMovies(
                boardRaw.movies.map((movie) => ({
                  id: movie.id,
                  title: movie.title,
                  coverImage: normalizeCoverImage(movie.coverImage),
                }))
              );

              const placeholderMovieIds = boardRaw.movies
                .filter((movie) => shouldHydrateBoardCover(movie.coverImage))
                .map((movie) => movie.id);

              if (placeholderMovieIds.length > 0) {
                for (const movieId of placeholderMovieIds) {
                  void (async () => {
                    try {
                      const params = new URLSearchParams({
                        movieId: String(movieId),
                        limit: '1',
                        renderer: 'sharp',
                        templateId: COVER_TEMPLATE_ID,
                      });
                      const response = await fetch(
                        withBasePath(`/api/vhs/covers?${params.toString()}`)
                      );
                      if (!response.ok || ignore) {
                        return;
                      }

                      const payloadRaw: unknown = await response.json();
                      if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
                        return;
                      }

                      const hydratedMovie = payloadRaw.movies[0];
                      if (!hydratedMovie || ignore) {
                        return;
                      }

                      const boundsAfterHydration = getFloorBounds();
                      setFloorMovies((previous) =>
                        recalculateHierarchy(
                          previous.map((movie) =>
                            movie.id === movieId
                              ? {
                                  ...movie,
                                  title: hydratedMovie.title,
                                  coverImage: hydratedMovie.coverImage,
                                }
                              : movie
                          ),
                          boundsAfterHydration.height
                        )
                      );

                      setSourceMovies((previous) =>
                        previous.map((movie) =>
                          movie.id === movieId
                            ? {
                                ...movie,
                                title: hydratedMovie.title,
                                coverImage: hydratedMovie.coverImage,
                              }
                            : movie
                        )
                      );
                    } catch {
                      // Keep placeholder hidden if one hydration call fails.
                    }
                  })();
                }
              }

              if (!ignore) {
                setIsInitialBoardLoaded(true);
              }
              return;
            }
          }
        }
      } catch {
        // Fall through to curated covers if board hydration fails.
      }

      try {
        const params = new URLSearchParams({
          limit: String(STARTER_MOVIE_LIMIT),
          renderer: 'sharp',
          templateId: COVER_TEMPLATE_ID,
          titles: CURATED_TITLES_QUERY,
        });

        const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
        if (!response.ok) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
          return;
        }

        if (!ignore) {
          setSourceMovies(payloadRaw.movies);
        }
      } catch {
        // Leave board empty when API is unavailable.
      } finally {
        if (!ignore) {
          setIsInitialBoardLoaded(true);
        }
      }
    };

    void loadMovies();

    return () => {
      ignore = true;
    };
  }, [boardId, getFloorBounds]);

  useEffect(() => {
    if (restoredFromBoardRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      layoutMovies(sourceMovies);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [layoutMovies, sourceMovies]);

  useEffect(() => {
    const onResize = () => {
      setFloorMovies((previous) => {
        if (previous.length === 0) {
          return previous;
        }

        const bounds = getFloorBounds();

        return recalculateHierarchy(
          previous.map((movie) => ({
            ...movie,
            x: clamp(movie.x, 0, Math.max(0, bounds.width - CARD_WIDTH)),
            y: clamp(movie.y, 0, Math.max(0, bounds.height - CARD_HEIGHT)),
          })),
          bounds.height
        );
      });
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [getFloorBounds]);

  useEffect(() => {
    if (!pendingSearch) {
      setActiveSearchCover(null);
      return;
    }

    const query = pendingSearch.query.trim();
    if (query.length < 2) {
      setPendingSearch((current) =>
        current
          ? {
              ...current,
              loading: false,
              results: [],
              selectedIndex: 0,
            }
          : current
      );
      return;
    }

    const previousSelectedId =
      pendingSearch.results[pendingSearch.selectedIndex]?.id ?? null;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPendingSearch((current) =>
          current ? { ...current, loading: true } : current
        );

        try {
          const params = new URLSearchParams({
            limit: String(SEARCH_RESULT_LIMIT),
            query,
          });

          const response = await fetch(withBasePath(`/api/tmdb/search?${params.toString()}`));
          if (!response.ok) {
            throw new Error(`Search request failed (${response.status}).`);
          }

          const payloadRaw: unknown = await response.json();
          const results =
            isSearchResponse(payloadRaw) && payloadRaw.results.length > 0
              ? payloadRaw.results
              : [];

          if (!cancelled) {
            setPendingSearch((current) =>
              current
                ? {
                    ...current,
                    loading: false,
                    results,
                    selectedIndex:
                      results.length === 0
                        ? 0
                        : Math.max(
                            0,
                            previousSelectedId
                              ? results.findIndex(
                                  (movie) => movie.id === previousSelectedId
                                )
                              : 0
                          ),
                  }
                : current
            );
          }
        } catch {
          if (!cancelled) {
            setPendingSearch((current) =>
              current
                ? {
                    ...current,
                    loading: false,
                    results: [],
                    selectedIndex: 0,
                  }
                : current
            );
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingSearch?.query]);

  const clearDeleteHoldTimer = useCallback(() => {
    if (deleteHoldTimerRef.current !== null) {
      window.clearTimeout(deleteHoldTimerRef.current);
      deleteHoldTimerRef.current = null;
    }
  }, []);

  const clearDeleteClearAllTimer = useCallback(() => {
    if (deleteClearAllTimerRef.current !== null) {
      window.clearTimeout(deleteClearAllTimerRef.current);
      deleteClearAllTimerRef.current = null;
    }
  }, []);

  const clearDeleteClearAllSequenceTimer = useCallback(() => {
    if (deleteClearAllSequenceTimerRef.current !== null) {
      window.clearTimeout(deleteClearAllSequenceTimerRef.current);
      deleteClearAllSequenceTimerRef.current = null;
    }
  }, []);

  const clearDeleteAnimationTimers = useCallback(() => {
    if (deleteCutTimerRef.current !== null) {
      window.clearTimeout(deleteCutTimerRef.current);
      deleteCutTimerRef.current = null;
    }
    if (deleteDropTimerRef.current !== null) {
      window.clearTimeout(deleteDropTimerRef.current);
      deleteDropTimerRef.current = null;
    }
    if (deleteCleanupTimerRef.current !== null) {
      window.clearTimeout(deleteCleanupTimerRef.current);
      deleteCleanupTimerRef.current = null;
    }
  }, []);

  const scheduleDeleteClearAllHold = useCallback(
    (movieId: number) => {
      if (
        deleteClearAllArmedIdRef.current === movieId ||
        deleteClearAllMovieIdRef.current === movieId
      ) {
        return;
      }

      clearDeleteClearAllTimer();
      deleteClearAllMovieIdRef.current = movieId;
      deleteClearAllTimerRef.current = window.setTimeout(() => {
        const activeDragId = dragRef.current?.id ?? null;
        if (
          activeDragId === movieId &&
          deleteInZoneRef.current &&
          deleteArmedIdRef.current === movieId
        ) {
          setDeleteClearAllArmedId(movieId);
        }
      }, DELETE_CLEAR_ALL_EXTRA_HOLD_MS);
    },
    [clearDeleteClearAllTimer]
  );

  const deleteMovieFromFloor = useCallback(
    (movieId: number) => {
      const removedMovie =
        floorMoviesRef.current.find((movie) => movie.id === movieId) ?? null;
      if (!removedMovie) {
        return false;
      }

      const bounds = getFloorBounds();
      setFloorMovies((previous) =>
        recalculateHierarchy(
          previous.filter((movie) => movie.id !== movieId),
          bounds.height
        )
      );

      if (!isWaitingSlotCover(removedMovie.coverImage)) {
        clearDeleteAnimationTimers();
        setDeleteAnimation({
          id: removedMovie.id,
          title: removedMovie.title,
          coverImage: removedMovie.coverImage,
          x: removedMovie.x,
          y: removedMovie.y,
          rotation: clampCardRotation(removedMovie.rotation),
          z: Math.max(1400, removedMovie.z + 4),
          splitDirection: Math.random() < 0.5 ? 1 : -1,
          stage: 'cut',
          destroyEffect: isSciFiMovie(removedMovie) ? 'laser' : 'samurai',
        });

        deleteCutTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === movieId
              ? { ...current, stage: 'hold' }
              : current
          );
        }, DELETE_CUT_MS);

        deleteDropTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === movieId
              ? { ...current, stage: 'drop' }
              : current
          );
        }, DELETE_CUT_MS + DELETE_POST_CUT_HOLD_MS);

        deleteCleanupTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === movieId ? null : current
          );
        }, DELETE_CUT_MS + DELETE_POST_CUT_HOLD_MS + DELETE_DROP_MS);
      }

      setSourceMovies((previous) => previous.filter((movie) => movie.id !== movieId));
      setPreviewCoverByMovieId((previous) => {
        const stalePreview = previous[movieId];
        if (stalePreview) {
          URL.revokeObjectURL(stalePreview);
        }

        const { [movieId]: _removed, ...rest } = previous;
        return rest;
      });
      setPreviewTierByMovieId((previous) => {
        const { [movieId]: _removed, ...rest } = previous;
        return rest;
      });
      setProximityVsPairs((current) =>
        current.filter((pair) => !pairHasMovie(pair, movieId))
      );
      delete renderedCoverPromiseByMovieIdRef.current[movieId];
      delete renderedSpineCoverPromiseByMovieIdRef.current[movieId];
      return true;
    },
    [clearDeleteAnimationTimers, getFloorBounds]
  );

  const startDeleteClearAllSequence = useCallback(
    (triggerMovieId: number) => {
      const movieById = new Map(
        floorMoviesRef.current.map((movie) => [movie.id, movie] as const)
      );
      const queue = floorMoviesRef.current
        .map((movie) => movie.id)
        .sort((leftId, rightId) => {
          if (leftId === triggerMovieId) {
            return -1;
          }
          if (rightId === triggerMovieId) {
            return 1;
          }

          const leftMovie = movieById.get(leftId);
          const rightMovie = movieById.get(rightId);
          if (!leftMovie || !rightMovie) {
            return 0;
          }

          if (rightMovie.y !== leftMovie.y) {
            return rightMovie.y - leftMovie.y;
          }

          return rightMovie.z - leftMovie.z;
        });

      if (queue.length === 0) {
        return;
      }

      clearDeleteClearAllSequenceTimer();
      setIsDeleteClearAllSequenceActive(true);

      const removeNext = (index: number) => {
        const movieId = queue[index];
        if (movieId === undefined) {
          setIsDeleteClearAllSequenceActive(false);
          deleteClearAllSequenceTimerRef.current = null;
          return;
        }

        deleteMovieFromFloor(movieId);

        if (index >= queue.length - 1) {
          deleteClearAllSequenceTimerRef.current = window.setTimeout(() => {
            setIsDeleteClearAllSequenceActive(false);
            deleteClearAllSequenceTimerRef.current = null;
          }, DELETE_CUT_MS + DELETE_POST_CUT_HOLD_MS + DELETE_DROP_MS);
          return;
        }

        deleteClearAllSequenceTimerRef.current = window.setTimeout(() => {
          removeNext(index + 1);
        }, DELETE_CLEAR_ALL_STEP_MS);
      };

      removeNext(0);
    },
    [clearDeleteClearAllSequenceTimer, deleteMovieFromFloor]
  );

  const clearProximityVsHoldTimer = useCallback(() => {
    if (proximityVsHoldTimerRef.current !== null) {
      window.clearTimeout(proximityVsHoldTimerRef.current);
      proximityVsHoldTimerRef.current = null;
    }
  }, []);

  const clearProximityVsChargeAnimation = useCallback(() => {
    if (proximityVsChargeRafRef.current !== null) {
      window.cancelAnimationFrame(proximityVsChargeRafRef.current);
      proximityVsChargeRafRef.current = null;
    }
  }, []);

  const startProximityVsChargeAnimation = useCallback(
    (pair: VsPair) => {
      clearProximityVsChargeAnimation();
      const startedAt = performance.now();
      setProximityVsCharge({ pair, progress: 0 });

      const animate = () => {
        const activeCandidate = proximityVsCandidatePairRef.current;
        if (!isSameVsPair(activeCandidate, pair)) {
          setProximityVsCharge((current) =>
            current && isSameVsPair(current.pair, pair) ? null : current
          );
          return;
        }

        const elapsedMs = performance.now() - startedAt;
        const progress = clamp(elapsedMs / PROXIMITY_VS_HOLD_MS, 0, 1);
        setProximityVsCharge((current) =>
          current && isSameVsPair(current.pair, pair)
            ? { ...current, progress }
            : current
        );

        if (progress < 1) {
          proximityVsChargeRafRef.current = window.requestAnimationFrame(animate);
        }
      };

      proximityVsChargeRafRef.current = window.requestAnimationFrame(animate);
    },
    [clearProximityVsChargeAnimation]
  );

  const resetProximityVsCandidate = useCallback(() => {
    clearProximityVsHoldTimer();
    clearProximityVsChargeAnimation();
    proximityVsCandidatePairRef.current = null;
    setProximityVsCharge(null);
  }, [clearProximityVsChargeAnimation, clearProximityVsHoldTimer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: number) => {
    if (isDeleteClearAllSequenceActive) {
      return;
    }

    const isMovieInFight = Object.values(vsFightByKeyRef.current).some((fight) =>
      pairHasMovie(fight.pair, id)
    );
    if (isMovieInFight) {
      return;
    }

    event.preventDefault();
    shelfDragCandidateRef.current = null;
    setPendingSearch(null);
    setIsAddSlotPeek(false);
    setIsMobileShelfOpen(false);
    clearDeleteHoldTimer();
    clearDeleteClearAllTimer();
    resetProximityVsCandidate();
    deleteInZoneRef.current = false;
    deleteHoldMovieIdRef.current = null;
    deleteClearAllMovieIdRef.current = null;
    setDeleteCandidateId(null);
    setDeleteArmedId(null);
    setDeleteClearAllArmedId(null);
    setIsShelfDropActive(false);
    setIsCoverEditorDropActive(false);
    updateShelfDropInsertIndex(null);

    const bounds = getFloorBounds();
    const selected = floorMovies.find((movie) => movie.id === id);

    if (!selected) {
      return;
    }

    const pointerXWithinCard = event.clientX - bounds.left - selected.x;
    const pointerYWithinCard = event.clientY - bounds.top - selected.y;
    const grabOffsetFromCenterX = pointerXWithinCard - CARD_WIDTH * 0.5;
    const grabOffsetFromCenterY = pointerYWithinCard - CARD_HEIGHT * 0.5;

    dragRef.current = {
      id,
      offsetX: pointerXWithinCard,
      offsetY: pointerYWithinCard,
      baseRotation: selected.rotation,
      grabOffsetNormX: clamp(grabOffsetFromCenterX / (CARD_WIDTH * 0.5), -1, 1),
      grabOffsetNormY: clamp(grabOffsetFromCenterY / (CARD_HEIGHT * 0.5), -1, 1),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTimestamp: performance.now(),
      velocityX: 0,
      velocityY: 0,
    };
    dragHierarchyLastRecalcRef.current = 0;

    setDraggingId(id);
    setFloorMovies((previous) => {
      const maxZ = previous.reduce((current, movie) => Math.max(current, movie.z), 1);

      return previous.map((movie) =>
        movie.id === id
          ? {
              ...movie,
              z: maxZ + 1,
            }
          : movie
      );
    });
  };

  const handleGlobalPointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const bounds = getFloorBounds();
      const x = clamp(clientX - bounds.left - drag.offsetX, 0, Math.max(0, bounds.width - CARD_WIDTH));
      const y = clamp(clientY - bounds.top - drag.offsetY, 0, Math.max(0, bounds.height - CARD_HEIGHT));
      const now = performance.now();
      const dtMs = Math.max(1, now - drag.lastTimestamp);
      const instantVx = (clientX - drag.lastClientX) / dtMs;
      const instantVy = (clientY - drag.lastClientY) / dtMs;
      const velocityX =
        drag.velocityX * (1 - DRAG_VELOCITY_SMOOTHING) +
        instantVx * DRAG_VELOCITY_SMOOTHING;
      const velocityY =
        drag.velocityY * (1 - DRAG_VELOCITY_SMOOTHING) +
        instantVy * DRAG_VELOCITY_SMOOTHING;
      const grabTilt = drag.grabOffsetNormX * DRAG_GRAB_TILT_MAX;
      const velocityTilt = clamp(
        velocityX * 22,
        -DRAG_VELOCITY_TILT_MAX,
        DRAG_VELOCITY_TILT_MAX
      );
      const wobbleTilt = clamp(
        (-velocityY * drag.grabOffsetNormX + velocityX * drag.grabOffsetNormY * 0.35) *
          11,
        -DRAG_WOBBLE_TILT_MAX,
        DRAG_WOBBLE_TILT_MAX
      );
      const dragRotation = clampCardRotation(
        drag.baseRotation + grabTilt + velocityTilt + wobbleTilt
      );
      dragRef.current = {
        ...drag,
        lastClientX: clientX,
        lastClientY: clientY,
        lastTimestamp: now,
        velocityX,
        velocityY,
      };
      const draggedCenterX = x + CARD_WIDTH * 0.5;
      const draggedCenterY = y + CARD_HEIGHT * 0.5;
      const shelfDropZoneWidth =
        SHELF_OPEN_WIDTH + SHELF_DROP_ZONE_EXTRA + CARD_WIDTH * 0.12;
      const mobileShelfDropZoneTop = bounds.height - MOBILE_SHELF_OPEN_HEIGHT;
      const isInShelfDropZone = isCompactPhoneLayout
        ? isMobileShelfOpen &&
          draggedCenterY >= mobileShelfDropZoneTop &&
          draggedCenterX >= MOBILE_SHELF_SIDE_PADDING &&
          draggedCenterX <= bounds.width - MOBILE_SHELF_SIDE_PADDING
        : draggedCenterX <= shelfDropZoneWidth;
      if (isShelfDropActiveRef.current !== isInShelfDropZone) {
        setIsShelfDropActive(isInShelfDropZone);
      }

      const slotPosition = getEmptySlotPosition();
      // Keep the drop-zone target stable while dragging so first-drop hit testing is reliable.
      const activeAddSlotOffset = 0;
      const editorDropZoneLeft = slotPosition.x - COVER_EDITOR_DROP_ZONE_EXTRA;
      const editorDropZoneTop =
        slotPosition.y + activeAddSlotOffset - COVER_EDITOR_DROP_ZONE_EXTRA;
      const editorDropZoneRight =
        slotPosition.x + CARD_WIDTH + COVER_EDITOR_DROP_ZONE_EXTRA;
      const editorDropZoneBottom =
        slotPosition.y +
        activeAddSlotOffset +
        CARD_HEIGHT +
        COVER_EDITOR_DROP_ZONE_EXTRA;
      const isInCoverEditorDropZone =
        !isInShelfDropZone &&
        draggedCenterX >= editorDropZoneLeft &&
        draggedCenterX <= editorDropZoneRight &&
        draggedCenterY >= editorDropZoneTop &&
        draggedCenterY <= editorDropZoneBottom;

      if (isCoverEditorDropActiveRef.current !== isInCoverEditorDropZone) {
        setIsCoverEditorDropActive(isInCoverEditorDropZone);
      }

      if (isInShelfDropZone) {
        const nextInsertIndex = getShelfDropInsertIndexFromPointer(
          clientX,
          clientY
        );
        updateShelfDropInsertIndex(nextInsertIndex);
      } else {
        updateShelfDropInsertIndex(null);
      }

      const deleteZoneTop = bounds.height - DELETE_ZONE_HEIGHT;
      const isInDeleteZone =
        y + CARD_HEIGHT >= deleteZoneTop &&
        !isInShelfDropZone &&
        !isInCoverEditorDropZone;
      deleteInZoneRef.current = isInDeleteZone;
      const visibleMovies = floorMoviesRef.current.filter(
        (movie) => !isWaitingSlotCover(movie.coverImage)
      );
      let nearestMovieId: number | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      if (isInDeleteZone) {
        if (deleteCandidateIdRef.current !== drag.id) {
          setDeleteCandidateId(drag.id);
        }

        if (
          deleteArmedIdRef.current !== drag.id &&
          deleteHoldMovieIdRef.current !== drag.id
        ) {
          clearDeleteHoldTimer();
          deleteHoldMovieIdRef.current = drag.id;
          deleteHoldTimerRef.current = window.setTimeout(() => {
            const activeDragId = dragRef.current?.id ?? null;
            if (activeDragId === drag.id && deleteInZoneRef.current) {
              setDeleteArmedId(drag.id);
              setDeleteCandidateId(drag.id);
              scheduleDeleteClearAllHold(drag.id);
            }
          }, DELETE_HOLD_MS);
        }

        if (deleteArmedIdRef.current === drag.id) {
          scheduleDeleteClearAllHold(drag.id);
        }
      } else {
        if (deleteCandidateIdRef.current === drag.id) {
          setDeleteCandidateId(null);
        }
        if (deleteArmedIdRef.current === drag.id) {
          setDeleteArmedId(null);
        }
        if (deleteClearAllArmedIdRef.current === drag.id) {
          setDeleteClearAllArmedId(null);
        }
        if (deleteHoldMovieIdRef.current === drag.id) {
          clearDeleteHoldTimer();
          deleteHoldMovieIdRef.current = null;
        }
        if (deleteClearAllMovieIdRef.current === drag.id) {
          clearDeleteClearAllTimer();
          deleteClearAllMovieIdRef.current = null;
        }
      }

      for (const movie of visibleMovies) {
        if (movie.id === drag.id) {
          continue;
        }

        const centerX = movie.x + CARD_WIDTH * 0.5;
        const centerY = movie.y + CARD_HEIGHT * 0.5;
        const distance = Math.hypot(draggedCenterX - centerX, draggedCenterY - centerY);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestMovieId = movie.id;
        }
      }

      const activePairs = proximityVsPairsRef.current;
      if (activePairs.length > 0) {
        const movieById = new Map(visibleMovies.map((movie) => [movie.id, movie]));
        const remainingPairs = activePairs.filter((pair) => {
          if (!pairHasMovie(pair, drag.id)) {
            return true;
          }

          const otherMovieId = pair.firstId === drag.id ? pair.secondId : pair.firstId;
          const otherMovie = movieById.get(otherMovieId);
          if (!otherMovie) {
            return false;
          }

          const otherCenterX = otherMovie.x + CARD_WIDTH * 0.5;
          const otherCenterY = otherMovie.y + CARD_HEIGHT * 0.5;
          const pairDistance = Math.hypot(
            draggedCenterX - otherCenterX,
            draggedCenterY - otherCenterY
          );

          return pairDistance <= PROXIMITY_VS_BREAK_RADIUS;
        });

        if (remainingPairs.length !== activePairs.length) {
          setProximityVsPairs(remainingPairs);
        }
      }

      if (
        nearestMovieId !== null &&
        nearestDistance <= PROXIMITY_VS_TRIGGER_RADIUS
      ) {
        const nextPair = createVsPair(drag.id, nearestMovieId);
        const currentCandidate = proximityVsCandidatePairRef.current;

        if (!isSameVsPair(currentCandidate, nextPair)) {
          resetProximityVsCandidate();
          proximityVsCandidatePairRef.current = nextPair;
          startProximityVsChargeAnimation(nextPair);
          proximityVsHoldTimerRef.current = window.setTimeout(() => {
            const activeDragId = dragRef.current?.id ?? null;
            const activeCandidate = proximityVsCandidatePairRef.current;

            if (activeDragId === drag.id && isSameVsPair(activeCandidate, nextPair)) {
              setProximityVsPairs((current) =>
                hasVsPair(current, nextPair) ? current : [...current, nextPair]
              );
              resetProximityVsCandidate();
            }
          }, PROXIMITY_VS_HOLD_MS);
        }
      } else {
        resetProximityVsCandidate();
      }

      const shouldRecalculateHierarchy =
        now - dragHierarchyLastRecalcRef.current >=
        DRAG_HIERARCHY_RECALC_INTERVAL_MS;
      if (shouldRecalculateHierarchy) {
        dragHierarchyLastRecalcRef.current = now;
      }

      setFloorMovies((previous) => {
        const nextMovies = previous.map((movie) =>
          movie.id === drag.id
            ? {
                ...movie,
                x,
                y,
                rotation: dragRotation,
                score: getTopScorePercent(y, bounds.height, CARD_HEIGHT),
              }
            : movie
        );

        return shouldRecalculateHierarchy
          ? recalculateHierarchy(nextMovies, bounds.height)
          : nextMovies;
      });
    },
    [
      CARD_HEIGHT,
      CARD_WIDTH,
      DELETE_ZONE_HEIGHT,
      MOBILE_SHELF_OPEN_HEIGHT,
      MOBILE_SHELF_SIDE_PADDING,
      PROXIMITY_VS_BREAK_RADIUS,
      PROXIMITY_VS_TRIGGER_RADIUS,
      SHELF_DROP_ZONE_EXTRA,
      SHELF_OPEN_WIDTH,
      clearDeleteHoldTimer,
      clearDeleteClearAllTimer,
      getEmptySlotPosition,
      getFloorBounds,
      getShelfDropInsertIndexFromPointer,
      isCompactPhoneLayout,
      isMobileShelfOpen,
      resetProximityVsCandidate,
      scheduleDeleteClearAllHold,
      startProximityVsChargeAnimation,
      updateShelfDropInsertIndex,
    ]
  );

  const flushPendingDragPointerMove = useCallback(() => {
    if (dragPointerRafRef.current !== null) {
      window.cancelAnimationFrame(dragPointerRafRef.current);
      dragPointerRafRef.current = null;
    }

    const pendingPointer = dragPointerPositionRef.current;
    if (!pendingPointer) {
      return;
    }

    dragPointerPositionRef.current = null;
    handleGlobalPointerMove(pendingPointer.clientX, pendingPointer.clientY);
  }, [handleGlobalPointerMove]);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        const shelfDragCandidate = shelfDragCandidateRef.current;
        if (!shelfDragCandidate) {
          return;
        }

        const distance = Math.hypot(
          event.clientX - shelfDragCandidate.startClientX,
          event.clientY - shelfDragCandidate.startClientY
        );
        if (distance < 8) {
          return;
        }

        shelfDragCandidateRef.current = null;
        beginDragFromShelfRef.current?.(shelfDragCandidate.movie, event);
        return;
      }

      dragPointerPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (dragPointerRafRef.current !== null) {
        return;
      }

      dragPointerRafRef.current = window.requestAnimationFrame(() => {
        dragPointerRafRef.current = null;
        const pendingPointer = dragPointerPositionRef.current;
        if (!pendingPointer) {
          return;
        }

        dragPointerPositionRef.current = null;
        handleGlobalPointerMove(pendingPointer.clientX, pendingPointer.clientY);
      });
    },
    [handleGlobalPointerMove]
  );

  const handleGlobalPointerUp = useCallback(() => {
    const shelfDragCandidate = shelfDragCandidateRef.current;
    if (shelfDragCandidate) {
      shelfDragCandidateRef.current = null;
      setIsCoverEditorDropActive(false);
      updateShelfDropInsertIndex(null);
      restoreMovieFromShelfRef.current?.(
        shelfDragCandidate.movie.id,
        shelfDragCandidate.startClientX,
        shelfDragCandidate.startClientY
      );
      return;
    }

    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    flushPendingDragPointerMove();

    const bounds = getFloorBounds();
    const draggedMovieId = drag.id;
    const shouldMoveToShelf = isShelfDropActiveRef.current;
    const shouldRandomizeCover = isCoverEditorDropActiveRef.current;
    const dropInsertIndex = shelfDropInsertIndexRef.current;
    const shouldClearBoard =
      deleteClearAllArmedIdRef.current === draggedMovieId && deleteInZoneRef.current;
    const shouldDelete =
      deleteArmedIdRef.current === draggedMovieId && deleteInZoneRef.current;
    const turnDirection =
      drag.grabOffsetNormX === 0 ? 1 : Math.sign(drag.grabOffsetNormX);
    const throwRotation = clamp(
      drag.velocityX * 18 + drag.velocityY * turnDirection * 6,
      -DRAG_THROW_ROTATION_MAX,
      DRAG_THROW_ROTATION_MAX
    );
    const releaseRotation = clampCardRotation(
      drag.baseRotation + drag.grabOffsetNormX * 2.1 + throwRotation
    );

    dragRef.current = null;
    dragPointerPositionRef.current = null;
    dragHierarchyLastRecalcRef.current = 0;
    setDraggingId(null);
    clearDeleteHoldTimer();
    clearDeleteClearAllTimer();
    resetProximityVsCandidate();
    deleteInZoneRef.current = false;
    deleteHoldMovieIdRef.current = null;
    deleteClearAllMovieIdRef.current = null;
    setDeleteCandidateId(null);
    setDeleteArmedId(null);
    setDeleteClearAllArmedId(null);
    setIsShelfDropActive(false);
    setIsCoverEditorDropActive(false);
    updateShelfDropInsertIndex(null);

    if (shouldMoveToShelf) {
      moveMovieToShelfRef.current?.(draggedMovieId, dropInsertIndex ?? 0);
      return;
    }

    if (shouldRandomizeCover) {
      setPendingSearch(null);
      setIsAddSlotPeek(false);
      setActiveSearchCover(null);
      setCoverEditor(null);
      if (coverEditorReturnTimerRef.current !== null) {
        window.clearTimeout(coverEditorReturnTimerRef.current);
      }
      setCoverEditorReturnMovieId(draggedMovieId);
      coverEditorReturnTimerRef.current = window.setTimeout(() => {
        setCoverEditorReturnMovieId((current) =>
          current === draggedMovieId ? null : current
        );
        coverEditorReturnTimerRef.current = null;
      }, 640);
      setFloorMovies((previous) =>
        recalculateHierarchy(
          previous.map((movie) =>
            movie.id === draggedMovieId
              ? {
                ...movie,
                x: clamp(
                  movie.x - CARD_WIDTH * (0.56 + Math.random() * 0.2),
                  0,
                  Math.max(0, bounds.width - CARD_WIDTH)
                ),
                y: clamp(
                  movie.y - CARD_HEIGHT * (0.1 + Math.random() * 0.12),
                  0,
                  Math.max(0, bounds.height - CARD_HEIGHT)
                ),
                rotation: clampCardRotation(
                  releaseRotation + (Math.random() - 0.5) * 5.2
                ),
              }
              : movie
          ),
          bounds.height
        )
      );
      randomizeMovieCoverPairRef.current?.(draggedMovieId);
      return;
    }

    if (shouldClearBoard) {
      startDeleteClearAllSequence(draggedMovieId);
      return;
    }

    if (shouldDelete) {
      deleteMovieFromFloor(draggedMovieId);
      return;
    }

    setFloorMovies((previous) =>
      recalculateHierarchy(
        previous.map((movie) =>
          movie.id === draggedMovieId
            ? {
                ...movie,
                rotation: releaseRotation,
              }
            : movie
        ),
        bounds.height
      )
    );
  }, [
    clearDeleteClearAllTimer,
    clearDeleteHoldTimer,
    deleteMovieFromFloor,
    flushPendingDragPointerMove,
    getFloorBounds,
    resetProximityVsCandidate,
    startDeleteClearAllSequence,
    updateShelfDropInsertIndex,
  ]);

  useEffect(() => {
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);

    return () => {
      if (dragPointerRafRef.current !== null) {
        window.cancelAnimationFrame(dragPointerRafRef.current);
        dragPointerRafRef.current = null;
      }
      dragPointerPositionRef.current = null;
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [handleGlobalPointerUp, handleWindowPointerMove]);

  useEffect(() => {
    const leader = [...floorMovies].sort((a, b) => a.rank - b.rank)[0];
    leaderIdRef.current = leader?.id ?? null;

    (window as Window & { __floorLeaderId?: number | null }).__floorLeaderId =
      leaderIdRef.current;
  }, [floorMovies]);

  useEffect(() => {
    if (!isInitialBoardLoaded) {
      return;
    }

    if (floorMovies.some((movie) => isWaitingSlotCover(movie.coverImage))) {
      return;
    }

    const boardMovies = toBoardMoviesPayload(floorMovies);
    const signature = buildBoardSignature(boardMovies);

    if (signature === lastBoardSignatureRef.current) {
      return;
    }

    if (boardSyncTimerRef.current !== null) {
      window.clearTimeout(boardSyncTimerRef.current);
      boardSyncTimerRef.current = null;
    }

    boardSyncTimerRef.current = window.setTimeout(() => {
      const syncBoard = async (): Promise<void> => {
        const requestBody = {
          boardId,
          movies: boardMovies,
          expectedVersion: boardVersionRef.current ?? undefined,
        };

        try {
          const firstResponse = await fetch(withBasePath(`/api/club/floor?boardId=${boardId}`), {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (firstResponse.ok) {
            const payloadRaw: unknown = await firstResponse.json().catch(() => null);
            if (isFloorBoardResponse(payloadRaw)) {
              boardVersionRef.current = payloadRaw.version;
            } else if (boardVersionRef.current !== null) {
              boardVersionRef.current += 1;
            }

            lastBoardSignatureRef.current = signature;
            return;
          }

          if (firstResponse.status !== 409) {
            return;
          }

          const conflictPayloadRaw: unknown = await firstResponse
            .json()
            .catch(() => null);
          if (!isFloorBoardConflictResponse(conflictPayloadRaw)) {
            return;
          }

          if (typeof conflictPayloadRaw.currentVersion === 'number') {
            boardVersionRef.current = conflictPayloadRaw.currentVersion;
          } else {
            return;
          }

          const secondResponse = await fetch(
            withBasePath(`/api/club/floor?boardId=${boardId}`),
            {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                ...requestBody,
                expectedVersion: boardVersionRef.current,
              }),
            }
          );

          if (!secondResponse.ok) {
            return;
          }

          const secondPayloadRaw: unknown = await secondResponse.json().catch(() => null);
          if (isFloorBoardResponse(secondPayloadRaw)) {
            boardVersionRef.current = secondPayloadRaw.version;
          } else if (boardVersionRef.current !== null) {
            boardVersionRef.current += 1;
          }

          lastBoardSignatureRef.current = signature;
        } catch {
          // Keep UI responsive even if board sync fails.
        }
      };

      void syncBoard();
    }, BOARD_SYNC_DEBOUNCE_MS);

    return () => {
      if (boardSyncTimerRef.current !== null) {
        window.clearTimeout(boardSyncTimerRef.current);
        boardSyncTimerRef.current = null;
      }
    };
  }, [boardId, floorMovies, isInitialBoardLoaded]);

  useEffect(() => {
    return () => {
      for (const timer of animationTimersRef.current) {
        window.clearTimeout(timer);
      }
      animationTimersRef.current = [];
      if (addSlotResetRafRef.current !== null) {
        window.cancelAnimationFrame(addSlotResetRafRef.current);
        addSlotResetRafRef.current = null;
      }
      if (boardSyncTimerRef.current !== null) {
        window.clearTimeout(boardSyncTimerRef.current);
        boardSyncTimerRef.current = null;
      }
      for (const timer of vsFightTimersRef.current) {
        window.clearTimeout(timer);
      }
      vsFightTimersRef.current = [];
      clearDeleteHoldTimer();
      clearDeleteClearAllTimer();
      clearDeleteClearAllSequenceTimer();
      clearDeleteAnimationTimers();
      resetProximityVsCandidate();
      shelfDragCandidateRef.current = null;
      if (coverEditorDropCycleTimerRef.current !== null) {
        window.clearInterval(coverEditorDropCycleTimerRef.current);
        coverEditorDropCycleTimerRef.current = null;
      }
      if (coverEditorDropCycleAbortRef.current) {
        coverEditorDropCycleAbortRef.current.abort();
        coverEditorDropCycleAbortRef.current = null;
      }
      coverEditorAdjustDragRef.current = null;
    };
  }, [
    clearDeleteAnimationTimers,
    clearDeleteClearAllSequenceTimer,
    clearDeleteClearAllTimer,
    clearDeleteHoldTimer,
    resetProximityVsCandidate,
  ]);

  useEffect(() => {
    floorMoviesRef.current = floorMovies;
  }, [floorMovies]);

  useEffect(() => {
    sourceMoviesRef.current = sourceMovies;
  }, [sourceMovies]);

  useEffect(() => {
    shelfMoviesRef.current = shelfMovies;
  }, [shelfMovies]);

  useEffect(() => {
    if (floorMovies.length === 0 || shelfMovies.length === 0) {
      return;
    }

    const floorMovieIds = new Set(floorMovies.map((movie) => movie.id));
    setShelfMovies((previous) => {
      const next = previous.filter((movie) => !floorMovieIds.has(movie.id));
      return next.length === previous.length ? previous : next;
    });
  }, [floorMovies, shelfMovies]);

  useEffect(() => {
    const visibleMovieIds = new Set(
      floorMovies
        .filter((movie) => !isWaitingSlotCover(movie.coverImage))
        .map((movie) => movie.id)
    );

    setProximityVsPairs((current) =>
      current.filter(
        (pair) =>
          visibleMovieIds.has(pair.firstId) && visibleMovieIds.has(pair.secondId)
      )
    );
    setVsFightByKey((current) => {
      const nextEntries = Object.entries(current).filter(([, fight]) => {
        return (
          visibleMovieIds.has(fight.pair.firstId) &&
          visibleMovieIds.has(fight.pair.secondId)
        );
      });
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [floorMovies]);

  useEffect(() => {
    previewCoverByMovieIdRef.current = previewCoverByMovieId;
  }, [previewCoverByMovieId]);

  useEffect(() => {
    previewTierByMovieIdRef.current = previewTierByMovieId;
  }, [previewTierByMovieId]);

  useEffect(() => {
    customCoverSettingsByMovieIdRef.current = customCoverSettingsByMovieId;
  }, [customCoverSettingsByMovieId]);

  useEffect(() => {
    deleteCandidateIdRef.current = deleteCandidateId;
  }, [deleteCandidateId]);

  useEffect(() => {
    deleteArmedIdRef.current = deleteArmedId;
  }, [deleteArmedId]);

  useEffect(() => {
    deleteClearAllArmedIdRef.current = deleteClearAllArmedId;
  }, [deleteClearAllArmedId]);

  useEffect(() => {
    isShelfDropActiveRef.current = isShelfDropActive;
  }, [isShelfDropActive]);

  useEffect(() => {
    isCoverEditorDropActiveRef.current = isCoverEditorDropActive;
  }, [isCoverEditorDropActive]);

  useEffect(() => {
    shelfDropInsertIndexRef.current = shelfDropInsertIndex;
  }, [shelfDropInsertIndex]);

  useEffect(() => {
    if (shelfRecentlyInsertedMovieId === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShelfRecentlyInsertedMovieId((current) =>
        current === shelfRecentlyInsertedMovieId ? null : current
      );
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shelfRecentlyInsertedMovieId]);

  useEffect(() => {
    resolvingVsPairByKeyRef.current = resolvingVsPairByKey;
  }, [resolvingVsPairByKey]);

  useEffect(() => {
    vsFightByKeyRef.current = vsFightByKey;
  }, [vsFightByKey]);

  useEffect(() => {
    proximityVsPairsRef.current = proximityVsPairs;
  }, [proximityVsPairs]);

  useEffect(() => {
    return () => {
      for (const previewUrl of Object.values(previewCoverByMovieIdRef.current)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const addImportedMoviesToFloor = useCallback(
    (movies: ClubMovie[]) => {
      if (movies.length === 0) {
        return;
      }

      const bounds = getFloorBounds();
      const slot = getEmptySlotPosition();
      setFloorMovies((previous) => {
        const existingIds = new Set(previous.map((movie) => movie.id));
        const maxZ = previous.reduce((current, movie) => Math.max(current, movie.z), 1);
        const next = [...previous];
        let zIndex = maxZ;
        let addedCount = 0;

        for (const movie of movies) {
          if (existingIds.has(movie.id)) {
            continue;
          }

          existingIds.add(movie.id);
          const lane = addedCount % 5;
          const row = Math.floor(addedCount / 5);
          const jitterX = (lane - 2) * 42 + (Math.random() - 0.5) * 20;
          const jitterY = row * 34 + (Math.random() - 0.5) * 26;
          const targetX = clamp(
            slot.x - CARD_WIDTH * (0.75 + Math.random() * 0.9) + jitterX,
            0,
            Math.max(0, bounds.width - CARD_WIDTH)
          );
          const targetY = clamp(
            slot.y - CARD_HEIGHT * (0.06 + Math.random() * 0.58) + jitterY,
            0,
            Math.max(0, bounds.height - CARD_HEIGHT)
          );

          next.push({
            ...movie,
            x: targetX,
            y: targetY,
            rotation: getRandomCardRotation(),
            z: zIndex + 1,
            rank: next.length + 1,
            score: 0,
          });
          zIndex += 1;
          addedCount += 1;
        }

        if (addedCount === 0) {
          return previous;
        }

        return recalculateHierarchy(next, bounds.height);
      });

      setSourceMovies((previous) => {
        const existingIds = new Set(previous.map((movie) => movie.id));
        const additions = movies.filter((movie) => !existingIds.has(movie.id));
        if (additions.length === 0) {
          return previous;
        }

        return [...previous, ...additions];
      });
    },
    [getEmptySlotPosition, getFloorBounds]
  );

  const importCsvTitleQueries = useCallback(
    async (queries: CsvTitleQuery[]) => {
      if (queries.length === 0) {
        return;
      }

      const floorIds = new Set(floorMoviesRef.current.map((movie) => movie.id));
      const shelfIds = new Set(shelfMovies.map((movie) => movie.id));
      const seenIds = new Set<number>([...floorIds, ...shelfIds]);

      for (let index = 0; index < queries.length; index += CSV_IMPORT_BATCH_SIZE) {
        const batch = queries.slice(index, index + CSV_IMPORT_BATCH_SIZE);
        if (batch.length === 0) {
          continue;
        }

        try {
          const params = new URLSearchParams({
            limit: String(Math.min(20, batch.length)),
            renderer: 'sharp',
            templateId: COVER_TEMPLATE_ID,
            titles: toTitlesQueryValue(batch),
          });

          const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
          if (!response.ok) {
            continue;
          }

          const payloadRaw: unknown = await response.json();
          if (!isCoversResponse(payloadRaw)) {
            continue;
          }

          const newMovies = payloadRaw.movies.filter((movie) => {
            if (seenIds.has(movie.id)) {
              return false;
            }
            seenIds.add(movie.id);
            return true;
          });

          if (newMovies.length > 0) {
            addImportedMoviesToFloor(newMovies);
          }
        } catch {
          // Ignore one failed batch and continue with the rest.
        }
      }
    },
    [addImportedMoviesToFloor, shelfMovies]
  );

  const handleCsvImportFile = useCallback(
    async (file: File | null) => {
      if (!file || csvImportInFlightRef.current) {
        return;
      }

      const isCsv =
        file.name.toLowerCase().endsWith('.csv') ||
        file.type.includes('csv') ||
        file.type.includes('text/plain');
      if (!isCsv) {
        return;
      }

      csvImportInFlightRef.current = true;
      try {
        const content = await file.text();
        const queries = parseCsvTitleQueries(content);
        await importCsvTitleQueries(queries);
      } finally {
        csvImportInFlightRef.current = false;
      }
    },
    [importCsvTitleQueries]
  );

  const handleCsvInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleCsvImportFile(file);
      event.target.value = '';
    },
    [handleCsvImportFile]
  );

  const handleAddSlotDoubleClick = useCallback(() => {
    csvImportInputRef.current?.click();
  }, []);

  const handleAddSlotDragOver = useCallback(
    (event: ReactDragEvent<HTMLButtonElement>) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    []
  );

  const handleAddSlotDrop = useCallback(
    (event: ReactDragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleCsvImportFile(file);
    },
    [handleCsvImportFile]
  );

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    const valueLength = input.value.length;
    try {
      input.setSelectionRange(valueLength, valueLength);
    } catch {
      // iOS can reject selection updates during focus transitions.
    }
  }, []);

  const handleEmptySlotClick = () => {
    setIsMobileShelfOpen(false);
    focusSearchInput();

    if (pendingSearch) {
      setIsAddSlotPeek(true);
      return;
    }

    setPendingSearch({
      query: '',
      results: [],
      selectedIndex: 0,
      loading: false,
    });
    setIsAddSlotPeek(true);
  };

  const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setPendingSearch((current) =>
      current
        ? {
            ...current,
            query: nextQuery,
            selectedIndex: 0,
          }
        : current
    );
  }, []);

  const getAddSlotOffset = useCallback(() => {
    if (pendingSearch) {
      return 0;
    }

    if (isAddSlotPeek) {
      return ADD_SLOT_HOVER_OFFSET;
    }

    return ADD_SLOT_HIDDEN_OFFSET;
  }, [isAddSlotPeek, pendingSearch]);

  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    if (!pendingSearch) {
      if (document.activeElement === input) {
        input.blur();
      }
      return;
    }

    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        focusSearchInput();
      }
    });
  }, [focusSearchInput, pendingSearch]);

  const triggerCoverEditorReturnAnimation = useCallback((movieId: number) => {
    if (!Number.isFinite(movieId) || movieId <= 0) {
      return;
    }

    const normalizedMovieId = Math.floor(movieId);
    if (coverEditorReturnTimerRef.current !== null) {
      window.clearTimeout(coverEditorReturnTimerRef.current);
    }

    setCoverEditorReturnMovieId(normalizedMovieId);
    coverEditorReturnTimerRef.current = window.setTimeout(() => {
      setCoverEditorReturnMovieId((current) =>
        current === normalizedMovieId ? null : current
      );
      coverEditorReturnTimerRef.current = null;
    }, 640);
  }, []);

  useEffect(() => {
    return () => {
      if (coverEditorEnterRafRef.current !== null) {
        window.cancelAnimationFrame(coverEditorEnterRafRef.current);
      }
      if (coverEditorReturnTimerRef.current !== null) {
        window.clearTimeout(coverEditorReturnTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const renderedUrl of Object.values(
        coverEditorDropCycleRenderedCacheRef.current
      )) {
        URL.revokeObjectURL(renderedUrl);
      }
      coverEditorDropCycleRenderedCacheRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (coverEditorEnterRafRef.current !== null) {
      window.cancelAnimationFrame(coverEditorEnterRafRef.current);
      coverEditorEnterRafRef.current = null;
    }

    if (!coverEditor) {
      setCoverEditorDidEnter(false);
      return;
    }

    setCoverEditorDidEnter(false);
    coverEditorEnterRafRef.current = window.requestAnimationFrame(() => {
      coverEditorEnterRafRef.current = null;
      setCoverEditorDidEnter(true);
    });
  }, [coverEditor]);

  const getCoverEditorOptionAtIndex = useCallback(
    (options: TmdbImageOption[], index: number): TmdbImageOption | null => {
      if (options.length === 0) {
        return null;
      }

      const normalizedIndex = clamp(
        Math.round(index),
        0,
        Math.max(0, options.length - 1)
      );
      return options[normalizedIndex] ?? null;
    },
    []
  );

  const getCoverEditorOptionPoolIndices = useCallback(
    (options: TmdbImageOption[], variant: CoverVariant): number[] => {
      const preferredKind: TmdbImageKind = variant === 'front' ? 'poster' : 'backdrop';
      const preferred = options
        .map((option, index) => (option.kind === preferredKind ? index : -1))
        .filter((index) => index >= 0);
      if (preferred.length > 0) {
        return preferred;
      }

      return options.map((_, index) => index);
    },
    []
  );

  const fetchTmdbImageOptions = useCallback(
    async (
      movieId: number,
      signal?: AbortSignal
    ): Promise<{ options: TmdbImageOption[]; requestFailed: boolean }> => {
      if (!Number.isFinite(movieId) || movieId <= 0) {
        return { options: [], requestFailed: false };
      }

      const normalizedMovieId = Math.floor(movieId);
      const cached = coverEditorImageOptionsCacheRef.current[normalizedMovieId];
      if (Array.isArray(cached) && cached.length > 0) {
        return { options: cached, requestFailed: false };
      }

      const params = new URLSearchParams({
        movieId: String(normalizedMovieId),
        limit: String(COVER_EDITOR_IMAGE_FETCH_LIMIT),
        kind: 'all',
        cache: '1',
      });

      try {
        const imageResponse = await fetch(withBasePath(`/api/tmdb/images?${params.toString()}`), {
          signal,
        });
        const imagePayloadRaw: unknown = imageResponse.ok
          ? await imageResponse.json()
          : null;
        const options = isTmdbImagesResponse(imagePayloadRaw)
          ? [...imagePayloadRaw.posters, ...imagePayloadRaw.backdrops]
          : [];

        if (options.length > 0) {
          coverEditorImageOptionsCacheRef.current[normalizedMovieId] = options;
        }

        return {
          options,
          requestFailed: !imageResponse.ok,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { options: [], requestFailed: false };
        }
        return { options: [], requestFailed: true };
      }
    },
    []
  );

  const stopCoverEditorDropCycle = useCallback(() => {
    if (coverEditorDropCycleTimerRef.current !== null) {
      window.clearInterval(coverEditorDropCycleTimerRef.current);
      coverEditorDropCycleTimerRef.current = null;
    }
    if (coverEditorDropCycleAbortRef.current) {
      coverEditorDropCycleAbortRef.current.abort();
      coverEditorDropCycleAbortRef.current = null;
    }

    coverEditorDropCycleMovieIdRef.current = null;
    coverEditorDropCycleIndexRef.current = 0;
    coverEditorDropCyclePoolRef.current = [];
    setCoverEditorDropCycleImage(null);
  }, []);

  const buildCoverEditorDropCyclePool = useCallback(
    (options: TmdbImageOption[]): string[] => {
      const posterSourceUrls = options
        .filter((option) => option.kind === 'poster')
        .map((option) => option.sourceUrl);
      const primaryPool =
        posterSourceUrls.length > 0
          ? posterSourceUrls
          : options.map((option) => option.sourceUrl);
      const mergedPool = [
        ...primaryPool.slice(0, COVER_EDITOR_DROP_CYCLE_LIMIT),
      ];

      const uniquePool: string[] = [];
      for (const url of mergedPool) {
        if (!url || uniquePool.includes(url)) {
          continue;
        }
        uniquePool.push(url);
      }

      return uniquePool;
    },
    []
  );

  const fetchCoverEditorDropCycleRenderedCover = useCallback(
    async (
      movieId: number,
      sourceUrl: string,
      signal: AbortSignal
    ): Promise<string | null> => {
      const cacheKey = `${movieId}:${sourceUrl}`;
      const cached = coverEditorDropCycleRenderedCacheRef.current[cacheKey];
      if (cached) {
        return cached;
      }

      const response = await fetch(withBasePath('/api/vhs/render'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl,
          templateId: COVER_TEMPLATE_ID,
          width: COVER_EDITOR_DROP_CYCLE_RENDER_SIZE,
          height: COVER_EDITOR_DROP_CYCLE_RENDER_SIZE,
          fit: 'cover',
          format: 'webp',
          quality: COVER_EDITOR_DROP_CYCLE_RENDER_QUALITY,
          background: 'transparent',
          randomSeed: `drop-cycle-${movieId}`,
        }),
        signal,
      });

      if (!response.ok) {
        return null;
      }

      const renderedBlob = await response.blob();
      if (signal.aborted) {
        return null;
      }

      const renderedUrl = URL.createObjectURL(renderedBlob);
      coverEditorDropCycleRenderedCacheRef.current[cacheKey] = renderedUrl;
      return renderedUrl;
    },
    []
  );

  const randomizeMovieCoverPair = useCallback(
    async (movieId: number) => {
      if (!Number.isFinite(movieId) || movieId <= 0) {
        return;
      }

      const normalizedMovieId = Math.floor(movieId);
      if (randomizeMovieCoverInFlightRef.current[normalizedMovieId]) {
        return;
      }
      randomizeMovieCoverInFlightRef.current[normalizedMovieId] = true;

      stopCoverEditorDropCycle();
      setPendingSearch(null);
      setIsAddSlotPeek(false);
      setActiveSearchCover(null);
      setCoverEditor(null);

      const renderVariant = async (
        variant: CoverVariant,
        variantSettings: CustomCoverVariantSettings
      ): Promise<string | null> => {
        const templateId = variant === 'front' ? COVER_TEMPLATE_ID : SHELF_TEMPLATE_ID;
        const response = await fetch(withBasePath('/api/vhs/custom-cover'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            movieId: normalizedMovieId,
            sourceUrl: variantSettings.sourceUrl,
            sourceKind: variantSettings.sourceKind,
            templateId,
            fit: 'cover',
            format: 'webp',
            quality: 92,
            background: 'transparent',
            posterOffsetX: Math.round(variantSettings.offsetX),
            posterOffsetY: Math.round(variantSettings.offsetY),
            posterScale: variantSettings.scale,
          }),
        });
        if (!response.ok) {
          return null;
        }
        const payloadRaw: unknown = await response.json();
        if (!payloadRaw || typeof payloadRaw !== 'object') {
          return null;
        }
        const coverImage = (payloadRaw as { coverImage?: unknown }).coverImage;
        return typeof coverImage === 'string' ? coverImage : null;
      };

      try {
        const { options: imageOptions } = await fetchTmdbImageOptions(normalizedMovieId);
        if (imageOptions.length === 0) {
          return;
        }

        const pickRandomOption = (pool: TmdbImageOption[]): TmdbImageOption | null => {
          if (pool.length === 0) {
            return null;
          }
          return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? null;
        };

        const frontPool = getCoverEditorOptionPoolIndices(imageOptions, 'front')
          .map((index) => imageOptions[index] ?? null)
          .filter((option): option is TmdbImageOption => Boolean(option))
          .slice(0, COVER_RANDOMIZE_POOL_LIMIT);
        const spinePool = getCoverEditorOptionPoolIndices(imageOptions, 'spine')
          .map((index) => imageOptions[index] ?? null)
          .filter((option): option is TmdbImageOption => Boolean(option))
          .slice(0, COVER_RANDOMIZE_POOL_LIMIT);
        if (frontPool.length === 0 || spinePool.length === 0) {
          return;
        }

        const existingSettings = customCoverSettingsByMovieIdRef.current[normalizedMovieId];
        const currentFrontSourceUrl = existingSettings?.front.sourceUrl ?? null;
        const currentSpineSourceUrl = existingSettings?.spine.sourceUrl ?? null;
        const currentFrontCoverImage =
          floorMoviesRef.current.find((entry) => entry.id === normalizedMovieId)
            ?.coverImage ??
          sourceMoviesRef.current.find((entry) => entry.id === normalizedMovieId)
            ?.coverImage ??
          null;
        const frontCandidates = currentFrontSourceUrl
          ? frontPool.filter((option) => option.sourceUrl !== currentFrontSourceUrl)
          : frontPool;
        const spineCandidates = currentSpineSourceUrl
          ? spinePool.filter((option) => option.sourceUrl !== currentSpineSourceUrl)
          : spinePool;

        let frontOption = pickRandomOption(
          frontCandidates.length > 0 ? frontCandidates : frontPool
        );
        let spineOption = pickRandomOption(
          spineCandidates.length > 0 ? spineCandidates : spinePool
        );
        if (!frontOption || !spineOption) {
          return;
        }

        const pickedSameAsCurrent =
          Boolean(currentFrontSourceUrl) &&
          Boolean(currentSpineSourceUrl) &&
          frontOption.sourceUrl === currentFrontSourceUrl &&
          spineOption.sourceUrl === currentSpineSourceUrl;

        if (pickedSameAsCurrent) {
          const alternateFront = pickRandomOption(
            frontPool.filter((option) => option.sourceUrl !== currentFrontSourceUrl)
          );
          const alternateSpine = pickRandomOption(
            spinePool.filter((option) => option.sourceUrl !== currentSpineSourceUrl)
          );

          if (alternateFront) {
            frontOption = alternateFront;
          } else if (alternateSpine) {
            spineOption = alternateSpine;
          } else {
            return;
          }
        }

        let settings: MovieCustomCoverSettings = {
          front: {
            sourceUrl: frontOption.sourceUrl,
            sourceKind: frontOption.kind,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
          spine: {
            sourceUrl: spineOption.sourceUrl,
            sourceKind: spineOption.kind,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
        };

        const [initialFrontCoverImage, spineCoverImage] = await Promise.all([
          renderVariant('front', settings.front),
          renderVariant('spine', settings.spine),
        ]);
        let frontCoverImage = initialFrontCoverImage;
        if (!frontCoverImage || !spineCoverImage) {
          return;
        }

        if (currentFrontCoverImage && frontCoverImage === currentFrontCoverImage) {
          const alternateFrontOption = pickRandomOption(
            frontPool.filter((option) => option.sourceUrl !== settings.front.sourceUrl)
          );
          if (alternateFrontOption) {
            const alternateFrontSettings: CustomCoverVariantSettings = {
              sourceUrl: alternateFrontOption.sourceUrl,
              sourceKind: alternateFrontOption.kind,
              offsetX: 0,
              offsetY: 0,
              scale: 1,
            };
            const alternateFrontCoverImage = await renderVariant(
              'front',
              alternateFrontSettings
            );
            if (alternateFrontCoverImage) {
              settings = {
                ...settings,
                front: alternateFrontSettings,
              };
              frontCoverImage = alternateFrontCoverImage;
            }
          }
        }

        if (currentFrontCoverImage && frontCoverImage === currentFrontCoverImage) {
          return;
        }

        setCustomCoverSettingsByMovieId((previous) => ({
          ...previous,
          [normalizedMovieId]: settings,
        }));
        customCoverSettingsByMovieIdRef.current = {
          ...customCoverSettingsByMovieIdRef.current,
          [normalizedMovieId]: settings,
        };
        delete customFrontCoverCacheRef.current[normalizedMovieId];
        delete customSpineCoverCacheRef.current[normalizedMovieId];
        delete customFrontCoverPromiseRef.current[normalizedMovieId];
        delete customSpineCoverPromiseRef.current[normalizedMovieId];
        delete renderedCoverPromiseByMovieIdRef.current[normalizedMovieId];
        delete renderedSpineCoverPromiseByMovieIdRef.current[normalizedMovieId];

        customFrontCoverCacheRef.current[normalizedMovieId] = {
          hash: getCustomVariantSettingsHash(settings.front),
          coverImage: frontCoverImage,
        };
        customSpineCoverCacheRef.current[normalizedMovieId] = {
          hash: getCustomVariantSettingsHash(settings.spine),
          coverImage: spineCoverImage,
        };

        setFloorMovies((previous) =>
          previous.map((entry) =>
            entry.id === normalizedMovieId
              ? {
                  ...entry,
                  coverImage: frontCoverImage,
                }
              : entry
          )
        );
        setSourceMovies((previous) =>
          previous.map((entry) =>
            entry.id === normalizedMovieId
              ? {
                  ...entry,
                  coverImage: frontCoverImage,
                }
              : entry
          )
        );
        setShelfPreviewCoverByMovieId((previous) => ({
          ...previous,
          [normalizedMovieId]: spineCoverImage,
        }));
        setShelfMovies((previous) =>
          previous.map((entry) =>
            entry.id === normalizedMovieId
              ? {
                  ...entry,
                  coverImage: spineCoverImage,
                  frontCoverImage: frontCoverImage,
                }
              : entry
          )
        );

        triggerCoverEditorReturnAnimation(normalizedMovieId);
      } finally {
        delete randomizeMovieCoverInFlightRef.current[normalizedMovieId];
      }
    },
    [
      fetchTmdbImageOptions,
      getCoverEditorOptionPoolIndices,
      stopCoverEditorDropCycle,
      triggerCoverEditorReturnAnimation,
    ]
  );
  randomizeMovieCoverPairRef.current = (movieId: number) => {
    void randomizeMovieCoverPair(movieId);
  };

  useEffect(() => {
    if (coverEditor || draggingId === null || !isCoverEditorDropActive) {
      stopCoverEditorDropCycle();
      return;
    }

    const normalizedMovieId = Math.floor(draggingId);
    const draggingMovie =
      floorMoviesRef.current.find((movie) => movie.id === normalizedMovieId) ?? null;
    if (!draggingMovie) {
      stopCoverEditorDropCycle();
      return;
    }

    const controller = new AbortController();
    let effectCanceled = false;
    const startDropCycle = (pool: string[]) => {
      if (effectCanceled) {
        return;
      }

      const uniquePool = pool.filter((url, index) => url && pool.indexOf(url) === index);
      if (uniquePool.length === 0) {
        setCoverEditorDropCycleImage(draggingMovie.coverImage);
        return;
      }

      if (coverEditorDropCycleTimerRef.current !== null) {
        window.clearInterval(coverEditorDropCycleTimerRef.current);
        coverEditorDropCycleTimerRef.current = null;
      }
      coverEditorDropCycleMovieIdRef.current = normalizedMovieId;
      coverEditorDropCyclePoolRef.current = uniquePool;
      coverEditorDropCycleIndexRef.current = 0;
      setCoverEditorDropCycleImage(uniquePool[0] ?? draggingMovie.coverImage);

      if (uniquePool.length <= 1) {
        return;
      }

      coverEditorDropCycleTimerRef.current = window.setInterval(() => {
        const currentPool = coverEditorDropCyclePoolRef.current;
        if (currentPool.length <= 1) {
          return;
        }

        coverEditorDropCycleIndexRef.current =
          (coverEditorDropCycleIndexRef.current + 1) % currentPool.length;
        const nextImage = currentPool[coverEditorDropCycleIndexRef.current] ?? null;
        if (nextImage) {
          setCoverEditorDropCycleImage(nextImage);
        }
      }, COVER_EDITOR_DROP_CYCLE_INTERVAL_MS);
    };

    setCoverEditorDropCycleImage(draggingMovie.coverImage);
    startDropCycle([draggingMovie.coverImage]);

    if (coverEditorDropCycleAbortRef.current) {
      coverEditorDropCycleAbortRef.current.abort();
      coverEditorDropCycleAbortRef.current = null;
    }
    coverEditorDropCycleAbortRef.current = controller;

    const loadCycleImages = async (options: TmdbImageOption[]) => {
      const sourcePool = buildCoverEditorDropCyclePool(options);
      if (sourcePool.length === 0) {
        return;
      }

      for (const sourceUrl of sourcePool) {
        if (effectCanceled || controller.signal.aborted) {
          break;
        }

        try {
          const renderedUrl = await fetchCoverEditorDropCycleRenderedCover(
            normalizedMovieId,
            sourceUrl,
            controller.signal
          );
          if (!renderedUrl) {
            continue;
          }

          const currentPool = coverEditorDropCyclePoolRef.current;
          if (currentPool.includes(renderedUrl)) {
            continue;
          }

          coverEditorDropCyclePoolRef.current = [...currentPool, renderedUrl];
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            break;
          }
        }
      }
    };

    const cachedOptions = coverEditorImageOptionsCacheRef.current[normalizedMovieId] ?? [];
    const warmupTimer = window.setTimeout(() => {
      if (effectCanceled || controller.signal.aborted) {
        return;
      }

      if (cachedOptions.length > 0) {
        void loadCycleImages(cachedOptions);
        return;
      }

      void fetchTmdbImageOptions(normalizedMovieId, controller.signal)
        .then(({ options }) => loadCycleImages(options))
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        });
    }, COVER_EDITOR_DROP_CYCLE_WARMUP_MS);

    return () => {
      effectCanceled = true;
      window.clearTimeout(warmupTimer);
      if (coverEditorDropCycleAbortRef.current === controller) {
        controller.abort();
        coverEditorDropCycleAbortRef.current = null;
      }
    };
  }, [
    buildCoverEditorDropCyclePool,
    coverEditor,
    draggingId,
    fetchCoverEditorDropCycleRenderedCover,
    fetchTmdbImageOptions,
    isCoverEditorDropActive,
    stopCoverEditorDropCycle,
  ]);

  const saveCoverEditorSettings = useCallback(async () => {
    if (!coverEditor) {
      return;
    }

    const frontOption = getCoverEditorOptionAtIndex(
      coverEditorImageOptions,
      coverEditor.frontImageIndex
    );
    const spineOption = getCoverEditorOptionAtIndex(
      coverEditorImageOptions,
      coverEditor.spineImageIndex
    );
    if (!frontOption || !spineOption) {
      setCoverEditorError('Mangler gyldig bildekilde for front eller side.');
      return;
    }

    const settings: MovieCustomCoverSettings = {
      front: {
        sourceUrl: frontOption.sourceUrl,
        sourceKind: frontOption.kind,
        offsetX: Math.round(coverEditor.frontOffsetX),
        offsetY: Math.round(coverEditor.frontOffsetY),
        scale: clamp(coverEditor.frontScale, 0.45, 2.6),
      },
      spine: {
        sourceUrl: spineOption.sourceUrl,
        sourceKind: spineOption.kind,
        offsetX: Math.round(coverEditor.spineOffsetX),
        offsetY: Math.round(coverEditor.spineOffsetY),
        scale: clamp(coverEditor.spineScale, 0.45, 2.6),
      },
    };

    setCoverEditor((current) =>
      current ? { ...current, saving: true } : current
    );
    setCoverEditorError(null);
    setCustomCoverSettingsByMovieId((previous) => ({
      ...previous,
      [coverEditor.movieId]: settings,
    }));
    customCoverSettingsByMovieIdRef.current = {
      ...customCoverSettingsByMovieIdRef.current,
      [coverEditor.movieId]: settings,
    };
    delete customFrontCoverCacheRef.current[coverEditor.movieId];
    delete customSpineCoverCacheRef.current[coverEditor.movieId];
    delete customFrontCoverPromiseRef.current[coverEditor.movieId];
    delete customSpineCoverPromiseRef.current[coverEditor.movieId];
    delete renderedCoverPromiseByMovieIdRef.current[coverEditor.movieId];
    delete renderedSpineCoverPromiseByMovieIdRef.current[coverEditor.movieId];

    const renderVariant = async (
      variant: CoverVariant,
      variantSettings: CustomCoverVariantSettings
    ): Promise<string | null> => {
      const templateId = variant === 'front' ? COVER_TEMPLATE_ID : SHELF_TEMPLATE_ID;
      const response = await fetch(withBasePath('/api/vhs/custom-cover'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          movieId: coverEditor.movieId,
          sourceUrl: variantSettings.sourceUrl,
          sourceKind: variantSettings.sourceKind,
          templateId,
          fit: 'cover',
          format: 'webp',
          quality: 92,
          background: 'transparent',
          posterOffsetX: Math.round(variantSettings.offsetX),
          posterOffsetY: Math.round(variantSettings.offsetY),
          posterScale: variantSettings.scale,
        }),
      });
      if (!response.ok) {
        return null;
      }
      const payloadRaw: unknown = await response.json();
      if (!payloadRaw || typeof payloadRaw !== 'object') {
        return null;
      }
      const coverImage = (payloadRaw as { coverImage?: unknown }).coverImage;
      return typeof coverImage === 'string' ? coverImage : null;
    };

    const [frontCoverImage, spineCoverImage] = await Promise.all([
      renderVariant('front', settings.front),
      renderVariant('spine', settings.spine),
    ]);

    if (!frontCoverImage || !spineCoverImage) {
      setCoverEditor((current) =>
        current ? { ...current, saving: false } : current
      );
      setCoverEditorError('Klarte ikke å lagre nye covers. Prøv igjen.');
      return;
    }

    customFrontCoverCacheRef.current[coverEditor.movieId] = {
      hash: getCustomVariantSettingsHash(settings.front),
      coverImage: frontCoverImage,
    };
    customSpineCoverCacheRef.current[coverEditor.movieId] = {
      hash: getCustomVariantSettingsHash(settings.spine),
      coverImage: spineCoverImage,
    };

    setFloorMovies((previous) =>
      previous.map((entry) =>
        entry.id === coverEditor.movieId
          ? {
              ...entry,
              coverImage: frontCoverImage,
            }
          : entry
      )
    );
    setSourceMovies((previous) =>
      previous.map((entry) =>
        entry.id === coverEditor.movieId
          ? {
              ...entry,
              coverImage: frontCoverImage,
            }
          : entry
      )
    );
    setShelfPreviewCoverByMovieId((previous) => ({
      ...previous,
      [coverEditor.movieId]: spineCoverImage,
    }));
    setShelfMovies((previous) =>
      previous.map((entry) =>
        entry.id === coverEditor.movieId
          ? {
              ...entry,
              coverImage: spineCoverImage,
              frontCoverImage: frontCoverImage,
            }
          : entry
      )
    );

    const bounds = getFloorBounds();
    const targetX = clamp(
      bounds.width * 0.45 + (Math.random() - 0.5) * 220 - CARD_WIDTH * 0.5,
      0,
      Math.max(0, bounds.width - CARD_WIDTH)
    );
    const targetY = clamp(
      bounds.height * 0.5 + (Math.random() - 0.5) * 180 - CARD_HEIGHT * 0.5,
      0,
      Math.max(0, bounds.height - CARD_HEIGHT)
    );
    const targetRotation = clampCardRotation((Math.random() - 0.5) * 14);
    setFloorMovies((previous) =>
      recalculateHierarchy(
        previous.map((entry) =>
          entry.id === coverEditor.movieId
            ? {
                ...entry,
                x: targetX,
                y: targetY,
                rotation: targetRotation,
              }
            : entry
        ),
        bounds.height
      )
    );
    triggerCoverEditorReturnAnimation(coverEditor.movieId);
    setCoverEditor(null);
  }, [
    coverEditor,
    coverEditorImageOptions,
    getFloorBounds,
    getCoverEditorOptionAtIndex,
    triggerCoverEditorReturnAnimation,
  ]);

  const handleCoverEditorBackdropPointerDown = useCallback(() => {
    if (!coverEditor || coverEditor.saving) {
      return;
    }

    if (coverEditorImagesLoading || coverEditorImageOptions.length === 0) {
      setCoverEditor(null);
      return;
    }

    void saveCoverEditorSettings();
  }, [
    coverEditor,
    coverEditorImageOptions.length,
    coverEditorImagesLoading,
    saveCoverEditorSettings,
  ]);

  const handleCoverEditorVariantPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, variant: CoverVariant) => {
      event.preventDefault();
      event.stopPropagation();

      setCoverEditor((current) => {
        if (!current || current.saving || coverEditorImageOptions.length === 0) {
          return current;
        }

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture errors on unsupported targets.
        }

        const startOffsetX =
          variant === 'front' ? current.frontOffsetX : current.spineOffsetX;
        const startOffsetY =
          variant === 'front' ? current.frontOffsetY : current.spineOffsetY;
        coverEditorAdjustDragRef.current = {
          variant,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startOffsetX,
          startOffsetY,
        };

        return {
          ...current,
          focusVariant: variant,
        };
      });
    },
    [coverEditorImageOptions.length]
  );

  useEffect(() => {
    if (!coverEditor) {
      setCoverEditorFrontPreview(null);
      setCoverEditorSpinePreview(null);
    }
  }, [coverEditor]);

  useEffect(() => {
    if (!coverEditor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!coverEditor) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCoverEditor(null);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (coverEditor.saving) {
          return;
        }

        if (coverEditorImagesLoading || coverEditorImageOptions.length === 0) {
          setCoverEditor(null);
          return;
        }

        void saveCoverEditorSettings();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        setCoverEditor((current) =>
          current
            ? {
                ...current,
                focusVariant:
                  current.focusVariant === 'front' ? 'spine' : 'front',
              }
            : current
        );
        return;
      }

      const optionCount = coverEditorImageOptions.length;
      if (optionCount <= 0) {
        return;
      }

      const cycleFocusedVariantImage = (delta: number) => {
        setCoverEditor((current) => {
          if (!current) {
            return current;
          }

          const pool = getCoverEditorOptionPoolIndices(
            coverEditorImageOptions,
            current.focusVariant
          );
          const currentIndex =
            current.focusVariant === 'front'
              ? current.frontImageIndex
              : current.spineImageIndex;
          const currentPoolIndex = pool.indexOf(currentIndex);
          const startPoolIndex =
            currentPoolIndex >= 0 ? currentPoolIndex : delta > 0 ? -1 : 0;
          const nextPoolIndex =
            (startPoolIndex + delta + pool.length) % pool.length;
          const nextIndex = pool[nextPoolIndex] ?? currentIndex;

          if (current.focusVariant === 'front') {
            return {
              ...current,
              frontImageIndex: nextIndex,
            };
          }

          return {
            ...current,
            spineImageIndex: nextIndex,
          };
        });
      };

      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown'
      ) {
        event.preventDefault();

        if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          const scaleDelta = event.key === 'ArrowUp' ? 0.03 : -0.03;
          setCoverEditor((current) => {
            if (!current) {
              return current;
            }

            if (current.focusVariant === 'front') {
              return {
                ...current,
                frontScale: clamp(current.frontScale + scaleDelta, 0.45, 2.6),
              };
            }

            return {
              ...current,
              spineScale: clamp(current.spineScale + scaleDelta, 0.45, 2.6),
            };
          });
          return;
        }

        const delta =
          event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        cycleFocusedVariantImage(delta);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    coverEditor,
    coverEditorImageOptions,
    coverEditorImagesLoading,
    getCoverEditorOptionPoolIndices,
    saveCoverEditorSettings,
  ]);

  useEffect(() => {
    if (!coverEditor) {
      coverEditorAdjustDragRef.current = null;
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = coverEditorAdjustDragRef.current;
      if (!drag) {
        return;
      }

      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;
      const offsetX = clamp(Math.round(drag.startOffsetX + deltaX), -560, 560);
      const offsetY = clamp(Math.round(drag.startOffsetY + deltaY), -560, 560);
      setCoverEditor((current) => {
        if (!current || current.saving) {
          return current;
        }

        if (drag.variant === 'front') {
          if (
            current.frontOffsetX === offsetX &&
            current.frontOffsetY === offsetY &&
            current.focusVariant === 'front'
          ) {
            return current;
          }

          return {
            ...current,
            focusVariant: 'front',
            frontOffsetX: offsetX,
            frontOffsetY: offsetY,
          };
        }

        if (
          current.spineOffsetX === offsetX &&
          current.spineOffsetY === offsetY &&
          current.focusVariant === 'spine'
        ) {
          return current;
        }

        return {
          ...current,
          focusVariant: 'spine',
          spineOffsetX: offsetX,
          spineOffsetY: offsetY,
        };
      });
    };

    const handlePointerUp = () => {
      coverEditorAdjustDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [coverEditor]);

  const fetchSearchPreviewCover = useCallback(
    async (
      movie: SearchMovie,
      tier: SearchPreviewTier,
      signal: AbortSignal
    ): Promise<string | null> => {
      const sourceUrl = getSearchMovieSourceImage(movie);
      if (!sourceUrl) {
        return null;
      }

      const previewStep = getSearchPreviewStep(tier);

      const response = await fetch(withBasePath('/api/vhs/render'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl,
          templateId: COVER_TEMPLATE_ID,
          width: previewStep.size,
          height: previewStep.size,
          fit: 'cover',
          format: 'webp',
          quality: previewStep.quality,
          background: 'transparent',
          randomSeed: `movie-${movie.id}`,
        }),
        signal,
      });

      if (!response.ok) {
        return null;
      }

      const previewBlob = await response.blob();
      return URL.createObjectURL(previewBlob);
    },
    []
  );

  const fetchRenderedCoverForMovie = useCallback(async (movieId: number) => {
    const params = new URLSearchParams({
      movieId: String(movieId),
      limit: '1',
      renderer: 'sharp',
      templateId: COVER_TEMPLATE_ID,
    });

    const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
    if (!response.ok) {
      return null;
    }

    const payloadRaw: unknown = await response.json();
    if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
      return null;
    }

    return payloadRaw.movies[0] ?? null;
  }, []);

  const fetchRenderedSpineCoverForMovie = useCallback(async (movieId: number) => {
    const params = new URLSearchParams({
      movieId: String(movieId),
      limit: '1',
      renderer: 'sharp',
      templateId: SHELF_TEMPLATE_ID,
      imageType: SHELF_SOURCE_IMAGE_TYPE,
    });

    const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
    if (!response.ok) {
      return null;
    }

    const payloadRaw: unknown = await response.json();
    if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
      return null;
    }

    return payloadRaw.movies[0] ?? null;
  }, []);

  const getMovieTitleById = useCallback((movieId: number): string => {
    const floorTitle = floorMoviesRef.current.find((entry) => entry.id === movieId)?.title;
    if (floorTitle) {
      return floorTitle;
    }

    const shelfTitle = shelfMoviesRef.current.find((entry) => entry.id === movieId)?.title;
    if (shelfTitle) {
      return shelfTitle;
    }

    const sourceTitle = sourceMoviesRef.current.find((entry) => entry.id === movieId)?.title;
    if (sourceTitle) {
      return sourceTitle;
    }

    return `Movie ${movieId}`;
  }, []);

  const fetchCustomCoverImageForVariant = useCallback(
    async (
      movieId: number,
      variant: CoverVariant,
      settings: CustomCoverVariantSettings
    ): Promise<string | null> => {
      const templateId = variant === 'front' ? COVER_TEMPLATE_ID : SHELF_TEMPLATE_ID;
      const response = await fetch(withBasePath('/api/vhs/custom-cover'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          movieId,
          sourceUrl: settings.sourceUrl,
          sourceKind: settings.sourceKind,
          templateId,
          fit: 'cover',
          format: 'webp',
          quality: 92,
          background: 'transparent',
          posterOffsetX: Math.round(settings.offsetX),
          posterOffsetY: Math.round(settings.offsetY),
          posterScale: settings.scale,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const payloadRaw: unknown = await response.json();
      if (!payloadRaw || typeof payloadRaw !== 'object') {
        return null;
      }

      const coverImage = (payloadRaw as { coverImage?: unknown }).coverImage;
      return typeof coverImage === 'string' ? coverImage : null;
    },
    []
  );

  const getCustomCoverImageForVariantPromise = useCallback(
    (movieId: number, variant: CoverVariant): Promise<string | null> => {
      const movieSettings = customCoverSettingsByMovieIdRef.current[movieId];
      if (!movieSettings) {
        return Promise.resolve(null);
      }

      const variantSettings = movieSettings[variant];
      const variantHash = getCustomVariantSettingsHash(variantSettings);
      const cacheRef =
        variant === 'front' ? customFrontCoverCacheRef : customSpineCoverCacheRef;
      const promiseRef =
        variant === 'front' ? customFrontCoverPromiseRef : customSpineCoverPromiseRef;

      const cached = cacheRef.current[movieId];
      if (cached && cached.hash === variantHash) {
        return Promise.resolve(cached.coverImage);
      }

      const inFlight = promiseRef.current[movieId];
      if (inFlight && inFlight.hash === variantHash) {
        return inFlight.promise;
      }

      const promise = fetchCustomCoverImageForVariant(
        movieId,
        variant,
        variantSettings
      ).then((coverImage) => {
        if (coverImage) {
          cacheRef.current[movieId] = {
            hash: variantHash,
            coverImage,
          };
        }
        return coverImage;
      });

      promiseRef.current[movieId] = {
        hash: variantHash,
        promise,
      };

      return promise;
    },
    [fetchCustomCoverImageForVariant]
  );

  const getCustomRenderedCoverPromise = useCallback(
    async (movieId: number, variant: CoverVariant): Promise<ClubMovie | null> => {
      const coverImage = await getCustomCoverImageForVariantPromise(movieId, variant);
      if (!coverImage) {
        return null;
      }

      return {
        id: movieId,
        title: getMovieTitleById(movieId),
        coverImage,
      };
    },
    [getCustomCoverImageForVariantPromise, getMovieTitleById]
  );

  const applyCustomCoversToCollections = useCallback(
    (movieId: number, frontCoverImage: string, spineCoverImage: string) => {
      setFloorMovies((previous) => {
        let changed = false;
        const next = previous.map((entry) => {
          if (entry.id !== movieId || entry.coverImage === frontCoverImage) {
            return entry;
          }
          changed = true;
          return {
            ...entry,
            coverImage: frontCoverImage,
          };
        });

        return changed ? next : previous;
      });

      setSourceMovies((previous) => {
        let changed = false;
        const next = previous.map((entry) => {
          if (entry.id !== movieId || entry.coverImage === frontCoverImage) {
            return entry;
          }
          changed = true;
          return {
            ...entry,
            coverImage: frontCoverImage,
          };
        });
        return changed ? next : previous;
      });

      setShelfPreviewCoverByMovieId((previous) => {
        const existing = previous[movieId];
        if (existing === spineCoverImage) {
          return previous;
        }
        return {
          ...previous,
          [movieId]: spineCoverImage,
        };
      });

      setShelfMovies((previous) => {
        let changed = false;
        const next = previous.map((entry) => {
          if (entry.id !== movieId) {
            return entry;
          }

          if (
            entry.coverImage === spineCoverImage &&
            entry.frontCoverImage === frontCoverImage
          ) {
            return entry;
          }

          changed = true;
          return {
            ...entry,
            coverImage: spineCoverImage,
            frontCoverImage: frontCoverImage,
          };
        });

        return changed ? next : previous;
      });
    },
    []
  );

  const getRenderedSpineCoverPromise = useCallback(
    (movieId: number): Promise<ClubMovie | null> => {
      if (customCoverSettingsByMovieIdRef.current[movieId]) {
        return getCustomRenderedCoverPromise(movieId, 'spine');
      }

      const existing = renderedSpineCoverPromiseByMovieIdRef.current[movieId];
      if (existing) {
        return existing;
      }

      const promise = fetchRenderedSpineCoverForMovie(movieId)
        .catch(() => null)
        .then((rendered) => {
          if (!rendered) {
            delete renderedSpineCoverPromiseByMovieIdRef.current[movieId];
          }

          return rendered;
        });
      renderedSpineCoverPromiseByMovieIdRef.current[movieId] = promise;
      return promise;
    },
    [fetchRenderedSpineCoverForMovie, getCustomRenderedCoverPromise]
  );

  const getRenderedCoverPromise = useCallback(
    (movieId: number): Promise<ClubMovie | null> => {
      if (customCoverSettingsByMovieIdRef.current[movieId]) {
        return getCustomRenderedCoverPromise(movieId, 'front');
      }

      const existing = renderedCoverPromiseByMovieIdRef.current[movieId];
      if (existing) {
        return existing;
      }

      const promise = fetchRenderedCoverForMovie(movieId)
        .catch(() => null)
        .then((rendered) => {
          if (!rendered) {
            delete renderedCoverPromiseByMovieIdRef.current[movieId];
            return null;
          }

          // Keep a spine variant hot in cache as soon as front cover work starts.
          void getRenderedSpineCoverPromise(movieId);
          return rendered;
        });
      renderedCoverPromiseByMovieIdRef.current[movieId] = promise;
      return promise;
    },
    [
      fetchRenderedCoverForMovie,
      getCustomRenderedCoverPromise,
      getRenderedSpineCoverPromise,
    ]
  );

  const hydrateCustomCoversForMovie = useCallback(
    (movieId: number): Promise<void> => {
      const settings = customCoverSettingsByMovieIdRef.current[movieId];
      if (!settings) {
        return Promise.resolve();
      }

      return Promise.all([
        getCustomRenderedCoverPromise(movieId, 'front'),
        getCustomRenderedCoverPromise(movieId, 'spine'),
      ]).then(([front, spine]) => {
        if (!front?.coverImage || !spine?.coverImage) {
          return;
        }

        applyCustomCoversToCollections(movieId, front.coverImage, spine.coverImage);
      });
    },
    [applyCustomCoversToCollections, getCustomRenderedCoverPromise]
  );

  useEffect(() => {
    let cancelled = false;

    const loadShelf = async () => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        const raw = window.localStorage.getItem(SHELF_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isShelfStoragePayload(parsed) && parsed.movies.length > 0) {
            if (!cancelled) {
              setShelfMovies(
                parsed.movies.map((movie) => ({
                  ...movie,
                  frontCoverImage: getStableCoverImage(movie.frontCoverImage),
                }))
              );
            }
            return;
          }
        }
      } catch {
        // Ignore storage parse issues and fall back to starter shelf.
      }

      try {
        const params = new URLSearchParams({
          limit: '6',
          renderer: 'sharp',
          templateId: SHELF_TEMPLATE_ID,
          imageType: SHELF_SOURCE_IMAGE_TYPE,
          titles: SHELF_STARTER_TITLES_QUERY,
        });
        const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
        if (!response.ok || cancelled) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
          return;
        }

        const starters: ShelfMovie[] = payloadRaw.movies.map((movie) => ({
          id: movie.id,
          title: movie.title,
          coverImage: movie.coverImage,
          frontCoverImage: undefined,
        }));
        if (!cancelled) {
          setShelfMovies(starters);
        }
      } catch {
        // Keep shelf empty if starters cannot be loaded.
      }
    };

    void loadShelf();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: ShelfStoragePayload = {
      movies: shelfMovies,
    };

    try {
      window.localStorage.setItem(SHELF_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors.
    }
  }, [shelfMovies]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(COVER_CUSTOM_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed: unknown = JSON.parse(raw);
      if (!isCustomCoverSettingsStoragePayload(parsed)) {
        return;
      }

      setCustomCoverSettingsByMovieId(
        toCustomSettingsRecord(parsed.movieSettings)
      );
    } catch {
      // Ignore parse/storage failures.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: CustomCoverSettingsStoragePayload = {
      movieSettings: toCustomSettingsStorageRecord(customCoverSettingsByMovieId),
    };

    try {
      window.localStorage.setItem(
        COVER_CUSTOM_SETTINGS_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // Ignore storage quota errors.
    }
  }, [customCoverSettingsByMovieId]);

  useEffect(() => {
    const movieIds = Array.from(
      new Set([
        ...sourceMovies.map((movie) => movie.id),
        ...floorMovies.map((movie) => movie.id),
        ...shelfMovies.map((movie) => movie.id),
      ])
    ).filter((movieId) => Boolean(customCoverSettingsByMovieIdRef.current[movieId]));

    if (movieIds.length === 0) {
      return;
    }

    for (const movieId of movieIds) {
      void hydrateCustomCoversForMovie(movieId);
    }
  }, [floorMovies, hydrateCustomCoversForMovie, shelfMovies, sourceMovies]);

  useEffect(() => {
    const movieIds = Array.from(new Set(sourceMovies.map((movie) => movie.id)));
    if (movieIds.length === 0) {
      return;
    }

    for (const movieId of movieIds) {
      void getRenderedSpineCoverPromise(movieId);
    }
  }, [getRenderedSpineCoverPromise, sourceMovies]);

  useEffect(() => {
    const needsSpineHydration = shelfMovies
      .filter(
        (movie) =>
          !movie.coverImage.includes(`-${SHELF_TEMPLATE_ID}-`) ||
          !movie.coverImage.includes(`-${SHELF_SOURCE_IMAGE_TYPE}-`)
      )
      .map((movie) => movie.id);

    if (needsSpineHydration.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(needsSpineHydration));
    for (const movieId of uniqueIds) {
      void getRenderedSpineCoverPromise(movieId).then((renderedCover) => {
        if (!renderedCover) {
          return;
        }

        setShelfMovies((previous) =>
          previous.map((entry) =>
            entry.id === renderedCover.id
              ? {
                  ...entry,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : entry
          )
        );
      });
    }
  }, [getRenderedSpineCoverPromise, shelfMovies]);

  useEffect(() => {
    if (!isShelfDropActive || draggingId === null) {
      return;
    }

    if (shelfMovies.some((movie) => movie.id === draggingId)) {
      return;
    }

    const existingPreview = shelfPreviewCoverByMovieId[draggingId];
    if (
      existingPreview?.includes(`-${SHELF_TEMPLATE_ID}-`) &&
      existingPreview.includes(`-${SHELF_SOURCE_IMAGE_TYPE}-`)
    ) {
      return;
    }

    void getRenderedSpineCoverPromise(draggingId).then((renderedCover) => {
      if (!renderedCover) {
        return;
      }

      setShelfPreviewCoverByMovieId((previous) => ({
        ...previous,
        [draggingId]: renderedCover.coverImage,
      }));
    });
  }, [
    draggingId,
    getRenderedSpineCoverPromise,
    isShelfDropActive,
    shelfMovies,
    shelfPreviewCoverByMovieId,
  ]);

  function moveMovieToShelf(movieId: number, insertIndex = 0): void {
    const movie = floorMoviesRef.current.find((entry) => entry.id === movieId);
    if (!movie) {
      return;
    }
    const withoutMovie = shelfMoviesRef.current.filter((entry) => entry.id !== movie.id);
    const normalizedInsertIndex = clamp(
      Math.round(insertIndex),
      0,
      withoutMovie.length
    );
    const bounds = getFloorBounds();
    setFloorMovies((previous) =>
      recalculateHierarchy(
        previous.filter((entry) => entry.id !== movieId),
        bounds.height
      )
    );
    setSourceMovies((previous) =>
      previous.filter((entry) => entry.id !== movieId)
    );
    setPreviewCoverByMovieId((previous) => {
      const stalePreview = previous[movieId];
      if (stalePreview) {
        URL.revokeObjectURL(stalePreview);
      }

      const { [movieId]: _removed, ...rest } = previous;
      return rest;
    });
    setPreviewTierByMovieId((previous) => {
      const { [movieId]: _removed, ...rest } = previous;
      return rest;
    });
    setProximityVsPairs((current) =>
      current.filter((pair) => !pairHasMovie(pair, movieId))
    );
    setShelfMovies((previous) => {
      const existing = previous.find((entry) => entry.id === movie.id);
      const withoutMovie = previous.filter((entry) => entry.id !== movie.id);
      const stableExistingFrontCover = getStableCoverImage(existing?.frontCoverImage);
      const stableMovieFrontCover = getStableCoverImage(movie.coverImage);
      const nextEntry: ShelfMovie = {
        id: movie.id,
        title: movie.title,
        coverImage:
          existing?.coverImage ??
          shelfPreviewCoverByMovieId[movie.id] ??
          SHELF_PLACEHOLDER_IMAGE,
        frontCoverImage: stableExistingFrontCover ?? stableMovieFrontCover,
      };

      return [
        ...withoutMovie.slice(0, normalizedInsertIndex),
        nextEntry,
        ...withoutMovie.slice(normalizedInsertIndex),
      ];
    });
    setShelfRecentlyInsertedMovieId(movie.id);

    void getRenderedSpineCoverPromise(movie.id).then((renderedCover) => {
      if (!renderedCover) {
        return;
      }

      setShelfMovies((previous) =>
        previous.map((entry) =>
          entry.id === renderedCover.id
            ? {
                ...entry,
                title: renderedCover.title,
                coverImage: renderedCover.coverImage,
                frontCoverImage:
                  getStableCoverImage(entry.frontCoverImage) ??
                  getStableCoverImage(movie.coverImage),
              }
            : entry
        )
      );
    });

    void getRenderedCoverPromise(movie.id).then((renderedCover) => {
      if (!renderedCover) {
        return;
      }

      setShelfMovies((previous) =>
        previous.map((entry) =>
          entry.id === renderedCover.id
            ? {
                ...entry,
                title: renderedCover.title,
                frontCoverImage: renderedCover.coverImage,
              }
            : entry
        )
      );
    });
  }

  moveMovieToShelfRef.current = moveMovieToShelf;

  const beginDragFromShelf = useCallback(
    (movie: ShelfMovie, pointerEvent: PointerEvent) => {
      const bounds = getFloorBounds();
      const targetX = clamp(
        pointerEvent.clientX - bounds.left - CARD_WIDTH * 0.5,
        0,
        Math.max(0, bounds.width - CARD_WIDTH)
      );
      const targetY = clamp(
        pointerEvent.clientY - bounds.top - CARD_HEIGHT * 0.5,
        0,
        Math.max(0, bounds.height - CARD_HEIGHT)
      );
      const stableFrontCoverImage = getStableCoverImage(movie.frontCoverImage);
      const fallbackMovie: ClubMovie = {
        id: movie.id,
        title: movie.title,
        coverImage: stableFrontCoverImage ?? WAITING_SLOT_IMAGE,
      };
      const baseRotation = getRandomCardRotation();
      const pointerXWithinCard = pointerEvent.clientX - bounds.left - targetX;
      const pointerYWithinCard = pointerEvent.clientY - bounds.top - targetY;
      const grabOffsetFromCenterX = pointerXWithinCard - CARD_WIDTH * 0.5;
      const grabOffsetFromCenterY = pointerYWithinCard - CARD_HEIGHT * 0.5;

      setPendingSearch(null);
      clearDeleteHoldTimer();
      clearDeleteClearAllTimer();
      resetProximityVsCandidate();
      deleteInZoneRef.current = false;
      deleteHoldMovieIdRef.current = null;
      deleteClearAllMovieIdRef.current = null;
      setDeleteCandidateId(null);
      setDeleteArmedId(null);
      setDeleteClearAllArmedId(null);
      setIsShelfDropActive(false);
      setIsCoverEditorDropActive(false);
      updateShelfDropInsertIndex(null);
      setShelfRecentlyInsertedMovieId((current) =>
        current === movie.id ? null : current
      );

      setShelfMovies((previous) =>
        previous.filter((entry) => entry.id !== movie.id)
      );
      setFloorMovies((previous) => {
        const withoutMovie = previous.filter((entry) => entry.id !== movie.id);
        const maxZ = withoutMovie.reduce((current, entry) => Math.max(current, entry.z), 1);
        const next = [
          ...withoutMovie,
          {
            ...fallbackMovie,
            x: targetX,
            y: targetY,
            rotation: baseRotation,
            z: maxZ + 1,
            rank: withoutMovie.length + 1,
            score: 0,
          },
        ];
        return recalculateHierarchy(next, bounds.height);
      });
      setSourceMovies((previous) => {
        const existing = previous.find((entry) => entry.id === fallbackMovie.id);
        if (existing) {
          return previous.map((entry) =>
            entry.id === fallbackMovie.id ? fallbackMovie : entry
          );
        }

        return [...previous, fallbackMovie];
      });

      dragRef.current = {
        id: fallbackMovie.id,
        offsetX: pointerXWithinCard,
        offsetY: pointerYWithinCard,
        baseRotation,
        grabOffsetNormX: clamp(grabOffsetFromCenterX / (CARD_WIDTH * 0.5), -1, 1),
        grabOffsetNormY: clamp(grabOffsetFromCenterY / (CARD_HEIGHT * 0.5), -1, 1),
        lastClientX: pointerEvent.clientX,
        lastClientY: pointerEvent.clientY,
        lastTimestamp: performance.now(),
        velocityX: 0,
        velocityY: 0,
      };
      setDraggingId(fallbackMovie.id);

      void getRenderedCoverPromise(fallbackMovie.id).then((renderedCover) => {
        if (!renderedCover) {
          return;
        }

        setFloorMovies((previous) =>
          previous.map((entry) =>
            entry.id === renderedCover.id
              ? {
                  ...entry,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : entry
          )
        );
        setSourceMovies((previous) =>
          previous.map((entry) =>
            entry.id === renderedCover.id
              ? {
                  ...entry,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : entry
          )
        );
      });
    },
    [
      clearDeleteClearAllTimer,
      clearDeleteHoldTimer,
      getFloorBounds,
      getRenderedCoverPromise,
      resetProximityVsCandidate,
      updateShelfDropInsertIndex,
    ]
  );
  beginDragFromShelfRef.current = beginDragFromShelf;

  const handleShelfPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, movie: ShelfMovie) => {
      if (isDeleteClearAllSequenceActive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      shelfDragCandidateRef.current = {
        movie,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
    },
    [isDeleteClearAllSequenceActive]
  );

  const restoreMovieFromShelf = useCallback(
    (movieId: number, clientX?: number, clientY?: number) => {
      const shelfMovie = shelfMovies.find((entry) => entry.id === movieId);
      if (!shelfMovie) {
        return;
      }

      setShelfMovies((previous) =>
        previous.filter((entry) => entry.id !== movieId)
      );

      const bounds = getFloorBounds();
      const hasPointerPosition =
        typeof clientX === 'number' && Number.isFinite(clientX) &&
        typeof clientY === 'number' && Number.isFinite(clientY);
      const pointerX = hasPointerPosition
        ? clientX
        : bounds.left + CARD_WIDTH * 0.5;
      const pointerY = hasPointerPosition
        ? clientY
        : bounds.top + CARD_HEIGHT * 0.5;
      const laneIndex = floorMoviesRef.current.length % 6;
      const targetX = hasPointerPosition
        ? clamp(
            pointerX - bounds.left - CARD_WIDTH * 0.5,
            0,
            Math.max(0, bounds.width - CARD_WIDTH)
          )
        : clamp(
            SHELF_OPEN_WIDTH + 28 + laneIndex * 24 + Math.random() * 18,
            0,
            Math.max(0, bounds.width - CARD_WIDTH)
          );
      const targetY = hasPointerPosition
        ? clamp(
            pointerY - bounds.top - CARD_HEIGHT * 0.5,
            0,
            Math.max(0, bounds.height - CARD_HEIGHT)
          )
        : clamp(
            bounds.height * 0.32 + (laneIndex - 2.5) * 22 + (Math.random() - 0.5) * 18,
            0,
            Math.max(0, bounds.height - CARD_HEIGHT)
          );
      const targetRotation = clampCardRotation((Math.random() - 0.5) * 8);
      const stableFrontCoverImage = getStableCoverImage(shelfMovie.frontCoverImage);
      const fallbackMovie: ClubMovie = {
        id: shelfMovie.id,
        title: shelfMovie.title,
        coverImage: stableFrontCoverImage ?? WAITING_SLOT_IMAGE,
      };

      addMovieToFloor(fallbackMovie, targetX, targetY, targetRotation);
      setSourceMovies((previous) => {
        const existing = previous.find((entry) => entry.id === shelfMovie.id);
        if (existing) {
          return previous.map((entry) =>
            entry.id === shelfMovie.id ? fallbackMovie : entry
          );
        }

        return [...previous, fallbackMovie];
      });

      void getRenderedCoverPromise(shelfMovie.id).then((renderedCover) => {
        if (!renderedCover) {
          return;
        }

        setFloorMovies((previous) =>
          previous.map((movie) =>
            movie.id === renderedCover.id
              ? {
                  ...movie,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : movie
          )
        );
        setSourceMovies((previous) =>
          previous.map((movie) =>
            movie.id === renderedCover.id
              ? {
                  ...movie,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : movie
          )
        );
      });
    },
    [
      addMovieToFloor,
      getFloorBounds,
      getRenderedCoverPromise,
      shelfMovies,
    ]
  );
  restoreMovieFromShelfRef.current = restoreMovieFromShelf;

  const confirmPendingSearch = useCallback(async () => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    const slot = getEmptySlotPosition();
    const slotOffsetY = getAddSlotOffset();
    const targetX = clamp(
      slot.x - CARD_WIDTH * (0.78 + Math.random() * 0.92),
      0,
      Math.max(0, floorWidth - CARD_WIDTH)
    );
    const targetY = clamp(
      slot.y - CARD_HEIGHT * (0.08 + Math.random() * 0.58),
      0,
      Math.max(0, floorHeight - CARD_HEIGHT)
    );
    const targetRotation = getRandomCardRotation();
    const selectedPreviewCover = previewCoverByMovieId[selectedMovie.id] ?? null;
    const throwCoverImage =
      selectedPreviewCover ??
      activeSearchCover ??
      WAITING_SLOT_IMAGE;
    const fallbackFloorCoverImage =
      getStableCoverImage(throwCoverImage) ?? WAITING_SLOT_IMAGE;
    const fallbackMovie: ClubMovie = {
      id: selectedMovie.id,
      title: selectedMovie.title,
      coverImage: fallbackFloorCoverImage,
    };
    const renderedCoverPromise = getRenderedCoverPromise(selectedMovie.id);

    setPendingSearch(null);
    setIsAddSlotPeek(false);
    setIsAddSlotResetAnimating(true);
    if (addSlotResetRafRef.current !== null) {
      window.cancelAnimationFrame(addSlotResetRafRef.current);
    }
    addSlotResetRafRef.current = window.requestAnimationFrame(() => {
      setIsAddSlotResetAnimating(false);
      addSlotResetRafRef.current = null;
    });

    for (const timer of animationTimersRef.current) {
      window.clearTimeout(timer);
    }
    animationTimersRef.current = [];

    setAddAnimation({
      movie: fallbackMovie,
      coverImage: throwCoverImage,
      fromX: slot.x,
      fromY: slot.y + slotOffsetY,
      toX: targetX,
      toY: targetY,
      toRotation: targetRotation,
      stage: 'insert',
    });

    const flyTimer = window.setTimeout(() => {
      setAddAnimation((current) =>
        current
          ? {
              ...current,
              stage: 'fly',
            }
          : current
      );
    }, 180);

    const finishTimer = window.setTimeout(() => {
      addMovieToFloor(fallbackMovie, targetX, targetY, targetRotation);
      setAddAnimation(null);
      void renderedCoverPromise.then((renderedCover) => {
        if (!renderedCover || renderedCover.coverImage === fallbackMovie.coverImage) {
          return;
        }

        setFloorMovies((previous) =>
          previous.map((movie) =>
            movie.id === renderedCover.id
              ? {
                  ...movie,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : movie
          )
        );
      });
    }, 900);

    animationTimersRef.current.push(flyTimer, finishTimer);
  }, [
    addMovieToFloor,
    activeSearchCover,
    floorHeight,
    floorWidth,
    getAddSlotOffset,
    getEmptySlotPosition,
    getRenderedCoverPromise,
    pendingSearch,
    previewCoverByMovieId,
  ]);

  const handleSearchInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!pendingSearch || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingSearch(null);
        setIsAddSlotPeek(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        void confirmPendingSearch();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setPendingSearch((current) => {
          if (!current || current.results.length === 0) {
            return current;
          }

          return {
            ...current,
            selectedIndex: (current.selectedIndex + 1) % current.results.length,
          };
        });
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setPendingSearch((current) => {
          if (!current || current.results.length === 0) {
            return current;
          }

          return {
            ...current,
            selectedIndex:
              (current.selectedIndex - 1 + current.results.length) % current.results.length,
          };
        });
      }
    },
    [confirmPendingSearch, pendingSearch]
  );

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    void getRenderedCoverPromise(selectedMovie.id);
  }, [getRenderedCoverPromise, pendingSearch]);

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const setPreview = (previewUrl: string, tier: SearchPreviewTier) => {
      const nextTierIndex = getSearchPreviewTierIndex(tier);
      const currentTierIndex = getSearchPreviewTierIndex(
        previewTierByMovieIdRef.current[selectedMovie.id]
      );

      if (currentTierIndex > nextTierIndex) {
        URL.revokeObjectURL(previewUrl);
        return;
      }

      setPreviewCoverByMovieId((current) => {
        const existing = current[selectedMovie.id];
        if (existing && existing !== previewUrl) {
          URL.revokeObjectURL(existing);
        }

        return {
          ...current,
          [selectedMovie.id]: previewUrl,
        };
      });

      setPreviewTierByMovieId((current) => ({
        ...current,
        [selectedMovie.id]: tier,
      }));
    };

    const requestPreview = async (tier: SearchPreviewTier) => {
      const previewUrl = await fetchSearchPreviewCover(
        selectedMovie,
        tier,
        controller.signal
      );

      if (!previewUrl || cancelled || controller.signal.aborted) {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        return;
      }

      setPreview(previewUrl, tier);
    };

    void (async () => {
      const currentTier = previewTierByMovieIdRef.current[selectedMovie.id];
      const hasAnyPreview = Boolean(previewCoverByMovieIdRef.current[selectedMovie.id]);
      const startIndex = hasAnyPreview
        ? getSearchPreviewTierIndex(currentTier) + 1
        : 0;

      const tiersToFetch = SEARCH_PREVIEW_STEPS.slice(Math.max(0, startIndex))
        .map((step) => step.tier)
        .filter((tier) => {
          const alreadyTier = previewTierByMovieIdRef.current[selectedMovie.id];
          return getSearchPreviewTierIndex(alreadyTier) < getSearchPreviewTierIndex(tier);
        });

      for (const tier of tiersToFetch) {
        if (cancelled || controller.signal.aborted) {
          break;
        }
        await requestPreview(tier);
      }
    })().catch(() => {
      // Ignore preview failures and keep available preview.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    fetchSearchPreviewCover,
    pendingSearch,
  ]);

  useEffect(() => {
    if (!pendingSearch) {
      setActiveSearchCover(null);
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      if (!pendingSearch.loading) {
        setActiveSearchCover(null);
      }
      return;
    }

    const selectedPreview = previewCoverByMovieId[selectedMovie.id];
    if (selectedPreview) {
      setActiveSearchCover(selectedPreview);
    }
  }, [pendingSearch, previewCoverByMovieId]);

  const emptySlot = getEmptySlotPosition();
  const selectedSearchMovie =
    pendingSearch?.results[pendingSearch.selectedIndex] ?? null;
  const selectedSearchPreviewCover =
    selectedSearchMovie ? previewCoverByMovieId[selectedSearchMovie.id] : undefined;
  const addSlotCoverImage =
    selectedSearchPreviewCover ??
    activeSearchCover ??
    WAITING_SLOT_IMAGE;
  const addSlotHasCoverImage = Boolean(addSlotCoverImage);
  const draggingMovie =
    draggingId !== null
      ? floorMovies.find((movie) => movie.id === draggingId) ?? null
      : null;
  const draggingScore = draggingMovie
    ? clamp(
        typeof draggingMovie.score === 'number'
          ? draggingMovie.score
          : getTopScorePercent(draggingMovie.y, floorHeight, CARD_HEIGHT),
        0,
        100
      )
    : 50;
  const dragScoreDelta = (draggingScore - 50) / 50;
  const dragScoreMagnitude = Math.pow(Math.abs(dragScoreDelta), 0.55);
  const dragLightBoost = dragScoreDelta > 0 ? dragScoreMagnitude : 0;
  const dragDarkBoost = dragScoreDelta < 0 ? dragScoreMagnitude : 0;
  const visibleFloorMovies = floorMovies.filter(
    (movie) => !isWaitingSlotCover(movie.coverImage)
  );
  const leaderMovie = (() => {
    if (visibleFloorMovies.length === 0) {
      return null;
    }

    return [...visibleFloorMovies].sort(
      (a, b) => a.rank - b.rank || b.score - a.score || a.id - b.id
    )[0] ?? null;
  })();
  const leaderMovieId = leaderMovie?.id ?? null;
  const leaderSpotlight = (() => {
    if (!leaderMovie) {
      return null;
    }

    const centerX = leaderMovie.x + CARD_WIDTH * 0.5;
    const centerY = leaderMovie.y + CARD_HEIGHT * 0.5;
    const leaderScore = clamp(leaderMovie.score, 0, 100) / 100;
    const width = Math.round(CARD_WIDTH * (1.65 + leaderScore * 0.45));
    const height = Math.round(CARD_HEIGHT * (1.18 + leaderScore * 0.28));

    return {
      centerX,
      centerY,
      width,
      height,
      score: leaderScore,
    };
  })();
  const topScoreTiePair = (() => {
    if (visibleFloorMovies.length < 2) {
      return null;
    }

    const sorted = [...visibleFloorMovies].sort(
      (a, b) => b.score - a.score || a.rank - b.rank || a.id - b.id
    );
    const first = sorted[0];
    const second = sorted[1];

    if (!first || !second) {
      return null;
    }

    if (first.score < TOP_SCORE_TIE_MIN || second.score < TOP_SCORE_TIE_MIN) {
      return null;
    }

    if (Math.abs(first.score - second.score) > 0.05) {
      return null;
    }

    return {
      first,
      second,
    };
  })();
  const visibleMovieById = new Map(visibleFloorMovies.map((movie) => [movie.id, movie]));
  const activeVsPairs = (() => {
    const nextPairs = [...proximityVsPairs];
    if (topScoreTiePair) {
      const tiePair = createVsPair(topScoreTiePair.first.id, topScoreTiePair.second.id);
      if (!hasVsPair(nextPairs, tiePair)) {
        nextPairs.push(tiePair);
      }
    }

    return nextPairs.filter(
      (pair) => visibleMovieById.has(pair.firstId) && visibleMovieById.has(pair.secondId)
    );
  })();
  const vsBadges = activeVsPairs
    .map((pair) => {
      const first = visibleMovieById.get(pair.firstId);
      const second = visibleMovieById.get(pair.secondId);
      if (!first || !second) {
        return null;
      }

      const center = {
        x: (first.x + CARD_WIDTH * 0.5 + second.x + CARD_WIDTH * 0.5) / 2,
        y: (first.y + CARD_HEIGHT * 0.5 + second.y + CARD_HEIGHT * 0.5) / 2,
      };
      const key = getVsPairKey(pair);
      const fight = vsFightByKey[key] ?? null;

      return {
        key,
        pair,
        first,
        second,
        center,
        resolving: Boolean(resolvingVsPairByKey[key]),
        fight,
      };
    })
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  const sauronEyeFight =
    vsBadges.find((badge) => badge.fight?.easterEgg === 'sauron-eye') ?? null;
  const sauronEyeWinner = sauronEyeFight?.fight?.winnerId
    ? visibleMovieById.get(sauronEyeFight.fight.winnerId)
    : null;
  const sauronEyeSize = Math.round(
    clamp(Math.min(floorWidth, floorHeight) * 0.34, 220, 420)
  );
  const fightLightningBolts = Object.entries(vsFightByKey)
    .map(([key, fight]) => {
      const first = visibleMovieById.get(fight.pair.firstId);
      const second = visibleMovieById.get(fight.pair.secondId);
      if (!first || !second) {
        return null;
      }

      const firstCenter = {
        x: first.x + CARD_WIDTH * 0.5,
        y: first.y + CARD_HEIGHT * 0.5,
      };
      const secondCenter = {
        x: second.x + CARD_WIDTH * 0.5,
        y: second.y + CARD_HEIGHT * 0.5,
      };
      const deltaX = secondCenter.x - firstCenter.x;
      const deltaY = secondCenter.y - firstCenter.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));

      return {
        key,
        x: (firstCenter.x + secondCenter.x) / 2,
        y: (firstCenter.y + secondCenter.y) / 2,
        width: distance,
        rotate: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
        stage: fight.stage,
      };
    })
    .filter((bolt): bolt is NonNullable<typeof bolt> => Boolean(bolt));
  const movieFightEffects = (() => {
    const effectsByMovieId = new Map<
      number,
      {
        x: number;
        y: number;
        rotate: number;
        scale: number;
      }
    >();
    const addEffect = (
      movieId: number,
      partial: { x?: number; y?: number; rotate?: number; scaleMul?: number }
    ) => {
      const current = effectsByMovieId.get(movieId) ?? {
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
      };
      effectsByMovieId.set(movieId, {
        x: current.x + (partial.x ?? 0),
        y: current.y + (partial.y ?? 0),
        rotate: current.rotate + (partial.rotate ?? 0),
        scale: current.scale * (partial.scaleMul ?? 1),
      });
    };

    for (const fight of Object.values(vsFightByKey)) {
      const first = visibleMovieById.get(fight.pair.firstId);
      const second = visibleMovieById.get(fight.pair.secondId);
      if (!first || !second) {
        continue;
      }

      if (!fight.winnerId || !fight.loserId) {
        if (fight.stage === 'fight') {
          const chargeScale = 1.045;
          addEffect(first.id, { scaleMul: chargeScale });
          addEffect(second.id, { scaleMul: chargeScale });
        }
        continue;
      }

      const winner = visibleMovieById.get(fight.winnerId);
      const loser = visibleMovieById.get(fight.loserId);
      if (!winner || !loser) {
        continue;
      }

      const winnerCenterX = winner.x + CARD_WIDTH * 0.5;
      const winnerCenterY = winner.y + CARD_HEIGHT * 0.5;
      const loserCenterX = loser.x + CARD_WIDTH * 0.5;
      const loserCenterY = loser.y + CARD_HEIGHT * 0.5;
      const distance = Math.hypot(
        loserCenterX - winnerCenterX,
        loserCenterY - winnerCenterY
      );
      const unitX = distance > 0.001 ? (loserCenterX - winnerCenterX) / distance : 0;
      const unitY = distance > 0.001 ? (loserCenterY - winnerCenterY) / distance : 1;

      if (fight.stage === 'lunge') {
        addEffect(winner.id, {
          x: unitX * 56,
          y: unitY * 56,
          rotate: unitX * 2.2,
          scaleMul: 1.02,
        });
        addEffect(loser.id, {
          x: -unitX * 10,
          y: -unitY * 10,
          rotate: -unitX * 1.3,
        });
      } else if (fight.stage === 'impact') {
        addEffect(winner.id, {
          x: -unitX * 10,
          y: -unitY * 8,
          rotate: -unitX * 3.2,
        });
        addEffect(loser.id, {
          x: unitX * 134,
          y: unitY * 108 + 34,
          rotate: unitX >= 0 ? 18 : -18,
          scaleMul: 0.97,
        });
      }
    }

    return effectsByMovieId;
  })();
  const activeCharge = (() => {
    if (!proximityVsCharge) {
      return null;
    }

    const first = visibleMovieById.get(proximityVsCharge.pair.firstId);
    const second = visibleMovieById.get(proximityVsCharge.pair.secondId);
    if (!first || !second) {
      return null;
    }

    const center = {
      x: (first.x + CARD_WIDTH * 0.5 + second.x + CARD_WIDTH * 0.5) / 2,
      y: (first.y + CARD_HEIGHT * 0.5 + second.y + CARD_HEIGHT * 0.5) / 2,
    };

    return {
      ...proximityVsCharge,
      center,
    };
  })();
  const activeChargeProgress = clamp(activeCharge?.progress ?? 0, 0, 1);
  const activeChargeSize = 56 + activeChargeProgress * 72;
  const activeChargeOpacity = 0.2 + activeChargeProgress * 0.55;
  const addSlotOffset = getAddSlotOffset();
  const coverEditorFrontOption = coverEditor
    ? getCoverEditorOptionAtIndex(coverEditorImageOptions, coverEditor.frontImageIndex)
    : null;
  const coverEditorSpineOption = coverEditor
    ? getCoverEditorOptionAtIndex(coverEditorImageOptions, coverEditor.spineImageIndex)
    : null;
  const coverEditorFrontImage =
    coverEditorFrontOption?.previewUrl ??
    coverEditorFrontPreview ??
    WAITING_SLOT_IMAGE;
  const coverEditorSpineImage =
    coverEditorSpineOption?.previewUrl ??
    coverEditorSpinePreview ??
    SHELF_PLACEHOLDER_IMAGE;
  const isCoverEditorFrontFocused = coverEditor?.focusVariant === 'front';
  const isCoverEditorSpineFocused = coverEditor?.focusVariant === 'spine';
  const coverEditorFrontWidth = CARD_WIDTH;
  const coverEditorFrontHeight = CARD_HEIGHT;
  const coverEditorSpineWidth = Math.max(48, Math.round(76 * layoutScale));
  const coverEditorGap = Math.max(8, Math.round(12 * layoutScale));
  const coverEditorPairWidth =
    coverEditorSpineWidth + coverEditorGap + coverEditorFrontWidth;
  const coverEditorPairHeight = coverEditorFrontHeight;
  const coverEditorPairLeft = clamp(
    emptySlot.x + CARD_WIDTH - coverEditorPairWidth,
    10,
    Math.max(10, floorWidth - coverEditorPairWidth - 10)
  );
  const coverEditorPairTop = clamp(
    emptySlot.y - coverEditorPairHeight - 18,
    10,
    Math.max(10, floorHeight - coverEditorPairHeight - 10)
  );
  const shelfExpanded = isCompactPhoneLayout
    ? isMobileShelfOpen || isShelfDropActive
    : isShelfHovered || isShelfDropActive;
  const mobileShelfPanelHeight = shelfExpanded
    ? MOBILE_SHELF_OPEN_HEIGHT
    : MOBILE_SHELF_PEEK_HEIGHT;
  const remoteTop =
    floorHeight -
    (isCompactPhoneLayout ? MOBILE_SHELF_BOTTOM_CLEARANCE : 0) -
    (isRemotePeek ? REMOTE_VISIBLE_PEEK : REMOTE_VISIBLE_DEFAULT);
  const remoteLeft = clamp(
    emptySlot.x - REMOTE_CONTROL_WIDTH - REMOTE_SLOT_GAP,
    12,
    Math.max(12, floorWidth - REMOTE_CONTROL_WIDTH - 12)
  );
  const shelfPanelWidth = SHELF_OPEN_WIDTH;
  const shelfTranslateX =
    shelfExpanded ? 0 : -SHELF_PEEK_OFFSET;
  const shelfMovieIdSet = new Set(shelfMovies.map((movie) => movie.id));
  const shelfShouldReserveGap =
    isShelfDropActive &&
    draggingMovie !== null &&
    !shelfMovieIdSet.has(draggingMovie.id);
  const shelfInsertGap = isCompactPhoneLayout
    ? Math.round(MOBILE_SHELF_ITEM_LENGTH * 0.72)
    : SHELF_EXPOSED_STRIP_HEIGHT;
  const shelfInsertGapIndex = shelfShouldReserveGap
    ? clamp(shelfDropInsertIndex ?? shelfMovies.length, 0, shelfMovies.length)
    : null;
  const handleMobileShelfToggle = useCallback(() => {
    setHoveredShelfMovieId(null);
    setIsMobileShelfOpen((current) => !current);
  }, []);
  const handleShelfScroll = useCallback(() => {
    setHoveredShelfMovieId(null);
    const activeDrag = dragRef.current;
    if (!activeDrag || !isShelfDropActiveRef.current) {
      return;
    }

    const nextInsertIndex = getShelfDropInsertIndexFromPointer(
      activeDrag.lastClientX,
      activeDrag.lastClientY
    );
    updateShelfDropInsertIndex(nextInsertIndex);
  }, [getShelfDropInsertIndexFromPointer, updateShelfDropInsertIndex]);

  const handlePowerOnClick = () => {
    setIsMobileShelfOpen(false);
    const boardMovies = toBoardMoviesPayload(floorMovies);
    const signature = JSON.stringify(
      boardMovies.map((movie) => [
        movie.id,
        movie.coverImage,
        Math.round(movie.x),
        Math.round(movie.y),
        Math.round(movie.rotation * 10) / 10,
        Math.round(movie.score * 10) / 10,
      ])
    );

    const navigateToTv = () => {
      window.location.href = tvPath;
    };

    if (signature === lastBoardSignatureRef.current) {
      navigateToTv();
      return;
    }

    void fetch(withBasePath(`/api/club/floor?boardId=${boardId}`), {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        boardId,
        movies: boardMovies,
      }),
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) {
          lastBoardSignatureRef.current = signature;
        }
      })
      .catch(() => {
        // Navigate anyway; board sync can retry on next interaction.
      })
      .finally(() => {
        navigateToTv();
      });
  };

  const handleResolveVsPair = useCallback(
    (pair: VsPair) => {
      const pairKey = getVsPairKey(pair);
      if (
        resolvingVsPairByKeyRef.current[pairKey] ||
        Boolean(vsFightByKeyRef.current[pairKey])
      ) {
        return;
      }

      setResolvingVsPairByKey((current) => ({
        ...current,
        [pairKey]: true,
      }));
      const lordOfTheRingsResult = getLordOfTheRingsVsResult(
        floorMoviesRef.current,
        pair
      );
      setVsFightByKey((current) => ({
        ...current,
        [pairKey]: {
          pair,
          stage: 'fight',
          winnerId: null,
          loserId: null,
          easterEgg: lordOfTheRingsResult ? 'sauron-eye' : null,
        },
      }));

      const contenderAId = pair.firstId;
      const contenderBId = pair.secondId;
      const clearPairState = () => {
        setVsFightByKey((current) => {
          if (!current[pairKey]) {
            return current;
          }

          const next = { ...current };
          delete next[pairKey];
          return next;
        });
        setResolvingVsPairByKey((current) => {
          if (!current[pairKey]) {
            return current;
          }

          const next = { ...current };
          delete next[pairKey];
          return next;
        });
      };
      const fetchResultPromise: Promise<{ winnerId: number; loserId: number } | null> =
        lordOfTheRingsResult
          ? Promise.resolve(lordOfTheRingsResult)
          : (async () => {
              try {
                const response = await fetch(withBasePath('/api/club/vs'), {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify({
                    movieAId: contenderAId,
                    movieBId: contenderBId,
                  }),
                });

                if (!response.ok) {
                  return null;
                }

                const payloadRaw: unknown = await response.json().catch(() => null);
                if (!payloadRaw || typeof payloadRaw !== 'object') {
                  return null;
                }

                const payload = payloadRaw as {
                  winnerId?: unknown;
                  loserId?: unknown;
                };
                if (
                  typeof payload.winnerId !== 'number' ||
                  typeof payload.loserId !== 'number'
                ) {
                  return null;
                }

                return {
                  winnerId: payload.winnerId,
                  loserId: payload.loserId,
                };
              } catch {
                return null;
              }
            })();
      const scheduleFightStep = (delayMs: number, action: () => void) => {
        const timer = window.setTimeout(() => {
          vsFightTimersRef.current = vsFightTimersRef.current.filter(
            (activeTimer) => activeTimer !== timer
          );
          action();
        }, delayMs);
        vsFightTimersRef.current.push(timer);
      };
      scheduleFightStep(520, () => {
        void (async () => {
          const result = await fetchResultPromise;
          if (!result) {
            clearPairState();
            return;
          }

          setVsFightByKey((current) => {
            const fight = current[pairKey];
            if (!fight) {
              return current;
            }

            return {
              ...current,
              [pairKey]: {
                ...fight,
                stage: 'lunge',
                winnerId: result.winnerId,
                loserId: result.loserId,
              },
            };
          });
        })();
      });
      scheduleFightStep(760, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight?.winnerId || !fight?.loserId) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              stage: 'impact',
            },
          };
        });
      });
      scheduleFightStep(1280, () => {
        void (async () => {
          const result = await fetchResultPromise;
          if (!result) {
            clearPairState();
            return;
          }

          const winnerId = result.winnerId;
          const loserId = result.loserId;
          setProximityVsPairs((current) =>
            current.filter((activePair) => !isSameVsPair(activePair, pair))
          );

          const bounds = getFloorBounds();
          const maxTop = Math.max(0, bounds.height - CARD_HEIGHT);
          const maxLeft = Math.max(0, bounds.width - CARD_WIDTH);

          setFloorMovies((previous) => {
            const winnerMovie = previous.find((movie) => movie.id === winnerId);
            const loserMovie = previous.find((movie) => movie.id === loserId);

            if (!winnerMovie || !loserMovie) {
              return previous;
            }

            const winnerCenterX = winnerMovie.x + CARD_WIDTH * 0.5;
            const winnerCenterY = winnerMovie.y + CARD_HEIGHT * 0.5;
            const loserCenterX = loserMovie.x + CARD_WIDTH * 0.5;
            const loserCenterY = loserMovie.y + CARD_HEIGHT * 0.5;
            const distance = Math.hypot(
              loserCenterX - winnerCenterX,
              loserCenterY - winnerCenterY
            );
            const unitX = distance > 0.001 ? (loserCenterX - winnerCenterX) / distance : 0;
            const winnerY = clamp(Math.min(winnerMovie.y, loserMovie.y) - 8, 0, maxTop);
            const loserY = clamp(winnerY + 172, 0, maxTop);
            const winnerX = clamp(winnerMovie.x - unitX * 10, 0, maxLeft);
            const loserX = clamp(loserMovie.x + unitX * 86, 0, maxLeft);

            return recalculateHierarchy(
              previous.map((movie) =>
                movie.id === winnerId
                  ? { ...movie, x: winnerX, y: winnerY }
                  : movie.id === loserId
                    ? { ...movie, x: loserX, y: loserY }
                    : movie
              ),
              bounds.height
            );
          });

          clearPairState();
        })();
      });

    },
    [getFloorBounds]
  );

  return (
    <main className="h-[100dvh] w-full overflow-hidden bg-white">
      <div
        ref={floorRef}
        className="relative h-full w-full bg-cover bg-center"
        style={{ backgroundImage: `url('${FLOOR_BACKGROUND_IMAGE}')` }}
      >
        {isCompactPhoneLayout ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1320] px-3"
            style={{
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            }}
          >
            <div
              className="pointer-events-auto relative overflow-hidden rounded-[26px] border border-white/18"
              style={{
                height: mobileShelfPanelHeight,
                background:
                  'linear-gradient(to top, rgba(16,16,18,0.9) 0%, rgba(22,22,25,0.78) 52%, rgba(35,35,39,0.56) 100%)',
                boxShadow:
                  '0 18px 42px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                transition:
                  'height 240ms cubic-bezier(0.24, 0.86, 0.24, 1), box-shadow 220ms ease-out',
              }}
            >
              <button
                type="button"
                aria-label={isMobileShelfOpen ? 'Lukk hylle' : 'Åpne hylle'}
                onClick={handleMobileShelfToggle}
                className="absolute left-1/2 top-2 z-[5] -translate-x-1/2 appearance-none border-0 bg-transparent p-0"
                style={{
                  width: MOBILE_SHELF_HANDLE_WIDTH,
                  height: 28,
                }}
              >
                <div
                  className="absolute left-1/2 top-[6px] -translate-x-1/2 rounded-full bg-white/55"
                  style={{
                    width: Math.round(MOBILE_SHELF_HANDLE_WIDTH * 0.46),
                    height: 4,
                  }}
                />
                <div
                  className="absolute left-1/2 top-[14px] -translate-x-1/2 rounded-full bg-white/22"
                  style={{
                    width: Math.round(MOBILE_SHELF_HANDLE_WIDTH * 0.66),
                    height: 12,
                  }}
                />
              </button>
              <div
                ref={shelfScrollRef}
                className="shelf-scroll-hidden absolute inset-x-0 bottom-0 overflow-x-auto overflow-y-hidden"
                onScroll={handleShelfScroll}
                style={{
                  height: mobileShelfPanelHeight,
                  paddingLeft: MOBILE_SHELF_SIDE_PADDING,
                  paddingRight: MOBILE_SHELF_SIDE_PADDING,
                  paddingTop: 34,
                  paddingBottom: Math.max(12, Math.round(14 * layoutScale)),
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div
                  className="flex h-full items-end"
                  style={{
                    gap: MOBILE_SHELF_ITEM_GAP,
                    width: 'max-content',
                  }}
                >
                  {shelfMovies.map((movie, index) => {
                    const isLifted = hoveredShelfMovieId === movie.id;
                    const isRecentlyInserted = shelfRecentlyInsertedMovieId === movie.id;
                    const baseZIndex = shelfMovies.length - index;
                    return (
                      <div
                        key={movie.id}
                        className="relative overflow-hidden rounded-[16px]"
                        style={{
                          width: MOBILE_SHELF_ITEM_LENGTH,
                          height: MOBILE_SHELF_ITEM_HEIGHT,
                          flex: '0 0 auto',
                          pointerEvents: 'none',
                          marginLeft:
                            index === 0
                              ? shelfInsertGapIndex === 0
                                ? shelfInsertGap
                                : 0
                              : shelfInsertGapIndex === index
                                ? shelfInsertGap
                                : 0,
                          zIndex: isLifted ? shelfMovies.length + 16 : baseZIndex,
                          transition:
                            'margin-left 180ms ease-out, transform 180ms ease-out, filter 180ms ease-out',
                          transform:
                            isLifted || isRecentlyInserted
                              ? 'translateY(-2px)'
                              : 'translateY(0)',
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => handleShelfPointerDown(event, movie)}
                          onPointerEnter={() => setHoveredShelfMovieId(movie.id)}
                          onPointerLeave={() =>
                            setHoveredShelfMovieId((current) =>
                              current === movie.id ? null : current
                            )
                          }
                          onFocus={() => setHoveredShelfMovieId(movie.id)}
                          onBlur={() =>
                            setHoveredShelfMovieId((current) =>
                              current === movie.id ? null : current
                            )
                          }
                          className="absolute inset-0 appearance-none border-0 bg-transparent p-0"
                          style={{
                            pointerEvents: 'auto',
                            zIndex: 4,
                          }}
                          aria-label={`Legg ${movie.title} tilbake på gulvet`}
                        />
                        <div
                          className="pointer-events-none absolute inset-0 rounded-[16px] border border-white/10 transition-[filter,background-color] duration-200 ease-out"
                          style={{
                            background:
                              'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 26%, rgba(0,0,0,0.14) 100%)',
                            filter:
                              isLifted || isRecentlyInserted
                                ? 'brightness(1.06)'
                                : 'brightness(1)',
                          }}
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-1/2"
                          style={{
                            width: CARD_WIDTH,
                            height: CARD_HEIGHT,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          <img
                            src={movie.coverImage}
                            alt={movie.title}
                            className={`h-full w-full object-contain ${
                              isLifted
                                ? 'drop-shadow-[0_24px_28px_rgba(0,0,0,0.58)]'
                                : 'drop-shadow-[0_14px_16px_rgba(0,0,0,0.48)]'
                            }`}
                            style={{
                              transform: `rotate(90deg) scale(${SHELF_SPINE_IMAGE_SCALE})`,
                              transformOrigin: 'center',
                            }}
                            draggable={false}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {shelfInsertGapIndex === shelfMovies.length ? (
                    <div
                      aria-hidden
                      style={{
                        width: shelfInsertGap,
                        height: 1,
                        flex: '0 0 auto',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="absolute bottom-0 left-0 top-0 z-[1320]"
            style={{
              width: shelfPanelWidth,
              transform: `translateX(${shelfTranslateX}px)`,
              transition: 'transform 260ms cubic-bezier(0.24, 0.86, 0.24, 1)',
            }}
            onMouseEnter={() => setIsShelfHovered(true)}
            onMouseLeave={() => setIsShelfHovered(false)}
            onFocus={() => setIsShelfHovered(true)}
            onBlur={() => setIsShelfHovered(false)}
          >
            <div
              ref={shelfScrollRef}
              className="shelf-scroll-hidden absolute bottom-0 right-0 top-0 overflow-y-auto pl-[14px] pr-[10px]"
              onScroll={handleShelfScroll}
              style={{
                width: SHELF_SCROLL_WIDTH,
                scrollBehavior: 'smooth',
                scrollSnapType: 'none',
                background: 'transparent',
              }}
            >
              <div
                className="flex flex-col items-center pb-12"
                style={{ paddingTop: SHELF_LIST_TOP_PADDING }}
              >
                {shelfMovies.map((movie, index) => {
                  const isLifted = hoveredShelfMovieId === movie.id;
                  const isRecentlyInserted = shelfRecentlyInsertedMovieId === movie.id;
                  const baseZIndex = shelfMovies.length - index;
                  return (
                    <div
                      key={movie.id}
                      className="relative overflow-hidden"
                      style={{
                        width: SHELF_ITEM_WIDTH,
                        height: SHELF_EXPOSED_STRIP_HEIGHT,
                        pointerEvents: 'none',
                        marginTop:
                          index === 0
                            ? shelfInsertGapIndex === 0
                              ? shelfInsertGap
                              : 0
                            : shelfInsertGapIndex === index
                              ? shelfInsertGap
                              : 0,
                        zIndex: isLifted ? shelfMovies.length + 16 : baseZIndex,
                        transition: 'margin-top 180ms ease-out, filter 180ms ease-out',
                      }}
                    >
                      <button
                        type="button"
                        onPointerDown={(event) => handleShelfPointerDown(event, movie)}
                        onPointerEnter={() => setHoveredShelfMovieId(movie.id)}
                        onPointerLeave={() =>
                          setHoveredShelfMovieId((current) =>
                            current === movie.id ? null : current
                          )
                        }
                        onFocus={() => setHoveredShelfMovieId(movie.id)}
                        onBlur={() =>
                          setHoveredShelfMovieId((current) =>
                            current === movie.id ? null : current
                          )
                        }
                        className="absolute appearance-none border-0 bg-transparent p-0"
                        style={{
                          pointerEvents: 'auto',
                          left: SHELF_SPINE_HITBOX_SIDE_INSET,
                          right: SHELF_SPINE_HITBOX_SIDE_INSET,
                          top: SHELF_SPINE_HITBOX_TOP,
                          height: SHELF_SPINE_HITBOX_HEIGHT,
                          zIndex: 4,
                        }}
                        aria-label={`Legg ${movie.title} tilbake på gulvet`}
                      />
                      <div
                        className="pointer-events-none absolute inset-0 transition-[filter] duration-200 ease-out"
                        style={{
                          filter:
                            isLifted || isRecentlyInserted
                              ? 'brightness(1.04)'
                              : 'brightness(1)',
                        }}
                      >
                        <div
                          className="absolute left-0"
                          style={{
                            top: SHELF_ROW_ART_TOP,
                            width: SHELF_ITEM_WIDTH,
                            height: SHELF_ITEM_HEIGHT,
                          }}
                        >
                          <img
                            src={movie.coverImage}
                            alt={movie.title}
                            className={`h-full w-full object-contain ${
                              isLifted
                                ? 'drop-shadow-[0_24px_28px_rgba(0,0,0,0.58)]'
                                : 'drop-shadow-[0_14px_16px_rgba(0,0,0,0.48)]'
                            }`}
                            style={{
                              transform: `rotate(90deg) scale(${SHELF_SPINE_IMAGE_SCALE})`,
                              transformOrigin: 'center',
                            }}
                            draggable={false}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {shelfInsertGapIndex === shelfMovies.length ? (
                  <div
                    aria-hidden
                    style={{ height: shelfInsertGap, width: 1, pointerEvents: 'none' }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(860px 560px at ${Math.round(
              emptySlot.x + CARD_WIDTH * 0.52
            )}px ${Math.round(
              emptySlot.y + CARD_HEIGHT * 0.78
            )}px, rgba(255,228,184,0.32) 0%, rgba(255,228,184,0.12) 36%, rgba(255,228,184,0) 72%)`,
            boxShadow: 'inset 0 0 110px rgba(0,0,0,0.06)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.08,
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 1px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px), repeating-linear-gradient(to right, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 4,
            opacity:
              0.32 +
              (draggingMovie
                ? clamp(0.12 + dragLightBoost * 0.25 - dragDarkBoost * 0.02, 0, 0.35)
                : 0),
            transition: 'opacity 180ms ease-out',
            mixBlendMode: 'soft-light',
            background: `linear-gradient(to bottom, rgba(255,238,190,${
              0.15 + (draggingMovie ? dragLightBoost * 0.3 : 0)
            }) 0%, rgba(255,232,168,${
              0.075 + (draggingMovie ? dragLightBoost * 0.18 : 0)
            }) 40%, rgba(22,14,8,${
              0.045 + (draggingMovie ? dragDarkBoost * 0.12 : 0)
            }) 74%, rgba(14,10,7,${
              0.12 + (draggingMovie ? dragDarkBoost * 0.45 : 0)
            }) 100%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 4,
            opacity:
              0.36 +
              (draggingMovie
                ? clamp(0.16 + dragLightBoost * 0.28 - dragDarkBoost * 0.03, 0, 0.44)
                : 0),
            transition: 'opacity 180ms ease-out',
            mixBlendMode: 'screen',
            background: `radial-gradient(68% 52% at 50% -10%, rgba(255,236,168,${
              0.52 + (draggingMovie ? dragLightBoost * 0.65 : 0)
            }) 0%, rgba(255,228,146,${
              0.18 + (draggingMovie ? dragLightBoost * 0.38 : 0)
            }) 42%, rgba(255,223,138,0) 84%)`,
          }}
        />
        {leaderSpotlight && draggingId !== leaderMovieId ? (
          <div
            className="pointer-events-none absolute z-[4]"
            style={{
              left: leaderSpotlight.centerX - leaderSpotlight.width / 2,
              top: leaderSpotlight.centerY - leaderSpotlight.height * 0.56,
              width: leaderSpotlight.width,
              height: leaderSpotlight.height,
              opacity: 0.34 + leaderSpotlight.score * 0.12,
            }}
          >
            <div
              className="vhs-leader-spotlight absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at center, rgba(255,238,182,${
                  0.22 + leaderSpotlight.score * 0.12
                }) 0%, rgba(255,218,138,${
                  0.09 + leaderSpotlight.score * 0.05
                }) 36%, rgba(255,192,110,0.035) 60%, rgba(255,192,110,0) 78%)`,
                filter: 'blur(20px)',
                mixBlendMode: 'screen',
              }}
            />
          </div>
        ) : null}
        {draggingId !== null ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: DELETE_ZONE_HEIGHT + 42,
              zIndex: 5,
              opacity:
                deleteArmedId === draggingId
                  ? 0.9
                  : deleteCandidateId === draggingId
                    ? 0.58
                    : 0.3,
              transition: 'opacity 160ms ease-out',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  deleteArmedId === draggingId
                    ? 'linear-gradient(to top, rgba(196, 24, 24, 0.44) 0%, rgba(196, 24, 24, 0.2) 48%, rgba(196, 24, 24, 0) 100%)'
                    : 'linear-gradient(to top, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 54%, rgba(0,0,0,0) 100%)',
              }}
            />
          </div>
        ) : null}
        {activeCharge ? (
          <div
            className="pointer-events-none absolute z-[1235]"
            style={{
              width: activeChargeSize,
              height: activeChargeSize,
              left: activeCharge.center.x - activeChargeSize / 2,
              top: activeCharge.center.y - activeChargeSize / 2,
              opacity: activeChargeOpacity,
              transition: 'opacity 70ms linear',
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(255,248,208,0.92) 0%, rgba(255,224,156,0.56) 40%, rgba(255,184,94,0.14) 72%, rgba(255,168,84,0) 100%)',
                boxShadow:
                  '0 0 28px rgba(255,220,140,0.52), 0 0 56px rgba(255,190,110,0.25)',
              }}
            />
          </div>
        ) : null}
        {fightLightningBolts.map((bolt) => (
          <div
            key={bolt.key}
            className="pointer-events-none absolute z-[1239]"
            aria-hidden
            style={{
              width: bolt.width,
              height: 72,
              left: bolt.x - bolt.width / 2,
              top: bolt.y - 36,
              opacity: bolt.stage === 'impact' ? 1 : 0.74,
              transform: `rotate(${bolt.rotate}deg)`,
            }}
          >
            <div
              className={`vhs-vs-lightning ${
                bolt.stage === 'impact' ? 'vhs-vs-lightning-impact' : ''
              }`}
            />
            <div className="vhs-vs-lightning vhs-vs-lightning-secondary" />
          </div>
        ))}
        {sauronEyeFight ? (
          <div
            className="pointer-events-none absolute z-[1242]"
            aria-hidden
            style={{
              width: sauronEyeSize,
              height: Math.round(sauronEyeSize * 0.62),
              left: sauronEyeFight.center.x - sauronEyeSize / 2,
              top: sauronEyeFight.center.y - sauronEyeSize * 0.44,
              opacity: sauronEyeFight.fight?.stage === 'impact' ? 0.98 : 0.88,
              transform:
                sauronEyeFight.fight?.stage === 'impact'
                  ? 'translate3d(0, -8px, 0) scale(1.08)'
                  : 'translate3d(0, 0, 0) scale(1)',
              transition:
                'opacity 180ms ease-out, transform 220ms cubic-bezier(0.2, 0.85, 0.2, 1)',
            }}
          >
            <div className="vhs-sauron-eye-aura absolute inset-[-46%]" />
            <div className="vhs-sauron-eye absolute inset-0">
              <div className="vhs-sauron-eye-iris absolute left-1/2 top-1/2" />
              <div className="vhs-sauron-eye-slit absolute left-1/2 top-1/2" />
              <div className="vhs-sauron-eye-flare absolute inset-0" />
            </div>
            {sauronEyeWinner ? (
              <div
                className="absolute left-1/2 top-[104%] h-[2px] -translate-x-1/2 rounded-full"
                style={{
                  width: Math.round(sauronEyeSize * 0.52),
                  background:
                    'linear-gradient(90deg, rgba(255,88,36,0), rgba(255,188,74,0.92), rgba(255,88,36,0))',
                  boxShadow: '0 0 20px rgba(255,112,42,0.62)',
                }}
              />
            ) : null}
          </div>
        ) : null}
        {vsBadges.map((badge, index) => (
          <button
            key={badge.key}
            type="button"
            onClick={() => handleResolveVsPair(badge.pair)}
            disabled={badge.resolving || Boolean(badge.fight)}
            className="absolute appearance-none border-0 bg-transparent p-0 transition-transform duration-150 hover:scale-105 disabled:cursor-wait"
            style={{
              zIndex: 1250 + index,
              width: VS_BADGE_WIDTH,
              height: VS_BADGE_HEIGHT,
              left: badge.center.x - VS_BADGE_WIDTH / 2,
              top: badge.center.y - VS_BADGE_HEIGHT / 2,
              opacity: badge.resolving ? 0.72 : 0.94,
            }}
            aria-label={`Avgjør ${badge.first.title} mot ${badge.second.title}`}
          >
            <img
              src={VS_BADGE_IMAGE}
              alt="VS"
              className="h-full w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.44)]"
              draggable={false}
            />
          </button>
        ))}
        {visibleFloorMovies.map((movie) => {
          if (coverEditor && movie.id === coverEditor.movieId) {
            return null;
          }

          const dragging = draggingId === movie.id;
          const isCoverEditorDropPreview =
            dragging &&
            isCoverEditorDropActive &&
            coverEditorDropCycleMovieIdRef.current === movie.id &&
            Boolean(coverEditorDropCycleImage);
          const dragMorphToSidecover =
            dragging &&
            isShelfDropActive &&
            !shelfMovieIdSet.has(movie.id);
          const isLeaderMovie =
            leaderMovieId === movie.id &&
            !dragging &&
            !isDeleteClearAllSequenceActive &&
            deleteClearAllArmedId === null;
          const movieImageSource = dragMorphToSidecover
            ? shelfPreviewCoverByMovieId[movie.id] ?? SHELF_PLACEHOLDER_IMAGE
            : isCoverEditorDropPreview
              ? coverEditorDropCycleImage ?? movie.coverImage
              : movie.coverImage;
          const movieImageClassName = dragMorphToSidecover
            ? `relative z-10 h-full w-full object-contain transition-[filter,transform] duration-220 ${
                dragging
                  ? 'drop-shadow-[0_14px_16px_rgba(0,0,0,0.42)] drop-shadow-[0_4px_8px_rgba(0,0,0,0.2)]'
                  : 'drop-shadow-[0_12px_14px_rgba(0,0,0,0.36)] drop-shadow-[0_4px_8px_rgba(0,0,0,0.16)] group-hover:drop-shadow-[0_18px_20px_rgba(0,0,0,0.48)] group-hover:drop-shadow-[0_6px_12px_rgba(0,0,0,0.2)]'
              }`
            : `relative z-10 h-full w-full object-cover transition-[filter] duration-300 ${
                dragging
                  ? 'drop-shadow-[0_30px_34px_rgba(0,0,0,0.54)] drop-shadow-[0_10px_16px_rgba(0,0,0,0.26)]'
                  : 'drop-shadow-[0_20px_24px_rgba(0,0,0,0.44)] drop-shadow-[0_7px_14px_rgba(0,0,0,0.2)] group-hover:drop-shadow-[0_32px_38px_rgba(0,0,0,0.6)] group-hover:drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]'
              }`;
          const movieImageStyle = dragMorphToSidecover
            ? {
                transform: `rotate(90deg) scale(${DRAG_SIDECOVER_IMAGE_SCALE})`,
                transformOrigin: 'center',
              }
            : undefined;
          const deleteCandidate = dragging && deleteCandidateId === movie.id;
          const deleteArmed = dragging && deleteArmedId === movie.id;
          const clearAllShaking =
            deleteClearAllArmedId !== null || isDeleteClearAllSequenceActive;
          const clearAllShakeDurationMs = Math.round(
            150 + randomFromSeed(movie.id + 491) * 160
          );
          const clearAllShakeDelayMs = -Math.round(
            randomFromSeed(movie.id + 907) * clearAllShakeDurationMs
          );
          const clearAllShakeStyle = clearAllShaking
            ? {
                animationDuration: `${clearAllShakeDurationMs}ms`,
                animationDelay: `${clearAllShakeDelayMs}ms`,
              }
            : undefined;
          const chargePair = activeCharge?.pair ?? null;
          const isChargingMovie =
            chargePair !== null &&
            (movie.id === chargePair.firstId || movie.id === chargePair.secondId);
          let chargeOffsetX = 0;
          let chargeOffsetY = 0;

          if (isChargingMovie && activeCharge) {
            const movieCenterX = movie.x + CARD_WIDTH * 0.5;
            const movieCenterY = movie.y + CARD_HEIGHT * 0.5;
            const deltaX = activeCharge.center.x - movieCenterX;
            const deltaY = activeCharge.center.y - movieCenterY;
            const distance = Math.hypot(deltaX, deltaY);

            if (distance > 0.001) {
              const pullStrength =
                PROXIMITY_VS_PULL_MAX *
                (0.18 + Math.pow(activeChargeProgress, 1.2) * 0.82);
              chargeOffsetX = (deltaX / distance) * pullStrength;
              chargeOffsetY = (deltaY / distance) * pullStrength;
            }
          }
          const fightEffect = movieFightEffects.get(movie.id);
          const fightOffsetX = fightEffect?.x ?? 0;
          const fightOffsetY = fightEffect?.y ?? 0;
          const fightRotate = fightEffect?.rotate ?? 0;
          const fightScale = fightEffect?.scale ?? 1;
          const totalOffsetX = chargeOffsetX + fightOffsetX;
          const totalOffsetY = chargeOffsetY + fightOffsetY;
          const isFightAnimated = Boolean(fightEffect);
          const isCoverEditorReturning = coverEditorReturnMovieId === movie.id;

          return (
            <button
              key={movie.id}
              type="button"
              onPointerDown={(event) => handlePointerDown(event, movie.id)}
              className={`absolute group appearance-none border-0 bg-transparent p-0 text-left ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                left: movie.x,
                top: movie.y,
                zIndex: movie.z,
                transform: `translate(${totalOffsetX}px, ${totalOffsetY}px) rotate(${movie.rotation + fightRotate}deg) scale(${
                  fightScale * (isLeaderMovie ? 1.018 : 1)
                })`,
                transition: isCoverEditorReturning
                  ? 'left 560ms cubic-bezier(0.2, 0.85, 0.2, 1), top 560ms cubic-bezier(0.2, 0.85, 0.2, 1), transform 560ms cubic-bezier(0.2, 0.85, 0.2, 1)'
                  : isChargingMovie || isFightAnimated
                    ? 'transform 140ms cubic-bezier(0.24, 0.8, 0.24, 1)'
                    : undefined,
                touchAction: 'none',
              }}
            >
              <div
                className={`relative h-full w-full transform transition-transform duration-300 ${
                  dragging ? '' : 'group-hover:rotate-1 group-hover:scale-110'
                } ${
                  deleteArmed
                    ? 'vhs-delete-shake-hard'
                    : deleteCandidate
                      ? 'vhs-delete-shake'
                      : clearAllShaking
                        ? 'vhs-delete-shake'
                      : ''
                }`}
                style={clearAllShakeStyle}
              >
                <div
                  className={`pointer-events-none absolute inset-[-10%] z-0 rounded-[26px] blur-[10px] transition-opacity duration-300 ${
                    isLeaderMovie
                      ? 'opacity-88'
                      : dragging
                      ? 'opacity-72'
                      : 'opacity-48 group-hover:opacity-72'
                  }`}
                  style={{
                    background: isLeaderMovie
                      ? 'radial-gradient(72% 76% at 48% 58%, rgba(255,213,126,0.28) 0%, rgba(0,0,0,0.26) 38%, rgba(0,0,0,0) 78%)'
                      : 'radial-gradient(70% 74% at 48% 58%, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.28) 44%, rgba(0,0,0,0) 80%)',
                  }}
                />
                {isLeaderMovie ? (
                  <div
                    className="pointer-events-none absolute inset-[-6%] z-[1] rounded-[24px] vhs-leader-card-aura"
                    style={{
                      background:
                        'radial-gradient(78% 82% at 50% 50%, rgba(255,230,172,0.18) 0%, rgba(255,208,142,0.08) 42%, rgba(255,208,142,0) 76%)',
                      filter: 'blur(8px)',
                    }}
                  />
                ) : null}
                {OPEN_EFFECT_ENABLED && !dragMorphToSidecover ? (
                  <div
                    className={`absolute -bottom-4 -right-4 -left-[-20%] h-[102%] transition-all duration-300 ${
                      dragging
                        ? 'opacity-0 -translate-x-[20%]'
                        : 'opacity-0 -translate-x-[20%] group-hover:translate-x-0 group-hover:opacity-100'
                    }`}
                  >
                    <img
                      src={VHS_FRONT_SIDE_IMAGE}
                      alt="VHS case"
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </div>
                ) : null}
                <img
                  src={movieImageSource}
                  alt={movie.title}
                  className={movieImageClassName}
                  style={{
                    ...(movieImageStyle ?? {}),
                    filter: isLeaderMovie
                      ? 'brightness(1.07) saturate(1.08) contrast(1.03)'
                      : undefined,
                  }}
                  draggable={false}
                />
              </div>
            </button>
          );
        })}
        {deleteAnimation ? (
          <div
            className="pointer-events-none absolute"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: deleteAnimation.x,
              top: deleteAnimation.y,
              zIndex: deleteAnimation.z,
              transform: `rotate(${deleteAnimation.rotation}deg)`,
            }}
          >
            <div className="absolute inset-0">
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, 100% 0, 100% ${DELETE_SPLIT_RIGHT_PCT}%, 0 ${DELETE_SPLIT_LEFT_PCT}%)`,
                  transform:
                    deleteAnimation.stage === 'drop'
                      ? `translate3d(${
                          -22 * deleteAnimation.splitDirection
                        }px, 312px, 0) rotate(${
                          -13 * deleteAnimation.splitDirection
                        }deg)`
                      : deleteAnimation.stage === 'hold'
                        ? `translate3d(${
                            -2 * deleteAnimation.splitDirection
                          }px, -6px, 0) rotate(${
                            -1.2 * deleteAnimation.splitDirection
                          }deg)`
                        : 'translate3d(0, 0, 0)',
                  transition:
                    'transform 820ms cubic-bezier(0.16, 0.84, 0.22, 1), opacity 820ms ease-out',
                  opacity: deleteAnimation.stage === 'drop' ? 0 : 1,
                }}
              >
                <img
                  src={deleteAnimation.coverImage}
                  alt={deleteAnimation.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  clipPath: `polygon(0 ${DELETE_SPLIT_LEFT_PCT}%, 100% ${DELETE_SPLIT_RIGHT_PCT}%, 100% 100%, 0 100%)`,
                  transform:
                    deleteAnimation.stage === 'drop'
                      ? `translate3d(${
                          22 * deleteAnimation.splitDirection
                        }px, 312px, 0) rotate(${
                          14 * deleteAnimation.splitDirection
                        }deg)`
                      : deleteAnimation.stage === 'hold'
                        ? `translate3d(${
                            3 * deleteAnimation.splitDirection
                          }px, 7px, 0) rotate(${
                            1.4 * deleteAnimation.splitDirection
                          }deg)`
                        : 'translate3d(0, 0, 0)',
                  transition:
                    'transform 820ms cubic-bezier(0.16, 0.84, 0.22, 1), opacity 820ms ease-out',
                  opacity: deleteAnimation.stage === 'drop' ? 0 : 1,
                }}
              >
                <img
                  src={deleteAnimation.coverImage}
                  alt={deleteAnimation.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div
                className={`absolute left-[-34%] top-[48%] h-[2px] w-[170%] ${
                  deleteAnimation.destroyEffect === 'laser' ||
                  isSciFiMovie(deleteAnimation)
                    ? deleteAnimation.splitDirection === -1
                      ? 'vhs-delete-laser-line-reverse'
                      : 'vhs-delete-laser-line'
                    : deleteAnimation.splitDirection === -1
                      ? 'vhs-delete-samurai-line-reverse'
                      : 'vhs-delete-samurai-line'
                }`}
                style={{
                  top: `${DELETE_SPLIT_LINE_TOP_PCT}%`,
                  opacity: deleteAnimation.stage === 'cut' ? 1 : 0,
                }}
              />
            </div>
          </div>
        ) : null}

        {addAnimation ? (
          <div
            className="pointer-events-none absolute"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: addAnimation.stage === 'fly' ? addAnimation.toX : addAnimation.fromX,
              top: addAnimation.stage === 'fly' ? addAnimation.toY : addAnimation.fromY,
              zIndex: 1400,
              transform: `rotate(${addAnimation.stage === 'fly' ? addAnimation.toRotation : 5}deg)`,
              transition:
                addAnimation.stage === 'fly'
                  ? 'left 520ms cubic-bezier(0.2, 0.85, 0.2, 1), top 520ms cubic-bezier(0.2, 0.85, 0.2, 1), transform 520ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 220ms ease-out'
                  : 'none',
              filter:
                addAnimation.stage === 'fly'
                  ? 'drop-shadow(0 34px 36px rgba(0, 0, 0, 0.56)) drop-shadow(0 10px 16px rgba(0, 0, 0, 0.28))'
                  : 'drop-shadow(0 24px 26px rgba(0, 0, 0, 0.42)) drop-shadow(0 8px 14px rgba(0, 0, 0, 0.2))',
            }}
          >
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0.92 : 1,
              }}
              draggable={false}
            />
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.13,
                background:
                  'linear-gradient(132deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 56%)',
              }}
            />
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.09,
                background:
                  'repeating-linear-gradient(to bottom, rgba(255,255,255,0.11), rgba(255,255,255,0.11) 1px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px)',
              }}
            />
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.18,
                mixBlendMode: 'screen',
              }}
              draggable={false}
            />
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.1,
                mixBlendMode: 'overlay',
              }}
              draggable={false}
            />
          </div>
        ) : null}

        {coverEditor ? (
          <div
            className="absolute inset-0 z-[1680] flex items-center justify-end px-4 py-6 md:px-8"
            data-cover-error={coverEditorError ? '1' : '0'}
            style={{
              opacity: coverEditorDidEnter ? 1 : 0,
              transition: 'opacity 180ms ease-out',
            }}
            onPointerDown={handleCoverEditorBackdropPointerDown}
          >
            <div
              className="relative h-full w-full"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <div
                className="absolute flex items-end"
                style={{
                  left: coverEditorPairLeft,
                  top: coverEditorPairTop,
                  gap: coverEditorGap,
                  opacity: coverEditorDidEnter ? 1 : 0,
                  transform: `translateY(${coverEditorDidEnter ? 0 : 20}px) scale(${coverEditorDidEnter ? 1 : 0.92})`,
                  transition: coverEditor.saving
                    ? 'transform 180ms ease-out, opacity 180ms ease-out'
                    : 'transform 260ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 180ms ease-out',
                }}
              >
                <button
                  type="button"
                  onPointerDown={(event) =>
                    handleCoverEditorVariantPointerDown(event, 'spine')
                  }
                  disabled={coverEditor.saving}
                  className={`group relative cursor-grab appearance-none border-0 bg-transparent p-0 focus-visible:outline-none active:cursor-grabbing ${
                    isCoverEditorSpineFocused
                      ? 'opacity-100'
                      : 'opacity-95 hover:opacity-100'
                  }`}
                  style={{
                    width: coverEditorSpineWidth,
                    height: coverEditorFrontHeight,
                    zIndex: isCoverEditorSpineFocused ? 5 : 3,
                    transform: isCoverEditorSpineFocused
                      ? 'translateY(-14px) scale(1.035)'
                      : 'translateY(0) scale(0.992)',
                    transition:
                      'transform 180ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 160ms ease-out',
                  }}
                  >
                  <div
                    className="relative h-full w-full overflow-hidden rounded-[8px] transition-[box-shadow] duration-180"
                    style={{
                      boxShadow: isCoverEditorSpineFocused
                        ? '0 22px 34px rgba(0,0,0,0.5)'
                        : '0 14px 22px rgba(0,0,0,0.36)',
                    }}
                  >
                    <div
                      className="absolute left-1/2 top-1/2"
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <img
                        src={coverEditorSpineImage}
                        alt={coverEditor.movieTitle}
                        className="h-full w-full object-cover"
                        style={{
                          transform: `translate3d(${Math.round(
                            coverEditor.spineOffsetX
                          )}px, ${Math.round(
                            coverEditor.spineOffsetY
                          )}px, 0) rotate(90deg) scale(${(
                            SHELF_SPINE_IMAGE_SCALE *
                            1.62 *
                            clamp(coverEditor.spineScale, 0.45, 2.6)
                          ).toFixed(4)})`,
                          transformOrigin: 'center',
                        }}
                        draggable={false}
                      />
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onPointerDown={(event) =>
                    handleCoverEditorVariantPointerDown(event, 'front')
                  }
                  disabled={coverEditor.saving}
                  className={`group relative cursor-grab appearance-none border-0 bg-transparent p-0 focus-visible:outline-none active:cursor-grabbing ${
                    isCoverEditorFrontFocused
                      ? 'opacity-100'
                      : 'opacity-95 hover:opacity-100'
                  }`}
                  style={{
                    width: coverEditorFrontWidth,
                    height: coverEditorFrontHeight,
                    zIndex: isCoverEditorFrontFocused ? 5 : 3,
                    transform: isCoverEditorFrontFocused
                      ? 'translateY(-14px) scale(1.035)'
                      : 'translateY(0) scale(0.992)',
                    transition:
                      'transform 180ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 160ms ease-out',
                  }}
                  >
                  <div
                    className="relative h-full w-full overflow-hidden rounded-[8px] transition-[box-shadow] duration-180"
                    style={{
                      boxShadow: isCoverEditorFrontFocused
                        ? '0 22px 34px rgba(0,0,0,0.5)'
                        : '0 14px 22px rgba(0,0,0,0.36)',
                    }}
                  >
                    <img
                      src={coverEditorFrontImage}
                      alt={coverEditor.movieTitle}
                      className="h-full w-full object-cover"
                      style={{
                        transform: `translate3d(${Math.round(
                          coverEditor.frontOffsetX
                        )}px, ${Math.round(
                          coverEditor.frontOffsetY
                        )}px, 0) scale(${clamp(coverEditor.frontScale, 0.45, 2.6).toFixed(
                          4
                        )})`,
                        transformOrigin: 'center',
                      }}
                      draggable={false}
                    />
                  </div>
                </button>
              </div>

            </div>
          </div>
        ) : null}

        <input
          ref={csvImportInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={handleCsvInputChange}
        />
        <input
          ref={searchInputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Søk etter film"
          className="absolute left-0 top-0 h-px w-px border-0 p-0 opacity-0 pointer-events-none"
          tabIndex={pendingSearch ? 0 : -1}
          value={pendingSearch?.query ?? ''}
          onChange={handleSearchInputChange}
          onKeyDown={handleSearchInputKeyDown}
        />
        <button
          type="button"
          onClick={handleEmptySlotClick}
          onDoubleClick={handleAddSlotDoubleClick}
          onDragOver={handleAddSlotDragOver}
          onDrop={handleAddSlotDrop}
          onMouseEnter={() => {
            if (draggingId !== null) {
              return;
            }
            setIsAddSlotPeek(true);
          }}
          onMouseLeave={() => {
            if (draggingId !== null) {
              return;
            }
            setIsAddSlotPeek(false);
          }}
          onFocus={() => {
            if (draggingId !== null) {
              return;
            }
            setIsAddSlotPeek(true);
          }}
          onBlur={() => {
            if (draggingId !== null) {
              return;
            }
            setIsAddSlotPeek(false);
          }}
          className="absolute group cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            left: emptySlot.x,
            top: emptySlot.y + addSlotOffset,
            zIndex: 999,
            transform: isAddSlotResetAnimating
              ? `rotate(5deg) translateY(${Math.round(132 * layoutScale)}px) scale(${
                  isCoverEditorDropActive ? 1.02 : 1
                })`
              : `rotate(5deg) scale(${isCoverEditorDropActive ? 1.02 : 1})`,
            transition:
              'transform 320ms cubic-bezier(0.2, 0.85, 0.2, 1), top 230ms cubic-bezier(0.2, 0.85, 0.2, 1)',
          }}
        >
          <div
            className={`relative h-full w-full transform transition-transform duration-300 ${
              pendingSearch || isAddSlotPeek
                ? 'scale-[1.02]'
                : 'group-hover:scale-[1.02] group-hover:-translate-y-1'
            }`}
          >
            <div
              className={`absolute inset-0 rounded-[2px] transition-[filter,opacity,background-color] duration-300 ${
                addSlotHasCoverImage
                  ? 'bg-transparent drop-shadow-[0_28px_34px_rgba(0,0,0,0.52)] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)]'
                  : 'bg-white drop-shadow-[0_18px_24px_rgba(0,0,0,0.34)] drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)]'
              }`}
            />
            {addSlotCoverImage ? (
              <img
                src={addSlotCoverImage}
                alt={selectedSearchMovie?.title ?? 'Movie preview'}
                className="absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-300"
                draggable={false}
              />
            ) : null}
          </div>
        </button>
        <button
          type="button"
          aria-label="Fjernkontroll - skru på TV"
          onClick={handlePowerOnClick}
          onMouseEnter={() => setIsRemotePeek(true)}
          onMouseLeave={() => setIsRemotePeek(false)}
          onFocus={() => setIsRemotePeek(true)}
          onBlur={() => setIsRemotePeek(false)}
          className="absolute z-[1200] appearance-none border-0 bg-transparent p-0"
          style={{
            width: REMOTE_CONTROL_WIDTH,
            height: REMOTE_CONTROL_HEIGHT,
            left: remoteLeft,
            top: remoteTop,
            transition:
              'top 230ms cubic-bezier(0.2, 0.85, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.85, 0.2, 1)',
            transform: isRemotePeek ? 'translateY(-2px)' : 'translateY(0)',
          }}
        >
          <img
            src={REMOTE_CONTROL_IMAGE}
            alt="Fjernkontroll"
            className="h-full w-full object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.35)] transition-[filter] duration-200 hover:drop-shadow-[0_20px_28px_rgba(0,0,0,0.45)]"
            draggable={false}
          />
        </button>
        {pendingSearch ? (
          <div
            className="pointer-events-none absolute z-[1200] text-right text-white"
            style={{
              width: Math.min(
                620,
                Math.max(160, Math.round(floorWidth * (layoutScale < 1 ? 0.52 : 0.42)))
              ),
              left: Math.max(Math.round(16 * layoutScale), emptySlot.x - Math.round(640 * layoutScale)),
              bottom:
                Math.max(24, Math.round(56 * layoutScale)) +
                (isCompactPhoneLayout ? MOBILE_SHELF_BOTTOM_CLEARANCE - 12 : 0),
              textShadow: '0 2px 14px rgba(0,0,0,0.45)',
            }}
          >
            <div className="truncate text-[clamp(28px,4.6vw,72px)] font-semibold leading-[0.9] tracking-[0.02em] uppercase">
              {pendingSearch.query || ' '}
              <span
                className="ml-1 inline-block align-baseline animate-pulse"
                aria-hidden
              >
                _
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
};

const FloorPage: NextPage = () => <FloorScreen />;

export default FloorPage;
