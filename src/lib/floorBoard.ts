import { promises as fs } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  CLUB_DATA_DIRECTORY,
  CLUB_SQLITE_PATH,
  LEGACY_FLOOR_BOARD_JSON_PATH,
} from '@/lib/storagePaths';

const DEFAULT_BOARD_ID = 'default';
const MAX_MOVIES = 200;
const LEGACY_MIGRATION_META_KEY = 'legacy_json_migrated';

const boardMovieInputSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1),
  coverImage: z.string().trim().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  score: z.number().min(0).max(100).optional(),
});

const boardMovieStoredSchema = boardMovieInputSchema.extend({
  z: z.number(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100).default(0),
  updatedAt: z.string(),
});

const boardStateSchema = z.object({
  boardId: z.string().trim().min(1),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  movies: z.array(boardMovieStoredSchema),
  leaderMovieId: z.number().int().nullable(),
});

const boardStoreSchema = z.record(boardStateSchema).default({});
const boardStoreFileSchema = z.object({
  boards: boardStoreSchema.default({}),
});

type BoardMovieInput = z.infer<typeof boardMovieInputSchema>;

export type BoardMovie = BoardMovieInput;
export type BoardMovieStored = z.infer<typeof boardMovieStoredSchema>;
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
    super(
      `Board version mismatch: expected ${options.expectedVersion}, got ${options.currentVersion}.`
    );
    this.name = 'BoardConflictError';
    this.expectedVersion = options.expectedVersion;
    this.currentVersion = options.currentVersion;
  }
}

interface FloorBoardRow {
  board_id: string;
  version: number;
  updated_at: string;
  leader_movie_id: number | null;
  movies_json: string;
}

const nowIso = (): string => new Date().toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const ensureNumber = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const normalizeBoardId = (boardId?: string): string => {
  const normalized = boardId?.trim();
  return normalized ?? DEFAULT_BOARD_ID;
};

const runInTransaction = <T>(db: DatabaseSync, operation: () => T): T => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const computeHierarchy = (movies: BoardMovie[]): BoardMovieStored[] => {
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
  movies: Pick<BoardMovieStored, 'id'>[]
): number | null => (movies.length === 0 ? null : movies[0]!.id);

const createEmptyBoard = (boardId: string): BoardState => ({
  boardId,
  version: 0,
  updatedAt: nowIso(),
  movies: [],
  leaderMovieId: null,
});

const buildBoardState = (input: {
  boardId: string;
  version: number;
  movies: BoardMovie[];
  updatedAt?: string;
}): BoardState => {
  const orderedMovies = computeHierarchy(input.movies);

  return {
    boardId: input.boardId,
    version: input.version,
    updatedAt: input.updatedAt ?? nowIso(),
    movies: orderedMovies,
    leaderMovieId: computeLeaderMovieId(orderedMovies),
  };
};

const parseLegacyStore = (rawData: unknown): BoardStoreFile => {
  const wrapped = boardStoreFileSchema.safeParse(rawData);
  if (wrapped.success) {
    return { boards: wrapped.data.boards };
  }

  const bare = boardStoreSchema.safeParse(rawData);
  if (bare.success) {
    return { boards: bare.data };
  }

  return { boards: {} };
};

