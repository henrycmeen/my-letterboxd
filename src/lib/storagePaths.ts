import path from 'node:path';

const resolveFromCwd = (...parts: string[]): string =>
  path.join(process.cwd(), ...parts);

const resolveOptionalPath = (
  rawPath: string | undefined,
  fallbackPath: string
): string => {
  const trimmed = rawPath?.trim();
  if (!trimmed) {
    return fallbackPath;
  }

  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);
};

export const APP_CACHE_ROOT = resolveFromCwd('.cache');
export const TMDB_CACHE_ROOT = path.join(APP_CACHE_ROOT, 'tmdb');

export const TMDB_LIST_CACHE_DIRECTORY = path.join(TMDB_CACHE_ROOT, 'lists');
export const TMDB_SEARCH_CACHE_DIRECTORY = path.join(TMDB_CACHE_ROOT, 'search');
export const TMDB_IMAGE_CACHE_DIRECTORY = path.join(TMDB_CACHE_ROOT, 'images');
export const TMDB_POSTER_CACHE_DIRECTORY = path.join(
  TMDB_IMAGE_CACHE_DIRECTORY,
  'posters'
);
export const TMDB_BACKDROP_CACHE_DIRECTORY = path.join(
  TMDB_IMAGE_CACHE_DIRECTORY,
  'backdrops'
);

// Backward compatibility for previously cached images in .cache/tmdb/posters.
export const TMDB_LEGACY_POSTER_CACHE_DIRECTORY = path.join(
  TMDB_CACHE_ROOT,
  'posters'
);

export const VHS_CACHE_ROOT = path.join(APP_CACHE_ROOT, 'vhs');
export const VHS_RENDER_CACHE_DIRECTORY = path.join(VHS_CACHE_ROOT, 'generated');

export const APP_DATA_ROOT = resolveFromCwd('data');
export const CLUB_DATA_DIRECTORY = path.join(APP_DATA_ROOT, 'club');
export const LEGACY_FLOOR_BOARD_JSON_PATH = path.join(
  APP_DATA_ROOT,
  'club-floor-board.json'
);
export const CLUB_SQLITE_PATH = resolveOptionalPath(
  process.env.CLUB_DB_PATH,
  path.join(CLUB_DATA_DIRECTORY, 'filmklubb.sqlite')
);
