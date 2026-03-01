import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { z } from 'zod';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w780';

const CACHE_ROOT = path.join(process.cwd(), '.cache', 'tmdb');
const LIST_CACHE_DIRECTORY = path.join(CACHE_ROOT, 'lists');
const SEARCH_CACHE_DIRECTORY = path.join(CACHE_ROOT, 'search');
const POSTER_CACHE_DIRECTORY = path.join(CACHE_ROOT, 'posters');

const DEFAULT_CACHE_TTL_SECONDS = 60 * 30;

export type TmdbMovieListType =
  | 'popular'
  | 'top_rated'
  | 'upcoming'
  | 'now_playing';

export interface TmdbTitleQuery {
  title: string;
  year?: number;
}

const tmdbMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable().optional(),
  overview: z.string(),
  vote_average: z.number(),
  vote_count: z.number(),
  popularity: z.number(),
});

const tmdbMovieListResponseSchema = z.object({
  results: z.array(tmdbMovieSchema),
});

export interface ClubMovie {
  id: number;
  title: string;
  year: number | null;
  releaseDate: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
  voteAverage: number;
  voteCount: number;
  popularity: number;
}

const fileExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const parsePositiveIntEnv = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
};

const getCacheTtlSeconds = (): number =>
  parsePositiveIntEnv(process.env.TMDB_LIST_CACHE_TTL_SECONDS) ??
  DEFAULT_CACHE_TTL_SECONDS;

const getListCachePath = (listType: TmdbMovieListType, page: number): string =>
  path.join(LIST_CACHE_DIRECTORY, `${listType}-page-${page}.json`);

const getSearchCachePath = (title: string, year?: number): string => {
  const key = `${title.trim().toLowerCase()}::${year ?? ''}`;
  const hash = createHash('sha1').update(key).digest('hex');
  return path.join(SEARCH_CACHE_DIRECTORY, `${hash}.json`);
};

const readFreshCache = async <T>(
  cachePath: string,
  payloadSchema: z.ZodType<T>
): Promise<T | null> => {
  if (!(await fileExists(cachePath))) {
    return null;
  }

  const raw = await fs.readFile(cachePath, 'utf8');
  const parsedRaw: unknown = JSON.parse(raw);

  const entrySchema = z.object({
    cachedAt: z.string(),
    payload: payloadSchema,
  });

  const parsed = entrySchema.parse(parsedRaw);

  const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
  const ttlMs = getCacheTtlSeconds() * 1000;

  if (ageMs > ttlMs) {
    return null;
  }

  return parsed.payload ?? null;
};

const writeCache = async <T>(cachePath: string, payload: T): Promise<void> => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  const content = {
    cachedAt: new Date().toISOString(),
    payload,
  };

  await fs.writeFile(cachePath, JSON.stringify(content), 'utf8');
};