const loadLegacyStore = async (): Promise<BoardStoreFile | null> => {
  try {
    const raw = await fs.readFile(LEGACY_FLOOR_BOARD_JSON_PATH, 'utf8');
    const parsedRaw: unknown = JSON.parse(raw);
    return parseLegacyStore(parsedRaw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    return null;
  }
};

const toBoardRow = (state: BoardState): FloorBoardRow => ({
  board_id: state.boardId,
  version: state.version,
  updated_at: state.updatedAt,
  leader_movie_id: state.leaderMovieId,
  movies_json: JSON.stringify(state.movies),
});

const fromBoardRow = (row: FloorBoardRow): BoardState => {
  const moviesRaw: unknown = JSON.parse(row.movies_json);
  const movies = z.array(boardMovieStoredSchema).parse(moviesRaw);

  return boardStateSchema.parse({
    boardId: row.board_id,
    version: row.version,
    updatedAt: row.updated_at,
    movies,
    leaderMovieId: row.leader_movie_id,
  });
};

const readMeta = (db: DatabaseSync, key: string): string | null => {
  const row = db
    .prepare('SELECT value FROM floor_meta WHERE key = ?')
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
};

const writeMeta = (db: DatabaseSync, key: string, value: string): void => {
  db.prepare(
    `INSERT INTO floor_meta (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
};

const persistBoard = (db: DatabaseSync, board: BoardState): void => {
  const row = toBoardRow(board);

  db.prepare(
    `INSERT INTO floor_boards (
      board_id,
      version,
      updated_at,
      leader_movie_id,
      movies_json
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(board_id) DO UPDATE SET
      version = excluded.version,
      updated_at = excluded.updated_at,
      leader_movie_id = excluded.leader_movie_id,
      movies_json = excluded.movies_json`
  ).run(
    row.board_id,
    row.version,
    row.updated_at,
    row.leader_movie_id,
    row.movies_json
  );
};

const loadBoard = (db: DatabaseSync, boardId: string): BoardState | null => {
  const row = db
    .prepare(
      `SELECT board_id, version, updated_at, leader_movie_id, movies_json
       FROM floor_boards
       WHERE board_id = ?`
    )
    .get(boardId) as FloorBoardRow | undefined;

  if (!row) {
    return null;
  }

  try {
    return fromBoardRow(row);
  } catch {
    return null;
  }
};

const migrateLegacyStoreIfNeeded = async (db: DatabaseSync): Promise<void> => {
  if (readMeta(db, LEGACY_MIGRATION_META_KEY) === '1') {
    return;
  }

  const hasAnyBoard = db
    .prepare('SELECT 1 AS value FROM floor_boards LIMIT 1')
    .get() as { value: number } | undefined;

  if (hasAnyBoard) {
    writeMeta(db, LEGACY_MIGRATION_META_KEY, '1');
    return;
  }

  const legacyStore = await loadLegacyStore();
  if (!legacyStore) {
    writeMeta(db, LEGACY_MIGRATION_META_KEY, '1');
    return;
  }

  for (const [boardIdRaw, board] of Object.entries(legacyStore.boards)) {
    const boardId = normalizeBoardId(boardIdRaw);
    const movies = board.movies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      coverImage: movie.coverImage,
      x: movie.x,
      y: movie.y,
      rotation: movie.rotation,
      score: movie.score,
    }));

    const migratedBoard = buildBoardState({
      boardId,
      version: Math.max(0, Math.floor(board.version)),
      movies,
      updatedAt: board.updatedAt,
    });

    persistBoard(db, migratedBoard);
  }

  writeMeta(db, LEGACY_MIGRATION_META_KEY, '1');
};

let databasePromise: Promise<DatabaseSync> | null = null;

const getDatabase = async (): Promise<DatabaseSync> => {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = (async () => {
    await fs.mkdir(CLUB_DATA_DIRECTORY, { recursive: true });

    const db = new DatabaseSync(CLUB_SQLITE_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');

    db.exec(
      `CREATE TABLE IF NOT EXISTS floor_boards (
        board_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        leader_movie_id INTEGER,
        movies_json TEXT NOT NULL
      )`
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS floor_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`
    );

    await migrateLegacyStoreIfNeeded(db);

    return db;
  })();

  return databasePromise;
};

export const getBoardState = async (
  boardId = DEFAULT_BOARD_ID
): Promise<BoardState> => {
  const db = await getDatabase();
  const normalizedBoardId = normalizeBoardId(boardId);
  const existing = loadBoard(db, normalizedBoardId);

  return existing ?? createEmptyBoard(normalizedBoardId);
};

export const replaceBoardMovies = async (
  payload: ReplaceBoardPayload
): Promise<BoardState> => {
  const boardId = normalizeBoardId(payload.boardId);

  const parsedPayload = z
    .object({
      movies: z.array(boardMovieInputSchema).max(MAX_MOVIES),
      expectedVersion: z.number().int().nonnegative().optional(),
    })
    .parse({ movies: payload.movies, expectedVersion: payload.expectedVersion });

  const db = await getDatabase();
  return runInTransaction(db, () => {
    const existing = loadBoard(db, boardId) ?? createEmptyBoard(boardId);

    if (
      parsedPayload.expectedVersion !== undefined &&
      existing.version !== parsedPayload.expectedVersion
    ) {
      throw new BoardConflictError({
        expectedVersion: parsedPayload.expectedVersion,
        currentVersion: existing.version,
      });
    }

    const normalizedMovies = parsedPayload.movies.map((movie) => ({
      ...movie,
      x: ensureNumber(movie.x),
      y: ensureNumber(movie.y),
      rotation: ensureNumber(movie.rotation),
      score: movie.score,
    }));

    const nextBoard = buildBoardState({
      boardId,
      version: existing.version + 1,
      movies: normalizedMovies,
    });

    persistBoard(db, nextBoard);
    return nextBoard;
  });
};

export const clearBoard = async (
  boardId = DEFAULT_BOARD_ID
): Promise<BoardState> => {
  const db = await getDatabase();
  const normalizedBoardId = normalizeBoardId(boardId);
  const emptyBoard = createEmptyBoard(normalizedBoardId);

  persistBoard(db, emptyBoard);
  return emptyBoard;
};
