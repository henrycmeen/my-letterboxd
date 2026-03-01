import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'club-floor-board.json');
const DEFAULT_BOARD_ID = 'default';
const MAX_MOVIES = 200;

const boardMovieInputSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1),
  coverImage: z.string().trim().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  score: z.number().min(0).max(100).optional(),
});

const boardStateSchema = z.object({
  boardId: z.string().trim().min(1),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  movies: z.array(
    boardMovieInputSchema.extend({
      z: z.number(),
      rank: z.number().int().positive(),
      score: z.number().min(0).max(100).default(0),
      updatedAt: z.string(),
    })
  ),
  leaderMovieId: z.number().int().nullable(),
});

const boardStoreSchema = z.record(boardStateSchema).default({});
const boardStoreFileSchema = z.object({
  boards: boardStoreSchema.default({}),
});

export type BoardMovie = z.infer<typeof boardMovieInputSchema>;

export type BoardMovieStored = z.infer<
  typeof boardStateSchema
>['movies'][number];

export type BoardState = z.infer<typeof boardStateSchema>;

export interface BoardStoreFile {
  boards: Record<string, BoardState>;
}

export interface ReplaceBoardPayload {
  boardId?: string;
  movies: BoardMovie[];
  expectedVersion?: number;
}

export interface ConflictErrorOptions {
  expectedVersion: number;
  currentVersion: number;
}

export class BoardConflictError extends Error {
  public readonly expectedVersion: number;
  public readonly currentVersion: number;

  public constructor(options: ConflictErrorOptions) {
    super(`Board version mismatch: expected ${options.expectedVersion}, got ${options.currentVersion}.`);
    this.name = 'BoardConflictError';
    this.expectedVersion = options.expectedVersion;
    this.currentVersion = options.currentVersion;
  }
}

const nowIso = (): string => new Date().toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const ensureNumber = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const computeHierarchy = (
  movies: BoardMovie[]
): Array<BoardMovieStored & { x: number; y: number }> => {
  const ranked = [...movies]
    .slice(0, MAX_MOVIES)
    .map((movie) => ({
      ...movie,
      x: clamp(ensureNumber(movie.x), -1000, 10000),
      y: clamp(ensureNumber(movie.y), -1000, 10000),
      rotation: ensureNumber(movie.rotation),
      score: clamp(ensureNumber(movie.score ?? 0), 0, 100),
    }))
    .sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x || a.id - b.id);

  const total = ranked.length;
  return ranked.map((movie, index) => ({
    ...movie,
    z: total - index,
    rank: index + 1,
    updatedAt: nowIso(),
  }));
};

const computeLeaderMovieId = (
  movies: Pick<BoardMovieStored, 'id' | 'y'>[]
): number | null => (movies.length === 0 ? null : movies[0]!.id);

const getStorePath = () => STORE_FILE;

const loadStore = async (): Promise<BoardStoreFile> => {
  try {
    const raw = await fs.readFile(getStorePath(), 'utf8');
    const parsedRaw: unknown = JSON.parse(raw);

    // Backward compatibility: accept both wrapped and bare board records.
    const wrapped = boardStoreFileSchema.safeParse(parsedRaw);
    if (wrapped.success) {
      return { boards: wrapped.data.boards };
    }

    const bare = boardStoreSchema.safeParse(parsedRaw);
    if (bare.success) {
      return { boards: bare.data };
    }

    return { boards: {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { boards: {} };
    }

    return { boards: {} };
  }
};

const saveStore = async (store: BoardStoreFile): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
};

const createEmptyBoard = (boardId: string): BoardState => ({
  boardId,
  version: 0,
  updatedAt: nowIso(),
  movies: [],
  leaderMovieId: null,
});

export const getBoardState = async (boardId = DEFAULT_BOARD_ID): Promise<BoardState> => {
  const store = await loadStore();
  return store.boards[boardId] ?? createEmptyBoard(boardId);
};

export const replaceBoardMovies = async (
  payload: ReplaceBoardPayload
): Promise<BoardState> => {
  const boardId = (payload.boardId ?? DEFAULT_BOARD_ID).trim() || DEFAULT_BOARD_ID;
  const parsedPayload = z
    .object({
      movies: z.array(boardMovieInputSchema).max(MAX_MOVIES),
      expectedVersion: z.number().int().nonnegative().optional(),
    })
    .parse({ movies: payload.movies, expectedVersion: payload.expectedVersion });

  const store = await loadStore();
  const existing = store.boards[boardId] ?? createEmptyBoard(boardId);

  if (
    parsedPayload.expectedVersion !== undefined &&
    existing.version !== parsedPayload.expectedVersion
  ) {
    throw new BoardConflictError({
      expectedVersion: parsedPayload.expectedVersion,
      currentVersion: existing.version,
    });
  }

  const orderedMovies = computeHierarchy(
    parsedPayload.movies.map((movie) => ({
      ...movie,
      x: ensureNumber(movie.x),
      y: ensureNumber(movie.y),
      rotation: ensureNumber(movie.rotation),
    }))
  );

  const next: BoardState = {
    boardId,
    version: existing.version + 1,
    updatedAt: nowIso(),
    movies: orderedMovies,
    leaderMovieId: computeLeaderMovieId(orderedMovies),
  };

  const updatedStore: BoardStoreFile = {
    boards: {
      ...store.boards,
      [boardId]: next,
    },
  };

  await saveStore(updatedStore);
  return next;
};

export const clearBoard = async (boardId = DEFAULT_BOARD_ID): Promise<BoardState> => {
  const store = await loadStore();
  const emptyBoard = createEmptyBoard(boardId);
  const updatedStore = {
    boards: {
      ...store.boards,
      [boardId]: emptyBoard,
    },
  };

  await saveStore(updatedStore);
  return emptyBoard;
};