const mapTmdbMovieToClubMovie = (
  movie: z.infer<typeof tmdbMovieSchema>
): ClubMovie => ({
  id: movie.id,
  title: movie.title,
  year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
  releaseDate: movie.release_date,
  posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null,
  backdropUrl: movie.backdrop_path
    ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}`
    : null,
  overview: movie.overview,
  voteAverage: movie.vote_average,
  voteCount: movie.vote_count,
  popularity: movie.popularity,
});

const mapTmdbResponseToMovies = (
  data: z.infer<typeof tmdbMovieListResponseSchema>
): ClubMovie[] => data.results.map(mapTmdbMovieToClubMovie);

const getPosterExtension = (posterUrl: string, contentType: string): string => {
  const urlPathExt = path.extname(new URL(posterUrl).pathname).toLowerCase();
  if (urlPathExt === '.jpg' || urlPathExt === '.jpeg' || urlPathExt === '.png') {
    return urlPathExt;
  }

  if (contentType.includes('png')) {
    return '.png';
  }

  return '.jpg';
};

type TmdbAuthMode = 'api-key' | 'read-token';

type TmdbAuth = {
  mode: TmdbAuthMode;
  token: string;
};

const resolveTmdbAuth = (): TmdbAuth => {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (apiKey) {
    return { mode: 'api-key', token: apiKey };
  }

  const readToken =
    process.env.TMDB_READ_ACCESS_TOKEN?.trim() ??
    process.env.TMDB_READ_TOKEN?.trim();
  if (readToken) {
    return { mode: 'read-token', token: readToken };
  }

  throw new Error(
    'TMDB API access mangler. Sett TMDB_API_KEY eller TMDB_READ_ACCESS_TOKEN i .env.'
  );
};

const createTmdbRequest = (url: URL): { url: string; requestInit?: RequestInit } => {
  const auth = resolveTmdbAuth();

  if (auth.mode === 'api-key') {
    url.searchParams.set('api_key', auth.token);
    return { url: url.toString() };
  }

  return {
    url: url.toString(),
    requestInit: {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
    },
  };
};

const normalizeTitle = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const scoreSearchCandidate = (
  movie: z.infer<typeof tmdbMovieSchema>,
  query: TmdbTitleQuery
): number => {
  const queryTitle = normalizeTitle(query.title);
  const movieTitle = normalizeTitle(movie.title);

  let score = 0;

  if (movieTitle === queryTitle) {
    score += 1000;
  }

  if (movieTitle.includes(queryTitle) || queryTitle.includes(movieTitle)) {
    score += 300;
  }

  if (query.year && movie.release_date) {
    const movieYear = Number(movie.release_date.slice(0, 4));
    if (Number.isFinite(movieYear)) {
      const delta = Math.abs(movieYear - query.year);
      score += Math.max(0, 200 - delta * 40);
    }
  }

  score += Math.min(movie.vote_count / 10, 200);
  score += Math.min(movie.popularity / 10, 100);

  return score;
};

const fetchTmdbSearchResults = async (
  query: TmdbTitleQuery
): Promise<z.infer<typeof tmdbMovieListResponseSchema>> => {
  const cachePath = getSearchCachePath(query.title, query.year);
  const cached = await readFreshCache(cachePath, tmdbMovieListResponseSchema);
  if (cached) {
    return cached;
  }

  const url = new URL(`${TMDB_BASE_URL}/search/movie`);

  url.searchParams.set('language', 'en-US');
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('query', query.title);
  if (query.year) {
    url.searchParams.set('year', String(query.year));
  }

  const { url: requestUrl, requestInit } = createTmdbRequest(url);
  const response = await fetch(requestUrl, requestInit);
  if (!response.ok) {
    throw new Error(`TMDB search error (${response.status})`);
  }

  const rawData: unknown = await response.json();
  const data = tmdbMovieListResponseSchema.parse(rawData);
  await writeCache(cachePath, data);

  return data;
};

const searchTmdbMovie = async (query: TmdbTitleQuery): Promise<ClubMovie | null> => {
  const data = await fetchTmdbSearchResults(query);
  if (data.results.length === 0) {
    return null;
  }

  const sorted = [...data.results].sort(
    (a, b) => scoreSearchCandidate(b, query) - scoreSearchCandidate(a, query)
  );

  const bestMatch = sorted[0];
  if (!bestMatch) {
    return null;
  }

  return mapTmdbMovieToClubMovie(bestMatch);
};

export const hasTmdbApiKey = (): boolean => {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  const readToken =
    process.env.TMDB_READ_ACCESS_TOKEN?.trim() ??
    process.env.TMDB_READ_TOKEN?.trim();

  return Boolean((apiKey?.length ?? 0) > 0 || (readToken?.length ?? 0) > 0);
};

export const getTmdbMovieList = async (
  listType: TmdbMovieListType,
  page = 1
): Promise<ClubMovie[]> => {
  const cachePath = getListCachePath(listType, page);
  const cached = await readFreshCache(cachePath, tmdbMovieListResponseSchema);
  if (cached) {
    return mapTmdbResponseToMovies(cached);
  }

  const url = new URL(`${TMDB_BASE_URL}/movie/${listType}`);

  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', String(page));

  const { url: requestUrl, requestInit } = createTmdbRequest(url);
  const response = await fetch(requestUrl, requestInit);
  if (!response.ok) {
    throw new Error(`TMDB API error (${response.status})`);
  }

  const rawData: unknown = await response.json();
  const data = tmdbMovieListResponseSchema.parse(rawData);

  await writeCache(cachePath, data);

  return mapTmdbResponseToMovies(data);
};

export const getTmdbMoviesByTitleQueries = async (
  queries: TmdbTitleQuery[]
): Promise<ClubMovie[]> => {
  const output: ClubMovie[] = [];

  for (const query of queries) {
    const movie = await searchTmdbMovie(query);
    if (movie) {
      output.push(movie);
    }
  }

  return output;
};

export const getTmdbMoviesBySearchQuery = async (
  query: string,
  limit = 8
): Promise<ClubMovie[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const cappedLimit = Math.max(1, Math.min(Math.floor(limit), 20));
  const data = await fetchTmdbSearchResults({ title: trimmedQuery });
  const scored = [...data.results].sort(
    (a, b) =>
      scoreSearchCandidate(b, { title: trimmedQuery }) -
      scoreSearchCandidate(a, { title: trimmedQuery })
  );

  const output: ClubMovie[] = [];
  const seen = new Set<number>();

  for (const movie of scored) {
    if (seen.has(movie.id)) {
      continue;
    }

    seen.add(movie.id);
    output.push(mapTmdbMovieToClubMovie(movie));

    if (output.length >= cappedLimit) {
      break;
    }
  }

  return output;
};

export const getTmdbMovieById = async (
  movieId: number
): Promise<ClubMovie | null> => {
  if (!Number.isFinite(movieId) || movieId <= 0) {
    return null;
  }

  const url = new URL(`${TMDB_BASE_URL}/movie/${Math.floor(movieId)}`);
  url.searchParams.set('language', 'en-US');

  const { url: requestUrl, requestInit } = createTmdbRequest(url);
  const response = await fetch(requestUrl, requestInit);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`TMDB movie lookup error (${response.status})`);
  }

  const rawData: unknown = await response.json();
  const parsed = tmdbMovieSchema.parse(rawData);
  return mapTmdbMovieToClubMovie(parsed);
};

export const getCachedTmdbImagePath = async (
  movieId: number,
  imageUrl: string,
  imageKind: 'poster' | 'backdrop' = 'poster'
): Promise<string> => {
  await fs.mkdir(POSTER_CACHE_DIRECTORY, { recursive: true });

  const hash = createHash('sha1').update(imageUrl).digest('hex').slice(0, 12);

  const possibleFiles = await fs.readdir(POSTER_CACHE_DIRECTORY);
  const existing = possibleFiles.find((name) =>
    name.startsWith(`${movieId}-${imageKind}-${hash}.`)
  );
  if (existing) {
    return path.join(POSTER_CACHE_DIRECTORY, existing);
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch TMDB ${imageKind} (${response.status})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('TMDB poster URL did not return an image.');
  }

  const extension = getPosterExtension(imageUrl, contentType);
  const fileName = `${movieId}-${imageKind}-${hash}${extension}`;
  const absolutePath = path.join(POSTER_CACHE_DIRECTORY, fileName);

  const posterBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(absolutePath, posterBuffer);

  return absolutePath;
};

export const getCachedTmdbPosterPath = async (
  movieId: number,
  posterUrl: string
): Promise<string> => getCachedTmdbImagePath(movieId, posterUrl, 'poster');
